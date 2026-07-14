"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Store,
  Rocket,
  CalendarClock,
  ListTodo,
  Gift,
  Home,
  Wallet,
  Trophy,
  DollarSign,
  Medal,
  TrendingUp,
  Award,
  Target,
  ShieldCheck,
  Plus,
  X,
  Eye,
  ArrowLeftRight,
  Crown,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import AppShell from "./AppShell";
import ChangePassword from "./ChangePassword";
import EmpresaDashboard, { EMPRESA_TABS } from "./EmpresaDashboard";
import ColaboradorView from "./ColaboradorView";
import GerenteView from "./GerenteView";
import ProgressBar from "./ProgressBar";
import MonthNav from "./MonthNav";
import SelectField from "./SelectField";
import { calcIndividualPct, formatBRL, currentGoalTarget } from "./scoring";
import { greeting, todayStr, firstDayOfMonth, remainingDaysInMonth, monthLabel } from "./date";

const ROLE_LABEL = { socio: "Sócio", supervisor: "Supervisor" };

const BASE_TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "metas", label: "Metas", Icon: Wallet },
  { key: "rankings", label: "Rankings", Icon: Trophy },
  { key: "faturamento", label: "Faturamento", Icon: DollarSign },
];

function redirectFor(role) {
  if (role === "master_admin") return "/admin";
  if (role === "gerente") return "/gerente";
  if (role === "socio") return "/socio";
  if (role === "supervisor") return "/supervisor";
  return "/colaborador";
}

// impersonate/viewerProfile/onExitImpersonation: usado quando o Master Admin quer "ver como" um
// sócio ou supervisor específico (mesmo padrão de ColaboradorView/GerenteView, só que aqui a página
// inteira é o "view as", já que sócio/supervisor não tem uma tela própria separada).
export default function HierarchyHome({ role, impersonate, viewerProfile, onExitImpersonation }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [lojas, setLojas] = useState([]); // {loja_id, loja_name, permission}
  const [selectedLojaId, setSelectedLojaId] = useState("");
  const [tab, setTab] = useState("atividades");
  const [selectedMonth, setSelectedMonth] = useState(firstDayOfMonth(todayStr()));
  const didInit = useRef(false);

  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [viewingGerente, setViewingGerente] = useState(null);

  const [hero, setHero] = useState({
    metaLoja: 0,
    soldLoja: 0,
    pendingToday: 0,
    commissionSoFar: 0,
    prizesSoFar: 0,
    commissionPct: 0,
    commissionTierLabel: "não atingimento",
    barPct: 0,
    leaderName: null,
  });

  const [goalsList, setGoalsList] = useState([]);
  const [activeGoal, setActiveGoal] = useState(null);
  const [storeRanking, setStoreRanking] = useState([]);

  const [rankings, setRankings] = useState({ sellers: [], prizes: [], bars: [], commissions: [] });
  const [rankingsLoading, setRankingsLoading] = useState(false);

  const [faturamento, setFaturamento] = useState({ total: 0, byLoja: [] });
  const [faturamentoLoading, setFaturamentoLoading] = useState(false);

  const greet = greeting();
  const today = todayStr();
  const month = selectedMonth || firstDayOfMonth(today);
  const isCurrentMonth = month === firstDayOfMonth(today);

  const selectedLoja = lojas.find((l) => l.loja_id === selectedLojaId);
  const canManageSelected = selectedLoja?.permission === "gerenciar";
  // só o sócio cadastra/gerencia supervisores — o supervisor não vê essa aba
  const tabs = role === "socio" ? [...BASE_TABS, { key: "supervisores", label: "Supervisores", Icon: ShieldCheck }] : BASE_TABS;

  const loadLojas = useCallback(async (prof) => {
    // sócio enxerga automaticamente TODAS as lojas da própria empresa, com controle total —
    // não depende de loja_access (isso é exclusivo do supervisor, que só vê as lojas atribuídas).
    if (role === "socio") {
      const { data: lojaRows } = await supabase.from("lojas").select("id, name").eq("empresa_id", prof.empresa_id);
      const enriched = (lojaRows || []).map((l) => ({ loja_id: l.id, loja_name: l.name, permission: "gerenciar" }));
      enriched.sort((a, b) => a.loja_name.localeCompare(b.loja_name));
      setLojas(enriched);
      return enriched;
    }

    const { data: access } = await supabase.from("loja_access").select("loja_id, permission").eq("profile_id", prof.id);
    const lojaIds = (access || []).map((a) => a.loja_id);
    if (!lojaIds.length) { setLojas([]); return []; }
    const { data: lojaRows } = await supabase.from("lojas").select("id, name").in("id", lojaIds);
    const enriched = (lojaRows || []).map((l) => ({
      loja_id: l.id,
      loja_name: l.name,
      permission: (access || []).find((a) => a.loja_id === l.id)?.permission || "ver",
    }));
    enriched.sort((a, b) => a.loja_name.localeCompare(b.loja_name));
    setLojas(enriched);
    return enriched;
  }, [role]);

  // herocard do supervisor: agregado da LOJA TODA (todos os gerentes/equipes juntos), não só um time.
  // a barra de progresso aqui é vendido/meta (não média de barra individual).
  const loadHero = useCallback(async (lojaId, monthArg) => {
    if (!lojaId) {
      setHero({ metaLoja: 0, soldLoja: 0, pendingToday: 0, commissionSoFar: 0, prizesSoFar: 0, commissionPct: 0, commissionTierLabel: "não atingimento", barPct: 0 });
      setGoalsList([]);
      setActiveGoal(null);
      setStoreRanking([]);
      return;
    }
    const { data: emps } = await supabase.from("profiles").select("id, full_name").eq("loja_id", lojaId).eq("role", "colaborador").eq("active", true);
    const empIds = (emps || []).map((e) => e.id);

    const nextMonth = new Date(monthArg + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    let pendingToday = 0;
    if (monthArg === firstDayOfMonth(todayStr()) && empIds.length) {
      const { data: activeTasks } = await supabase.from("tasks").select("id").in("employee_id", empIds).eq("active", true);
      const taskIds = (activeTasks || []).map((t) => t.id);
      if (taskIds.length) {
        const { data: todayRows } = await supabase.from("task_completions").select("task_id, completed").in("task_id", taskIds).eq("completion_date", todayStr());
        const doneTaskIds = new Set((todayRows || []).filter((r) => r.completed).map((r) => r.task_id));
        pendingToday = taskIds.filter((id) => !doneTaskIds.has(id)).length;
      }
    }

    const { data: goalRows } = await supabase
      .from("sales_goals")
      .select("id, name, store_total, commission_pct_gerente")
      .eq("loja_id", lojaId)
      .eq("month", monthArg)
      .order("store_total", { ascending: true });

    let entryRows = [];
    if (empIds.length) {
      const { data } = await supabase
        .from("sales_entries")
        .select("employee_id, daily_amount")
        .in("employee_id", empIds)
        .gte("entry_date", monthArg)
        .lt("entry_date", nextMonthStr);
      entryRows = data || [];
    }
    const soldLoja = entryRows.reduce((s, e) => s + Number(e.daily_amount || 0), 0);

    // ranking de vendas de toda a loja (todos os colaboradores, de todas as equipes/gerentes) —
    // mesma agregação usada pro soldLoja acima, só reaproveitada por colaborador.
    const soldByEmp = {};
    entryRows.forEach((e) => { soldByEmp[e.employee_id] = (soldByEmp[e.employee_id] || 0) + Number(e.daily_amount || 0); });
    const ranking = (emps || [])
      .map((emp) => ({ id: emp.id, name: emp.full_name, sold: soldByEmp[emp.id] || 0 }))
      .sort((a, b) => b.sold - a.sold);
    setStoreRanking(ranking);

    // metas são níveis (Meta, Super Meta, Hiper Meta…) — não somam. O alvo "em jogo" é sempre o
    // próximo nível ainda não batido; se todos já foram batidos, fica valendo o último deles.
    const metaLoja = currentGoalTarget((goalRows || []).map((g) => g.store_total), soldLoja);
    setGoalsList(goalRows || []);
    setActiveGoal((goalRows || []).find((g) => soldLoja < Number(g.store_total)) || (goalRows && goalRows.length ? goalRows[goalRows.length - 1] : null));

    const { data: commissionRow } = await supabase
      .from("commission_settings")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("month", monthArg)
      .maybeSingle();

    let achievedTier = null;
    (goalRows || []).forEach((g) => {
      if (soldLoja >= Number(g.store_total || 0)) achievedTier = g;
    });
    const commissionPct = achievedTier
      ? Number(achievedTier.commission_pct_gerente) || 0
      : Number(commissionRow?.non_achievement_gerente_pct) || 0;
    const commissionTierLabel = achievedTier ? achievedTier.name : "não atingimento";
    const commissionSoFar = soldLoja * (commissionPct / 100);

    let prizesSoFar = 0;
    if (empIds.length) {
      const { data: prizeRows } = await supabase.from("employee_prizes").select("amount").in("employee_id", empIds).eq("month", monthArg);
      prizesSoFar = (prizeRows || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    }

    const barPct = metaLoja > 0 ? Math.min(100, (soldLoja / metaLoja) * 100) : 0;

    // líder de vendas da loja selecionada — mesmo dado do topo do "Ranking de vendas" (já
    // ordenado por sold desc), só reaproveitado aqui pro herocard, igual o gerente já tem.
    const leaderName = ranking.length && ranking[0].sold > 0 ? ranking[0].name : null;

    setHero({ metaLoja, soldLoja, pendingToday, commissionSoFar, prizesSoFar, commissionPct, commissionTierLabel, barPct, leaderName });
  }, []);

  // rankings cruzando todas as lojas que essa pessoa acessa: top vendedor, mais premiado, melhor
  // barra individual (só colaboradores) e mais comissionado até agora.
  const loadRankings = useCallback(async (lojaIds, monthArg) => {
    if (!lojaIds.length) { setRankings({ sellers: [], prizes: [], bars: [], commissions: [] }); return; }
    setRankingsLoading(true);
    const nextMonth = new Date(monthArg + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    const { data: emps } = await supabase
      .from("profiles")
      .select("id, full_name, loja_id")
      .in("loja_id", lojaIds)
      .eq("role", "colaborador")
      .eq("active", true);
    const empIds = (emps || []).map((e) => e.id);
    const { data: lojaRows } = await supabase.from("lojas").select("id, name").in("id", lojaIds);
    const lojaNameById = {};
    (lojaRows || []).forEach((l) => { lojaNameById[l.id] = l.name; });

    if (!empIds.length) { setRankings({ sellers: [], prizes: [], bars: [], commissions: [] }); setRankingsLoading(false); return; }

    const [{ data: entryRows }, { data: prizeRows }, { data: settingsRows }, { data: taskRows }, { data: warnRows }, { data: goalRows }, { data: allocRows }, { data: commissionRows }] = await Promise.all([
      supabase.from("sales_entries").select("employee_id, daily_amount, loja_id").in("employee_id", empIds).gte("entry_date", monthArg).lt("entry_date", nextMonthStr),
      supabase.from("employee_prizes").select("employee_id, amount").in("employee_id", empIds).eq("month", monthArg),
      supabase.from("app_settings").select("loja_id, warning_penalty_points").in("loja_id", lojaIds),
      supabase.from("tasks").select("id, employee_id").in("employee_id", empIds),
      supabase.from("warnings").select("employee_id, loja_id").in("employee_id", empIds).gte("warning_date", monthArg).lt("warning_date", nextMonthStr),
      supabase.from("sales_goals").select("id, loja_id, store_total, commission_pct_colaborador").in("loja_id", lojaIds).eq("month", monthArg).order("store_total", { ascending: true }),
      supabase.from("sales_goal_allocations").select("goal_id, employee_id, amount").in("employee_id", empIds),
      supabase.from("commission_settings").select("loja_id, non_achievement_colaborador_pct").in("loja_id", lojaIds).eq("month", monthArg),
    ]);

    const penaltyByLoja = {};
    (settingsRows || []).forEach((s) => { penaltyByLoja[s.loja_id] = s.warning_penalty_points ?? 10; });
    const taskIds = (taskRows || []).map((t) => t.id);
    let completionsByTask = {};
    if (taskIds.length) {
      const { data: compRows } = await supabase
        .from("task_completions")
        .select("task_id, completed, completion_date")
        .in("task_id", taskIds)
        .gte("completion_date", monthArg)
        .lt("completion_date", nextMonthStr);
      (compRows || []).forEach((c) => {
        if (!completionsByTask[c.task_id]) completionsByTask[c.task_id] = [];
        completionsByTask[c.task_id].push(c);
      });
    }
    const nonAchByLoja = {};
    (commissionRows || []).forEach((c) => { nonAchByLoja[c.loja_id] = Number(c.non_achievement_colaborador_pct) || 0; });
    const goalsByLoja = {};
    (goalRows || []).forEach((g) => { (goalsByLoja[g.loja_id] ||= []).push(g); });

    const sellers = [];
    const prizesList = [];
    const bars = [];
    const commissions = [];

    (emps || []).forEach((emp) => {
      const sold = (entryRows || []).filter((e) => e.employee_id === emp.id).reduce((s, e) => s + Number(e.daily_amount || 0), 0);
      const prizeTotal = (prizeRows || []).filter((p) => p.employee_id === emp.id).reduce((s, p) => s + Number(p.amount || 0), 0);
      const myTaskIds = (taskRows || []).filter((t) => t.employee_id === emp.id).map((t) => t.id);
      let expected = 0, completed = 0;
      myTaskIds.forEach((tid) => {
        const rows = completionsByTask[tid] || [];
        expected += rows.length;
        completed += rows.filter((r) => r.completed).length;
      });
      const wCount = (warnRows || []).filter((w) => w.employee_id === emp.id).length;
      const penalty = penaltyByLoja[emp.loja_id] ?? 10;
      const pct = calcIndividualPct({ completed, expected, warningsCount: wCount, penaltyPerWarning: penalty });

      const myGoals = (goalsByLoja[emp.loja_id] || []);
      const myAllocs = (allocRows || []).filter((a) => a.employee_id === emp.id);
      let achievedTier = null;
      myGoals.forEach((g) => {
        const alloc = myAllocs.find((a) => a.goal_id === g.id);
        if (alloc && sold >= Number(alloc.amount || 0)) achievedTier = g;
      });
      const commPct = achievedTier ? Number(achievedTier.commission_pct_colaborador) || 0 : (nonAchByLoja[emp.loja_id] || 0);
      const commission = sold * (commPct / 100);

      const lojaName = lojaNameById[emp.loja_id] || "—";
      if (sold > 0) sellers.push({ id: emp.id, name: emp.full_name, lojaName, value: sold });
      if (prizeTotal > 0) prizesList.push({ id: emp.id, name: emp.full_name, lojaName, value: prizeTotal });
      if (expected > 0) bars.push({ id: emp.id, name: emp.full_name, lojaName, value: pct });
      if (commission > 0) commissions.push({ id: emp.id, name: emp.full_name, lojaName, value: commission });
    });

    sellers.sort((a, b) => b.value - a.value);
    prizesList.sort((a, b) => b.value - a.value);
    bars.sort((a, b) => b.value - a.value);
    commissions.sort((a, b) => b.value - a.value);

    setRankings({ sellers: sellers.slice(0, 10), prizes: prizesList.slice(0, 10), bars: bars.slice(0, 10), commissions: commissions.slice(0, 10) });
    setRankingsLoading(false);
  }, []);

  const loadFaturamento = useCallback(async (lojaIds, monthArg) => {
    if (!lojaIds.length) { setFaturamento({ total: 0, byLoja: [] }); return; }
    setFaturamentoLoading(true);
    const nextMonth = new Date(monthArg + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    const { data: lojaRows } = await supabase.from("lojas").select("id, name").in("id", lojaIds);
    const { data: entryRows } = await supabase
      .from("sales_entries")
      .select("loja_id, daily_amount")
      .in("loja_id", lojaIds)
      .gte("entry_date", monthArg)
      .lt("entry_date", nextMonthStr);

    const byLoja = (lojaRows || [])
      .map((l) => ({
        loja_id: l.id,
        loja_name: l.name,
        total: (entryRows || []).filter((e) => e.loja_id === l.id).reduce((s, e) => s + Number(e.daily_amount || 0), 0),
      }))
      .sort((a, b) => b.total - a.total);
    const total = byLoja.reduce((s, l) => s + l.total, 0);
    setFaturamento({ total, byLoja });
    setFaturamentoLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      // Master Admin "vendo como" esse sócio/supervisor — pula sessão/redirect e usa o perfil já carregado.
      if (impersonate) {
        if (!active) return;
        setProfile(impersonate);
        const enriched = await loadLojas(impersonate);
        const lojaIds = enriched.map((l) => l.loja_id);
        const initialMonth = firstDayOfMonth(todayStr());
        const initialLoja = enriched[0]?.loja_id || "";
        setSelectedLojaId(initialLoja);
        await Promise.all([
          loadHero(initialLoja, initialMonth),
          loadRankings(lojaIds, initialMonth),
          loadFaturamento(lojaIds, initialMonth),
        ]);
        didInit.current = true;
        setLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== role) { router.replace(redirectFor(prof?.role)); return; }
      if (!active) return;
      setProfile(prof);
      if (!prof.must_change_password) {
        const enriched = await loadLojas(prof);
        const lojaIds = enriched.map((l) => l.loja_id);
        const initialMonth = firstDayOfMonth(todayStr());
        const initialLoja = enriched[0]?.loja_id || "";
        setSelectedLojaId(initialLoja);
        await Promise.all([
          loadHero(initialLoja, initialMonth),
          loadRankings(lojaIds, initialMonth),
          loadFaturamento(lojaIds, initialMonth),
        ]);
        didInit.current = true;
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router, role, loadLojas, loadHero, loadRankings, loadFaturamento, impersonate]);

  // troca de loja ou de mês: recarrega o herocard (rankings/faturamento só dependem do mês)
  useEffect(() => {
    if (!didInit.current) return;
    loadHero(selectedLojaId, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLojaId, month]);

  useEffect(() => {
    if (!didInit.current) return;
    const lojaIds = lojas.map((l) => l.loja_id);
    loadRankings(lojaIds, month);
    loadFaturamento(lojaIds, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function refreshLoja() {
    await loadHero(selectedLojaId, month);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-muted gap-2">
        <Loader2 size={16} className="animate-spin" /> carregando…
      </div>
    );
  }

  if (profile.must_change_password && !impersonate) {
    return <ChangePassword force onDone={() => setProfile({ ...profile, must_change_password: false })} />;
  }

  const impersonationBanner = impersonate && (
    <div className="flex items-center justify-between flex-wrap gap-3 mb-4 p-3 rounded-xl bg-gold/10 border border-gold/30">
      <p className="text-xs text-navy font-semibold flex items-center gap-1.5">
        <Crown size={13} className="text-gold" /> Visualizando como Master Admin — {ROLE_LABEL[role] || role} {profile.full_name}
      </p>
      <button className="btn-outline !py-1.5 !text-xs whitespace-nowrap" onClick={onExitImpersonation}>
        ← Voltar para Master Admin
      </button>
    </div>
  );

  // "Meu perfil" no cabeçalho (AppShell) precisa SEMPRE representar quem está de fato logado —
  // nunca a pessoa que está sendo visualizada — senão trocar o usuário de login ali acaba mudando
  // as credenciais de quem está impersonando (o Master Admin), não da pessoa exibida na tela.
  const shellName = impersonate ? viewerProfile.full_name : profile.full_name;
  const shellId = impersonate ? viewerProfile.id : profile.id;
  const shellUsername = impersonate ? viewerProfile.username : profile.username;
  const shellAvatarUrl = impersonate ? viewerProfile.avatar_url : profile.avatar_url;
  const shellOnNameChange = impersonate ? undefined : (name) => setProfile((p) => ({ ...p, full_name: name }));
  const shellOnAvatarChange = impersonate ? undefined : (url) => setProfile((p) => ({ ...p, avatar_url: url }));

  if (viewingEmployee) {
    return (
      <AppShell userName={shellName} userId={shellId} userUsername={shellUsername} userAvatarUrl={shellAvatarUrl} onNameChange={shellOnNameChange} onAvatarChange={shellOnAvatarChange} tabs={EMPRESA_TABS} activeTab={tab === "atividades" || tab === "metas" ? tab : "atividades"} onTabChange={setTab}>
        {impersonationBanner}
        <ColaboradorView key={viewingEmployee.id} profile={viewingEmployee} tab={tab === "metas" ? "metas" : "atividades"} viewedByManager onBack={() => setViewingEmployee(null)} />
      </AppShell>
    );
  }
  if (viewingGerente) {
    return (
      <AppShell userName={shellName} userId={shellId} userUsername={shellUsername} userAvatarUrl={shellAvatarUrl} onNameChange={shellOnNameChange} onAvatarChange={shellOnAvatarChange} tabs={EMPRESA_TABS} activeTab={tab === "atividades" || tab === "metas" ? tab : "atividades"} onTabChange={setTab}>
        {impersonationBanner}
        <GerenteView key={viewingGerente.id} profile={viewingGerente} tab={tab === "metas" ? "metas" : "atividades"} viewedBySupervisor onBack={() => setViewingGerente(null)} />
      </AppShell>
    );
  }

  const remaining = isCurrentMonth ? remainingDaysInMonth(today) : 0;
  const restoDaMeta = Math.max(0, hero.metaLoja - hero.soldLoja);
  const dailyGoal = isCurrentMonth && remaining > 0 ? restoDaMeta / remaining : 0;

  return (
    <AppShell
      userName={shellName}
      userId={shellId}
      userUsername={shellUsername}
      userAvatarUrl={shellAvatarUrl}
      onNameChange={shellOnNameChange}
      onAvatarChange={shellOnAvatarChange}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
    >
      <div className="space-y-6">
        {impersonationBanner}
        {lojas.length === 0 ? (
          <div className="card"><p className="text-sm text-muted">Nenhuma loja atribuída a você ainda. Fale com o Master Admin.</p></div>
        ) : (
          <>
            <div className="space-y-3">
              <h1 className="text-lg sm:text-xl font-bold text-navy flex items-center gap-2">
                <greet.Icon size={20} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
              </h1>
              {/* seletor de loja só faz sentido nas abas que mostram dado de UMA loja por vez
                  (Início/Metas) — Rankings e Faturamento agregam todas as lojas de uma vez, e
                  Supervisores nem usa loja ou mês, então nenhum dos dois aparece lá. */}
              {(tab === "atividades" || tab === "metas" || tab === "rankings" || tab === "faturamento") && (
                <div className="flex items-center gap-2">
                  {(tab === "atividades" || tab === "metas") && (
                    <SelectField
                      icon={Store}
                      className="flex-1"
                      value={selectedLojaId}
                      onChange={(e) => setSelectedLojaId(e.target.value)}
                    >
                      {lojas.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.loja_name}</option>)}
                    </SelectField>
                  )}
                  <MonthNav month={month} onChange={setSelectedMonth} maxMonth={firstDayOfMonth(today)} />
                </div>
              )}
            </div>

            {(tab === "atividades" || tab === "metas") && (
              <>
                {tab === "atividades" && (() => {
                  const isSocio = role === "socio";
                  const heroBg = isSocio
                    ? "linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)"
                    : "linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)";
                  const heroShadow = isSocio ? "0 10px 28px rgba(100,116,139,0.35)" : "0 10px 28px rgba(37,99,235,0.35)";
                  const textMain = "text-navy";
                  const textSub = "text-navy/70";
                  const circleBg = "bg-navy/10";
                  const borderCol = "border-navy/15";
                  return (
                    <div
                      className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
                      style={{ background: heroBg, boxShadow: heroShadow }}
                    >
                      <div className={`absolute -top-14 -right-10 w-48 h-48 rounded-full ${circleBg}`} />
                      <div className="relative flex items-center gap-2 mb-3">
                        <Store size={18} className={textMain} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${textMain}`}>Meta de hoje · {selectedLoja?.loja_name || "loja"}</span>
                      </div>
                      <p className={`relative text-4xl sm:text-5xl font-extrabold ${textMain} leading-tight`}>{formatBRL(dailyGoal)}</p>
                      <p className={`relative text-xs font-semibold ${textSub} mt-1`}>
                        {isCurrentMonth ? `pra bater a meta da loja nos ${remaining} dia${remaining !== 1 ? "s" : ""} restantes` : `mês fechado — ${monthLabel(month)}`}
                      </p>
                      <p className={`relative text-xs font-semibold ${textSub} mt-1`}>{isCurrentMonth ? "Vendido até ontem" : "Vendido no mês"}: {formatBRL(hero.soldLoja)}</p>

                      <div className={`relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-5 sm:gap-4 mt-6 pt-5 border-t ${borderCol}`}>
                        <div className="min-w-0">
                          <p className={`text-lg sm:text-xl font-extrabold ${textMain} break-words`}>{formatBRL(restoDaMeta)}</p>
                          <p className={`text-[11px] font-semibold ${textSub} mt-0.5 flex items-center gap-1`}><Rocket size={11} className="shrink-0" /> Falta pra meta do mês</p>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-lg sm:text-xl font-extrabold ${textMain}`}>{remaining}</p>
                          <p className={`text-[11px] font-semibold ${textSub} mt-0.5 flex items-center gap-1`}><CalendarClock size={11} className="shrink-0" /> Dias restantes no mês</p>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-lg sm:text-xl font-extrabold ${textMain}`}>{hero.pendingToday}</p>
                          <p className={`text-[11px] font-semibold ${textSub} mt-0.5 flex items-center gap-1`}><ListTodo size={11} className="shrink-0" /> Atividades pendentes</p>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-lg sm:text-xl font-extrabold ${textMain} break-words`}>{formatBRL(hero.prizesSoFar)}</p>
                          <p className={`text-[11px] font-semibold ${textSub} mt-0.5 flex items-center gap-1`}><Gift size={11} className="shrink-0" /> Premiações</p>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-lg sm:text-xl font-extrabold ${textMain} break-words truncate`}>{hero.leaderName || "—"}</p>
                          <p className={`text-[11px] font-semibold ${textSub} mt-0.5 flex items-center gap-1`}><Trophy size={11} className="shrink-0" /> Líder de vendas</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* na aba Metas, o resumo rápido continua acima das sub-abas de gestão (Metas do
                    mês/Lançamentos) — só na Início (atividades) que ele desce pra depois das abas
                    Placar/Colaboradores/Tarefas/Advertências/Premiações, que ficam logo abaixo do
                    herocard. */}
                {tab === "metas" && (
                  <>
                    {!canManageSelected && (
                      <div className="card"><p className="text-xs text-muted">Você tem apenas visualização nessa loja — algumas ações de edição não estarão disponíveis.</p></div>
                    )}

                    {goalsList.length > 0 && (
                      <div className="card animate-pop border-teal/20">
                        <p className="label mb-3 flex items-center gap-1.5"><Target size={14} /> Metas da loja — {monthLabel(month)}</p>
                        <p className="text-[11px] text-muted mb-2">Vale a meta real até ela ser batida, depois passa a valer a próxima, e assim sucessivamente.</p>
                        <ul className="divide-y divide-line">
                          {goalsList.map((g) => {
                            const target = Number(g.store_total);
                            const goalPct = target > 0 ? Math.min(100, (hero.soldLoja / target) * 100) : 0;
                            return (
                              <li key={g.id} className="py-2.5">
                                <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                                  <span className="font-medium text-navy flex items-center gap-1.5 min-w-0">
                                    <span className="truncate">{g.name}</span>
                                    {activeGoal?.id === g.id && <span className="badge bg-purple/15 text-purple shrink-0">em jogo</span>}
                                  </span>
                                  <span className="text-muted shrink-0 whitespace-nowrap">{formatBRL(target)}</span>
                                </div>
                                <div className="mt-1.5"><ProgressBar pct={goalPct} height="h-2" /></div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {storeRanking.length > 0 && (
                      <div className="card animate-pop border-orange/20">
                        <p className="label mb-3 flex items-center gap-1.5"><Trophy size={14} /> Ranking de vendas — {monthLabel(month)}</p>
                        <ul className="divide-y divide-line">
                          {storeRanking.map((r, idx) => (
                            <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-xs sm:text-sm">
                              <span className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                    idx === 0 ? "bg-orange text-white" : "bg-line text-muted"
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                                <span className="font-medium text-navy truncate">{r.name}</span>
                              </span>
                              <span className="font-semibold text-navy shrink-0 whitespace-nowrap">{formatBRL(r.sold)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                <EmpresaDashboard
                  lojaId={selectedLojaId}
                  empresaId={profile.empresa_id}
                  viewerRole={canManageSelected ? role : "leitor"}
                  tab={tab}
                  month={month}
                  onOpenEmployee={setViewingEmployee}
                  onOpenGerente={setViewingGerente}
                />

                {tab === "atividades" && (
                  <>
                    {!canManageSelected && (
                      <div className="card"><p className="text-xs text-muted">Você tem apenas visualização nessa loja — algumas ações de edição não estarão disponíveis.</p></div>
                    )}

                    {goalsList.length > 0 && (
                      <div className="card animate-pop border-teal/20">
                        <p className="label mb-3 flex items-center gap-1.5"><Target size={14} /> Metas da loja — {monthLabel(month)}</p>
                        <p className="text-[11px] text-muted mb-2">Vale a meta real até ela ser batida, depois passa a valer a próxima, e assim sucessivamente.</p>
                        <ul className="divide-y divide-line">
                          {goalsList.map((g) => {
                            const target = Number(g.store_total);
                            const goalPct = target > 0 ? Math.min(100, (hero.soldLoja / target) * 100) : 0;
                            return (
                              <li key={g.id} className="py-2.5">
                                <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                                  <span className="font-medium text-navy flex items-center gap-1.5 min-w-0">
                                    <span className="truncate">{g.name}</span>
                                    {activeGoal?.id === g.id && <span className="badge bg-purple/15 text-purple shrink-0">em jogo</span>}
                                  </span>
                                  <span className="text-muted shrink-0 whitespace-nowrap">{formatBRL(target)}</span>
                                </div>
                                <div className="mt-1.5"><ProgressBar pct={goalPct} height="h-2" /></div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {storeRanking.length > 0 && (
                      <div className="card animate-pop border-orange/20">
                        <p className="label mb-3 flex items-center gap-1.5"><Trophy size={14} /> Ranking de vendas — {monthLabel(month)}</p>
                        <ul className="divide-y divide-line">
                          {storeRanking.map((r, idx) => (
                            <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-xs sm:text-sm">
                              <span className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                    idx === 0 ? "bg-orange text-white" : "bg-line text-muted"
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                                <span className="font-medium text-navy truncate">{r.name}</span>
                              </span>
                              <span className="font-semibold text-navy shrink-0 whitespace-nowrap">{formatBRL(r.sold)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {tab === "rankings" && (
              <RankingsTab rankings={rankings} loading={rankingsLoading} month={month} />
            )}

            {tab === "faturamento" && (
              <FaturamentoTab faturamento={faturamento} loading={faturamentoLoading} month={month} />
            )}

            {tab === "supervisores" && role === "socio" && (
              <SupervisoresTab empresaId={profile.empresa_id} lojas={lojas} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function RankingCard({ title, Icon, items, formatValue, emptyLabel }) {
  return (
    <div className="card">
      <p className="label mb-3 flex items-center gap-1.5"><Icon size={14} /> {title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((it, idx) => (
            <li key={it.id} className="flex items-start gap-2.5 py-2.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${idx === 0 ? "bg-orange text-white" : "bg-line text-muted"}`}>{idx + 1}</span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium text-navy text-xs sm:text-sm truncate">{it.name}</p>
                <p className="text-[11px] text-muted truncate">{it.lojaName}</p>
                <p className="font-semibold text-navy text-xs sm:text-sm">{formatValue(it.value)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RankingsTab({ rankings, loading, month }) {
  if (loading) {
    return <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando…</p>;
  }
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">Rankings entre todas as suas lojas — {monthLabel(month)}.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <RankingCard title="Top vendedores" Icon={Trophy} items={rankings.sellers} formatValue={formatBRL} emptyLabel="Nenhuma venda lançada ainda." />
        <RankingCard title="Mais premiados" Icon={Gift} items={rankings.prizes} formatValue={formatBRL} emptyLabel="Nenhuma premiação lançada ainda." />
        <RankingCard title="Líder de tarefas concluídas" Icon={Medal} items={rankings.bars} formatValue={(v) => `${v.toFixed(1)}%`} emptyLabel="Sem dados de tarefas ainda." />
        <RankingCard title="Mais comissionados" Icon={Award} items={rankings.commissions} formatValue={formatBRL} emptyLabel="Ninguém comissionado ainda." />
      </div>
    </div>
  );
}

function FaturamentoTab({ faturamento, loading, month }) {
  if (loading) {
    return <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando…</p>;
  }
  return (
    <div className="space-y-6">
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
        style={{ background: "linear-gradient(135deg, #0d9488 0%, #5eead4 100%)", boxShadow: "0 10px 28px rgba(13,148,136,0.35)" }}
      >
        <div className="relative flex items-center gap-2 mb-3">
          <TrendingUp size={18} className="text-navy" />
          <span className="text-xs font-bold uppercase tracking-wider text-navy">Faturamento total · {monthLabel(month)}</span>
        </div>
        <p className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(faturamento.total)}</p>
        <p className="relative text-xs font-semibold text-navy/70 mt-1">somando todas as suas lojas</p>
      </div>

      <div className="card overflow-x-auto">
        <p className="label mb-3">Faturamento por loja — {monthLabel(month)}</p>
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-[10px] sm:text-xs uppercase tracking-wider text-muted border-b border-line">
              <th className="pb-2 pr-3 whitespace-nowrap">Loja</th>
              <th className="pb-2 pr-3 whitespace-nowrap">Vendido no mês</th>
              <th className="pb-2 whitespace-nowrap">% do total</th>
            </tr>
          </thead>
          <tbody>
            {faturamento.byLoja.map((l) => (
              <tr key={l.loja_id} className="border-b border-line last:border-0">
                <td className="py-2.5 pr-3 font-medium text-navy whitespace-nowrap">{l.loja_name}</td>
                <td className="py-2.5 pr-3 text-navy whitespace-nowrap">{formatBRL(l.total)}</td>
                <td className="py-2.5 text-muted whitespace-nowrap">{faturamento.total > 0 ? `${((l.total / faturamento.total) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {faturamento.byLoja.length === 0 && <p className="text-sm text-muted py-2">Nenhum lançamento ainda.</p>}
      </div>
    </div>
  );
}

// Aba exclusiva do sócio: cadastra supervisores e define quais lojas cada um enxerga (ver/gerenciar).
// Passa tudo por /api/admin/hierarchy-access porque profiles/loja_access de terceiros não são
// visíveis via RLS direta no cliente — só o Master Admin tem esse privilégio de leitura ampla.
function SupervisoresTab({ empresaId, lojas }) {
  const [loading, setLoading] = useState(true);
  const [supervisores, setSupervisores] = useState([]);
  const [access, setAccess] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [togglingKey, setTogglingKey] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [picked, setPicked] = useState({});
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/hierarchy-access", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "list", empresaId }),
    });
    const json = await res.json();
    if (res.ok) {
      setSupervisores(json.supervisores || []);
      setAccess(json.access || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePicked(lojaId) {
    setPicked((p) => {
      const next = { ...p };
      if (next[lojaId]) delete next[lojaId];
      else next[lojaId] = "ver";
      return next;
    });
  }

  function setPickedPermission(lojaId, permission) {
    setPicked((p) => ({ ...p, [lojaId]: permission }));
  }

  async function createSupervisor(e) {
    e.preventDefault();
    const selected = Object.entries(picked).map(([lojaId, permission]) => ({ lojaId, permission }));
    if (!fullName.trim() || selected.length === 0) {
      setMsg("Erro: preencha o nome e selecione ao menos uma loja.");
      return;
    }
    setCreating(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-hierarchy", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ role: "supervisor", empresaId, fullName: fullName.trim(), username: username.trim(), lojaAccess: selected }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setMsg(`Supervisor criado! Usuário: ${json.username}${json.defaultPassword ? ` · senha padrão: ${json.defaultPassword}` : ""}`);
    setFullName(""); setUsername(""); setPicked({});
    setShowForm(false);
    await load();
  }

  async function setAccessFor(supervisorId, lojaId, permission) {
    const key = `${supervisorId}-${lojaId}`;
    setTogglingKey(key);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/admin/hierarchy-access", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "setAccess", supervisorId, lojaId, permission, empresaId }),
    });
    setTogglingKey(null);
    await load();
  }

  async function toggleActive(sup) {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/admin/update-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ employeeId: sup.id, newActive: !sup.active }),
    });
    await load();
  }

  if (loading) {
    return <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <p className="label mb-0 flex items-center gap-1.5"><ShieldCheck size={14} /> Novo supervisor</p>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="text-xs font-bold uppercase tracking-wider text-purple flex items-center gap-1 hover:text-purple/70"
          >
            {showForm ? <X size={13} /> : <Plus size={13} />} {showForm ? "cancelar" : "cadastrar supervisor"}
          </button>
        </div>
        {showForm && (
          lojas.length === 0 ? (
            <p className="text-xs text-muted mt-2">Cadastre uma loja antes de incluir um supervisor.</p>
          ) : (
            <form onSubmit={createSupervisor} className="mt-3 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Nome completo</label>
                  <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Usuário (id de login)</label>
                  <input className="input" placeholder="gerado automaticamente se vazio" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5">Lojas com acesso</p>
                <div className="space-y-1.5">
                  {lojas.map((l) => {
                    const perm = picked[l.loja_id];
                    return (
                      <div key={l.loja_id} className="flex items-center justify-between gap-2 text-sm">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!perm} onChange={() => togglePicked(l.loja_id)} />
                          {l.loja_name}
                        </label>
                        {perm && (
                          <div className="flex items-center gap-1">
                            {["ver", "gerenciar"].map((opt) => (
                              <button
                                type="button"
                                key={opt}
                                onClick={() => setPickedPermission(l.loja_id, opt)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                                  perm === opt ? "bg-navy text-white border-navy" : "border-line text-muted hover:border-navy"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <button className="btn" type="submit" disabled={creating}>{creating ? "Criando…" : "Criar supervisor"}</button>
              <p className="text-[11px] text-muted">A senha padrão (123456789) é definida automaticamente. O supervisor troca no primeiro acesso.</p>
            </form>
          )
        )}
        {msg && (
          <p className="text-xs text-muted mt-2">{msg}</p>
        )}
      </div>

      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><ShieldCheck size={14} /> Supervisores ({supervisores.length})</p>
        {supervisores.length === 0 && <p className="text-sm text-muted">Nenhum supervisor cadastrado ainda.</p>}
        <div className="space-y-2">
          {supervisores.map((sup) => {
            const supAccess = access.filter((a) => a.profile_id === sup.id);
            const isOpen = openId === sup.id;
            return (
              <div key={sup.id} className="border-b border-line last:border-0 pb-2">
                <button
                  onClick={() => setOpenId(isOpen ? null : sup.id)}
                  className="w-full text-sm flex items-center justify-between gap-2 py-1.5 hover:text-purple transition-colors"
                >
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-medium ${sup.active === false ? "text-muted line-through" : "text-navy"}`}>{sup.full_name}</span>
                    <span className="text-muted text-xs">({sup.username})</span>
                    {!sup.active && <span className="badge bg-line text-muted">inativo</span>}
                  </span>
                  <Eye size={13} className="text-muted" />
                </button>
                {isOpen && (
                  <div className="mt-2 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {supAccess.length === 0 && <p className="text-[11px] text-muted">sem lojas atribuídas</p>}
                      {supAccess.map((a) => {
                        const loja = lojas.find((l) => l.loja_id === a.loja_id);
                        const isManage = a.permission === "gerenciar";
                        const key = `${sup.id}-${a.loja_id}`;
                        return (
                          <span key={a.loja_id} className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={togglingKey === key}
                              onClick={() => setAccessFor(sup.id, a.loja_id, isManage ? "ver" : "gerenciar")}
                              title="Clique para alternar entre ver e gerenciar"
                              className={`badge transition-colors active:scale-95 ${
                                isManage ? "bg-purple/15 text-purple hover:bg-purple/25" : "bg-teal/10 text-teal hover:bg-teal/20"
                              }`}
                            >
                              <Store size={10} /> {loja?.loja_name || "loja"} · {isManage ? "gerenciar" : "ver"} <ArrowLeftRight size={10} />
                            </button>
                            <button
                              type="button"
                              disabled={togglingKey === key}
                              onClick={() => setAccessFor(sup.id, a.loja_id, null)}
                              title="Remover acesso a essa loja"
                              className="text-muted hover:text-danger"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {lojas.filter((l) => !supAccess.some((a) => a.loja_id === l.loja_id)).map((l) => (
                        <button
                          key={l.loja_id}
                          type="button"
                          onClick={() => setAccessFor(sup.id, l.loja_id, "ver")}
                          className="badge bg-line text-muted hover:bg-line/70 flex items-center gap-1"
                        >
                          <Plus size={10} /> {l.loja_name}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleActive(sup)} className={`text-xs uppercase tracking-wider font-medium ${sup.active ? "text-muted hover:text-navy" : "text-danger"}`}>
                        {sup.active ? "desativar" : "ativar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
} from "lucide-react";
import { supabase } from "./supabaseClient";
import AppShell from "./AppShell";
import ChangePassword from "./ChangePassword";
import EmpresaDashboard, { EMPRESA_TABS } from "./EmpresaDashboard";
import ColaboradorView from "./ColaboradorView";
import GerenteView from "./GerenteView";
import ProgressBar from "./ProgressBar";
import MonthNav from "./MonthNav";
import { calcIndividualPct, formatBRL, currentGoalTarget } from "./scoring";
import { greeting, todayStr, firstDayOfMonth, remainingDaysInMonth, monthLabel } from "./date";

const ROLE_LABEL = { socio: "Sócio", supervisor: "Supervisor" };

const TABS = [
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

export default function HierarchyHome({ role }) {
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
  });

  const [goalsList, setGoalsList] = useState([]);
  const [activeGoal, setActiveGoal] = useState(null);

  const [rankings, setRankings] = useState({ sellers: [], prizes: [], bars: [], commissions: [] });
  const [rankingsLoading, setRankingsLoading] = useState(false);

  const [faturamento, setFaturamento] = useState({ total: 0, byLoja: [] });
  const [faturamentoLoading, setFaturamentoLoading] = useState(false);

  const greet = greeting();
  const today = todayStr();
  const month = selectedMonth || firstDayOfMonth(today);
  const isCurrentMonth = month === firstDayOfMonth(today);
  const cfg = ROLE_LABEL[role] || role;

  const selectedLoja = lojas.find((l) => l.loja_id === selectedLojaId);
  const canManageSelected = selectedLoja?.permission === "gerenciar";

  const loadLojas = useCallback(async (prof) => {
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
  }, []);

  // herocard do supervisor: agregado da LOJA TODA (todos os gerentes/equipes juntos), não só um time.
  // a barra de progresso aqui é vendido/meta (não média de barra individual).
  const loadHero = useCallback(async (lojaId, monthArg) => {
    if (!lojaId) {
      setHero({ metaLoja: 0, soldLoja: 0, pendingToday: 0, commissionSoFar: 0, prizesSoFar: 0, commissionPct: 0, commissionTierLabel: "não atingimento", barPct: 0 });
      setGoalsList([]);
      setActiveGoal(null);
      return;
    }
    const { data: emps } = await supabase.from("profiles").select("id").eq("loja_id", lojaId).eq("role", "colaborador").eq("active", true);
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

    setHero({ metaLoja, soldLoja, pendingToday, commissionSoFar, prizesSoFar, commissionPct, commissionTierLabel, barPct });
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
  }, [router, role, loadLojas, loadHero, loadRankings, loadFaturamento]);

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

  if (profile.must_change_password) {
    return <ChangePassword force onDone={() => setProfile({ ...profile, must_change_password: false })} />;
  }

  if (viewingEmployee) {
    return (
      <AppShell userName={profile.full_name} userId={profile.id} userUsername={profile.username} onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))} tabs={EMPRESA_TABS} activeTab={tab === "atividades" || tab === "metas" ? tab : "atividades"} onTabChange={setTab}>
        <ColaboradorView key={viewingEmployee.id} profile={viewingEmployee} tab={tab === "metas" ? "metas" : "atividades"} viewedByManager onBack={() => setViewingEmployee(null)} />
      </AppShell>
    );
  }
  if (viewingGerente) {
    return (
      <AppShell userName={profile.full_name} userId={profile.id} userUsername={profile.username} onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))} tabs={EMPRESA_TABS} activeTab={tab === "atividades" || tab === "metas" ? tab : "atividades"} onTabChange={setTab}>
        <GerenteView key={viewingGerente.id} profile={viewingGerente} tab={tab === "metas" ? "metas" : "atividades"} viewedBySupervisor onBack={() => setViewingGerente(null)} />
      </AppShell>
    );
  }

  const remaining = isCurrentMonth ? remainingDaysInMonth(today) : 0;
  const restoDaMeta = Math.max(0, hero.metaLoja - hero.soldLoja);
  const dailyGoal = isCurrentMonth && remaining > 0 ? restoDaMeta / remaining : 0;

  return (
    <AppShell
      userName={profile.full_name}
      userId={profile.id}
      userUsername={profile.username}
      onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      <div className="space-y-6">
        {lojas.length === 0 ? (
          <div className="card"><p className="text-sm text-muted">Nenhuma loja atribuída a você ainda. Fale com o Master Admin.</p></div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-navy flex items-center gap-2">
                  <greet.Icon size={20} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
                </h1>
                <p className="text-xs text-muted mt-1">{cfg} · {lojas.length} loja{lojas.length !== 1 ? "s" : ""} sob sua gestão</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 bg-white border-2 border-purple/30 rounded-full pl-3 pr-2.5 py-2 shadow-soft hover:border-purple/60 transition-colors cursor-pointer">
                  <Store size={15} className="text-purple shrink-0" />
                  <div className="flex flex-col leading-none">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted">Loja</span>
                    <select
                      className="!border-0 !bg-transparent !p-0 !shadow-none !ring-0 text-sm font-bold text-navy focus:outline-none cursor-pointer max-w-[180px]"
                      value={selectedLojaId}
                      onChange={(e) => setSelectedLojaId(e.target.value)}
                    >
                      {lojas.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.loja_name}</option>)}
                    </select>
                  </div>
                  {!canManageSelected && <span className="badge bg-line text-muted text-[9px] shrink-0">visualização</span>}
                </label>
                <MonthNav month={month} onChange={setSelectedMonth} maxMonth={firstDayOfMonth(today)} />
              </div>
            </div>

            {(tab === "atividades" || tab === "metas") && (
              <>
                {tab === "atividades" && (
                  <div
                    className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
                    style={{ background: "linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)", boxShadow: "0 10px 28px rgba(37,99,235,0.35)" }}
                  >
                    <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/15" />
                    <div className="relative flex items-center gap-2 mb-3">
                      <Store size={18} className="text-white" />
                      <span className="text-xs font-bold uppercase tracking-wider text-white">Meta de hoje · {selectedLoja?.loja_name || "loja"}</span>
                    </div>
                    <p className="relative text-4xl sm:text-5xl font-extrabold text-white leading-tight">{formatBRL(dailyGoal)}</p>
                    <p className="relative text-xs font-semibold text-white/80 mt-1">
                      {isCurrentMonth ? `pra bater a meta da loja nos ${remaining} dia${remaining !== 1 ? "s" : ""} restantes` : `mês fechado — ${monthLabel(month)}`}
                    </p>
                    <p className="relative text-xs font-semibold text-white/80 mt-1">{isCurrentMonth ? "Vendido até ontem" : "Vendido no mês"}: {formatBRL(hero.soldLoja)}</p>

                    <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-white/20">
                      <div>
                        <p className="text-xl font-extrabold text-white">{formatBRL(restoDaMeta)}</p>
                        <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><Rocket size={11} /> Falta pra meta do mês</p>
                      </div>
                      <div>
                        <p className="text-xl font-extrabold text-white">{remaining}</p>
                        <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><CalendarClock size={11} /> Dias restantes no mês</p>
                      </div>
                      <div>
                        <p className="text-xl font-extrabold text-white">{hero.pendingToday}</p>
                        <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><ListTodo size={11} /> Atividades pendentes</p>
                      </div>
                      <div>
                        <p className="text-xl font-extrabold text-white">{formatBRL(hero.prizesSoFar)}</p>
                        <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><Gift size={11} /> Premiações</p>
                      </div>
                    </div>
                  </div>
                )}

                {!canManageSelected && (
                  <div className="card"><p className="text-xs text-muted">Você tem apenas visualização nessa loja — algumas ações de edição não estarão disponíveis.</p></div>
                )}

                {goalsList.length > 0 && (
                  <div className="card animate-pop border-teal/20">
                    <p className="label mb-3 flex items-center gap-1.5"><Target size={14} /> Metas da loja — {monthLabel(month)}</p>
                    <p className="text-[11px] text-muted mb-2">Os níveis não somam: vale a meta real até ela ser batida, depois passa a valer a próxima, e assim sucessivamente.</p>
                    <ul className="divide-y divide-line">
                      {goalsList.map((g) => {
                        const target = Number(g.store_total);
                        const goalPct = target > 0 ? Math.min(100, (hero.soldLoja / target) * 100) : 0;
                        return (
                          <li key={g.id} className="py-2.5">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="font-medium text-navy flex items-center gap-1.5">
                                {g.name}
                                {activeGoal?.id === g.id && <span className="badge bg-purple/15 text-purple">em jogo</span>}
                              </span>
                              <span className="text-muted">{formatBRL(target)}</span>
                            </div>
                            <div className="mt-1.5"><ProgressBar pct={goalPct} showLabel={false} height="h-2" /></div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
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
              </>
            )}

            {tab === "rankings" && (
              <RankingsTab rankings={rankings} loading={rankingsLoading} month={month} />
            )}

            {tab === "faturamento" && (
              <FaturamentoTab faturamento={faturamento} loading={faturamentoLoading} month={month} />
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
            <li key={it.id} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${idx === 0 ? "bg-orange text-white" : "bg-line text-muted"}`}>{idx + 1}</span>
                <span className="font-medium text-navy">{it.name}</span>
                <span className="text-xs text-muted">· {it.lojaName}</span>
              </span>
              <span className="font-semibold text-navy">{formatValue(it.value)}</span>
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
        <RankingCard title="Melhor barra individual" Icon={Medal} items={rankings.bars} formatValue={(v) => `${v.toFixed(1)}%`} emptyLabel="Sem dados de tarefas ainda." />
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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-line">
              <th className="pb-2">Loja</th>
              <th className="pb-2">Vendido no mês</th>
              <th className="pb-2">% do total</th>
            </tr>
          </thead>
          <tbody>
            {faturamento.byLoja.map((l) => (
              <tr key={l.loja_id} className="border-b border-line last:border-0">
                <td className="py-2.5 font-medium text-navy">{l.loja_name}</td>
                <td className="py-2.5 text-navy">{formatBRL(l.total)}</td>
                <td className="py-2.5 text-muted">{faturamento.total > 0 ? `${((l.total / faturamento.total) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {faturamento.byLoja.length === 0 && <p className="text-sm text-muted py-2">Nenhum lançamento ainda.</p>}
      </div>
    </div>
  );
}

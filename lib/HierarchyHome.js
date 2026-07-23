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
  Power,
  ChevronUp,
  ChevronDown,
  PhoneCall,
  CalendarDays,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import AppShell from "./AppShell";
import ChangePassword from "./ChangePassword";
import EmpresaDashboard, { EMPRESA_TABS } from "./EmpresaDashboard";
import ColaboradorView from "./ColaboradorView";
import GerenteView from "./GerenteView";
import ConsorcioDashboard, { CONSORCIO_TABS } from "./ConsorcioDashboard";
import { GERENTE_TABS as GERENTE_TABS_CONSORCIO } from "./GerenteViewConsorcio";
import ColaboradorViewConsorcio from "./ColaboradorViewConsorcio";
import GerenteViewConsorcio from "./GerenteViewConsorcio";
import ProgressBar from "./ProgressBar";
import MonthNav from "./MonthNav";
import SelectField from "./SelectField";
import AutoFitText from "./AutoFitText";
import Avatar from "./Avatar";
import ConfirmModal from "./ConfirmModal";
import { calcIndividualPct, formatBRL, formatPct, currentGoalTarget } from "./scoring";
import { greeting, todayStr, firstDayOfMonth, remainingDaysInMonth, monthLabel, isTaskDueOn, daysElapsedInMonth } from "./date";
import { useSavedNotice } from "./SavedNotice";

const ROLE_LABEL = { socio: "Sócio", supervisor: "Supervisor" };

const BASE_TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "metas", label: "Metas", Icon: Wallet },
  { key: "rankings", label: "Rankings", Icon: Trophy },
  { key: "faturamento", label: "Faturamento", Icon: DollarSign },
];

// colaborador de consórcio tem outro conjunto de abas (sem Metas, com Calendário) — mesmo padrão de
// app/admin/page.js (TABS_CONSORCIO_COLAB), não exportado de app/colaborador/page.js.
// 2026-07-20: "Tarefas" deixou de ser aba própria — o checklist virou card do dashboard de
// Início (ver lib/ColaboradorViewConsorcio.js) — removida daqui também (regra de ouro de UI:
// telas compartilhadas/impersonadas têm que ficar idênticas à tela "de verdade").
const TABS_CONSORCIO_COLAB = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "calendario", label: "Calendário", Icon: CalendarDays },
];

function redirectFor(role) {
  if (role === "master_admin") return "/admin";
  if (role === "gerente") return "/gerente";
  if (role === "socio") return "/socio";
  if (role === "supervisor") return "/supervisor";
  if (role === "administrativo") return "/administrativo";
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
  // categoria é da EMPRESA, não da loja — todas as lojas de um sócio/supervisor compartilham a
  // mesma, então basta um fetch por sessão (não por loja selecionada).
  const [categoriaSlug, setCategoriaSlug] = useState("vestuario");
  const [tab, setTab] = useState("atividades");
  // sub-aba ativa dentro de <EmpresaDashboard> (placar/colaboradores/tarefas/advertencias/
  // premiacoes) — precisa estar aqui pra decidir se os cards de apoio (Metas da loja, Ranking de
  // vendas, Ranking de lojas) devem aparecer: eles só fazem sentido junto do Placar, não devem
  // "vazar" pras outras sub-abas (Colaboradores/Tarefas/Advertências/Premiações).
  const [atSub, setAtSub] = useState("placar");
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

  // herocard simplificado pra lojas de CONSÓRCIO — versão mínima desta fase: não replica
  // Rankings/Faturamento cross-loja (essas duas abas seguem mostrando um aviso "em breve" pra
  // empresas de consórcio, ver render abaixo), só o essencial de "Início" pra não deixar a tela vazia.
  const [heroConsorcio, setHeroConsorcio] = useState({
    ligacoesHoje: 0, agendamentosHoje: 0, pendingToday: 0, soldLoja: 0, metaLoja: 0, leaderName: null,
    ligacoesMes: 0, agendadosMes: 0, vendidosMesCohort: 0, pctLigacaoAgendamento: 0, pctAgendamentoVenda: 0, pctLigacaoVenda: 0,
  });

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
  // 2026-07-21: essa aba agora também cadastra "administrativo" (exclusivo de consórcio) — o
  // rótulo muda pra não ficar enganoso pra quem tem empresa consórcio, mas a key/rota continua
  // "supervisores" de propósito (menos coisa pra migrar/quebrar em links já existentes).
  const tabs = role === "socio" ? [...BASE_TABS, { key: "supervisores", label: categoriaSlug === "consorcio" ? "Hierarquia" : "Supervisores", Icon: ShieldCheck }] : BASE_TABS;

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
    const { data: emps } = await supabase.from("profiles").select("id, full_name, avatar_url").eq("loja_id", lojaId).eq("role", "colaborador").eq("active", true);
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
      .map((emp) => ({ id: emp.id, name: emp.full_name, avatar_url: emp.avatar_url, sold: soldByEmp[emp.id] || 0 }))
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

  // equivalente ao loadHero acima, só que pra loja de CONSÓRCIO — agregado da loja toda (todos os
  // colaboradores/equipes juntos), fonte crm_leads/consorcio_goals em vez de sales_entries/sales_goals.
  const loadHeroConsorcio = useCallback(async (lojaId, monthArg) => {
    if (!lojaId) {
      setHeroConsorcio({
        ligacoesHoje: 0, agendamentosHoje: 0, pendingToday: 0, soldLoja: 0, metaLoja: 0, leaderName: null,
        ligacoesMes: 0, agendadosMes: 0, vendidosMesCohort: 0, pctLigacaoAgendamento: 0, pctAgendamentoVenda: 0, pctLigacaoVenda: 0,
      });
      return;
    }
    const { data: emps } = await supabase.from("profiles").select("id, full_name").eq("loja_id", lojaId).eq("role", "colaborador").eq("active", true);
    const empIds = (emps || []).map((e) => e.id);

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

    let ligacoesHoje = 0, agendamentosHoje = 0, soldLoja = 0, leaderName = null;
    let ligacoesMes = 0, agendadosMes = 0, vendidosMesCohort = 0, pctLigacaoAgendamento = 0, pctAgendamentoVenda = 0, pctLigacaoVenda = 0;
    if (empIds.length) {
      const { data: leadRows } = await supabase.from("crm_leads").select("employee_id, status, valor, data_ligacao, agendamento_at, vendido_at").in("employee_id", empIds);
      const todayNow = todayStr();
      const rows = leadRows || [];
      ligacoesHoje = rows.filter((l) => l.data_ligacao === todayNow).length;
      agendamentosHoje = rows.filter((l) => l.agendamento_at && l.agendamento_at.slice(0, 10) === todayNow).length;
      const vendidoRows = rows.filter((l) => l.status === "vendido" && l.vendido_at && l.vendido_at.slice(0, 7) === monthArg.slice(0, 7));
      soldLoja = vendidoRows.reduce((s, l) => s + Number(l.valor || 0), 0);
      const soldByEmp = {};
      vendidoRows.forEach((l) => { soldByEmp[l.employee_id] = (soldByEmp[l.employee_id] || 0) + Number(l.valor || 0); });
      let leaderSold = 0;
      (emps || []).forEach((emp) => {
        const sold = soldByEmp[emp.id] || 0;
        if (sold > leaderSold) { leaderSold = sold; leaderName = emp.full_name; }
      });

      // Conversão do mês — mesmo cohort (por data_ligacao) usado em ConsorcioDashboard.js e
      // GerenteViewConsorcio.js, aqui agregado pra loja inteira.
      const cohortRows = rows.filter((l) => l.data_ligacao && l.data_ligacao.slice(0, 7) === monthArg.slice(0, 7));
      ligacoesMes = cohortRows.length;
      agendadosMes = cohortRows.filter((l) => !!l.agendamento_at).length;
      vendidosMesCohort = cohortRows.filter((l) => l.status === "vendido").length;
      pctLigacaoAgendamento = ligacoesMes > 0 ? (agendadosMes / ligacoesMes) * 100 : 0;
      pctAgendamentoVenda = agendadosMes > 0 ? (vendidosMesCohort / agendadosMes) * 100 : 0;
      pctLigacaoVenda = ligacoesMes > 0 ? (vendidosMesCohort / ligacoesMes) * 100 : 0;
    }

    const { data: goalRows } = await supabase
      .from("consorcio_goals")
      .select("store_total")
      .eq("loja_id", lojaId)
      .eq("month", monthArg);
    const metaLoja = currentGoalTarget((goalRows || []).map((g) => g.store_total), soldLoja);

    setHeroConsorcio({
      ligacoesHoje, agendamentosHoje, pendingToday, soldLoja, metaLoja, leaderName,
      ligacoesMes, agendadosMes, vendidosMesCohort, pctLigacaoAgendamento, pctAgendamentoVenda, pctLigacaoVenda,
    });
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
      // só tarefas ATIVAS entram no cálculo da barra — uma tarefa excluída não pode inflar/desinflar
      // o "esperado" com completions históricas de quando ela existia.
      supabase.from("tasks").select("id, employee_id, recurrence_type, weekday, once_date, start_date").in("employee_id", empIds).eq("active", true),
      supabase.from("warnings").select("employee_id, loja_id").in("employee_id", empIds).gte("warning_date", monthArg).lt("warning_date", nextMonthStr),
      supabase.from("sales_goals").select("id, loja_id, store_total, commission_pct_colaborador").in("loja_id", lojaIds).eq("month", monthArg).order("store_total", { ascending: true }),
      supabase.from("sales_goal_allocations").select("goal_id, employee_id, amount").in("employee_id", empIds),
      supabase.from("commission_settings").select("loja_id, non_achievement_colaborador_pct").in("loja_id", lojaIds).eq("month", monthArg),
    ]);

    const penaltyByLoja = {};
    (settingsRows || []).forEach((s) => { penaltyByLoja[s.loja_id] = s.warning_penalty_points ?? 10; });
    const taskIds = (taskRows || []).map((t) => t.id);
    // "esperado" não vem de contar completions já existentes (semeadura preguiçosa faria um
    // colaborador sem checklist aberto ainda ficar de fora indevidamente) — vem dos dias em que
    // cada tarefa ativa realmente valia (isTaskDueOn), do início do mês até hoje (ou até o fim do
    // mês, se for mês fechado), só então cruzados com as completions que já existem.
    let completionMap = {};
    if (taskIds.length) {
      const { data: compRows } = await supabase
        .from("task_completions")
        .select("task_id, completed, completion_date")
        .in("task_id", taskIds)
        .gte("completion_date", monthArg)
        .lt("completion_date", nextMonthStr);
      (compRows || []).forEach((c) => { completionMap[`${c.task_id}|${c.completion_date}`] = c.completed; });
    }
    const daysRangeRankings = daysElapsedInMonth(monthArg);
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
      const myTasks = (taskRows || []).filter((t) => t.employee_id === emp.id);
      let expected = 0, completed = 0;
      myTasks.forEach((t) => {
        daysRangeRankings.forEach((ds) => {
          if (!isTaskDueOn(t, ds)) return;
          expected++;
          if (completionMap[`${t.id}|${ds}`]) completed++;
        });
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

  // 2026-07-20: Rankings pro segmento CONSÓRCIO — mesma saída de loadRankings (sellers/prizes/
  // bars/commissions), trocando só a fonte de venda pra crm_leads (status='vendido', cohort por
  // vendido_at) e as metas em camada pra consorcio_goals/consorcio_goal_allocations/
  // consorcio_commission_settings. Tarefas/advertências são tabelas agnósticas de categoria —
  // o cálculo da barra (bars) é idêntico ao de vestuário, reaproveitado sem mudança.
  const loadRankingsConsorcio = useCallback(async (lojaIds, monthArg) => {
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

    const [{ data: leadRows }, { data: prizeRows }, { data: settingsRows }, { data: taskRows }, { data: warnRows }, { data: goalRows }, { data: allocRows }, { data: commissionRows }] = await Promise.all([
      supabase.from("crm_leads").select("employee_id, loja_id, status, valor, vendido_at").in("employee_id", empIds),
      supabase.from("employee_prizes").select("employee_id, amount").in("employee_id", empIds).eq("month", monthArg),
      supabase.from("app_settings").select("loja_id, warning_penalty_points").in("loja_id", lojaIds),
      supabase.from("tasks").select("id, employee_id, recurrence_type, weekday, once_date, start_date").in("employee_id", empIds).eq("active", true),
      supabase.from("warnings").select("employee_id, loja_id").in("employee_id", empIds).gte("warning_date", monthArg).lt("warning_date", nextMonthStr),
      supabase.from("consorcio_goals").select("id, loja_id, store_total, commission_pct_colaborador").in("loja_id", lojaIds).eq("month", monthArg).order("store_total", { ascending: true }),
      supabase.from("consorcio_goal_allocations").select("goal_id, employee_id, amount").in("employee_id", empIds),
      supabase.from("consorcio_commission_settings").select("loja_id, non_achievement_colaborador_pct").in("loja_id", lojaIds).eq("month", monthArg),
    ]);

    const vendidoRows = (leadRows || []).filter((l) => l.status === "vendido" && l.vendido_at && l.vendido_at.slice(0, 7) === monthArg.slice(0, 7));

    const penaltyByLoja = {};
    (settingsRows || []).forEach((s) => { penaltyByLoja[s.loja_id] = s.warning_penalty_points ?? 10; });
    const taskIds = (taskRows || []).map((t) => t.id);
    let completionMap = {};
    if (taskIds.length) {
      const { data: compRows } = await supabase
        .from("task_completions")
        .select("task_id, completed, completion_date")
        .in("task_id", taskIds)
        .gte("completion_date", monthArg)
        .lt("completion_date", nextMonthStr);
      (compRows || []).forEach((c) => { completionMap[`${c.task_id}|${c.completion_date}`] = c.completed; });
    }
    const daysRangeRankings = daysElapsedInMonth(monthArg);
    const nonAchByLoja = {};
    (commissionRows || []).forEach((c) => { nonAchByLoja[c.loja_id] = Number(c.non_achievement_colaborador_pct) || 0; });
    const goalsByLoja = {};
    (goalRows || []).forEach((g) => { (goalsByLoja[g.loja_id] ||= []).push(g); });

    const sellers = [];
    const prizesList = [];
    const bars = [];
    const commissions = [];

    (emps || []).forEach((emp) => {
      const sold = vendidoRows.filter((l) => l.employee_id === emp.id).reduce((s, l) => s + Number(l.valor || 0), 0);
      const prizeTotal = (prizeRows || []).filter((p) => p.employee_id === emp.id).reduce((s, p) => s + Number(p.amount || 0), 0);
      const myTasks = (taskRows || []).filter((t) => t.employee_id === emp.id);
      let expected = 0, completed = 0;
      myTasks.forEach((t) => {
        daysRangeRankings.forEach((ds) => {
          if (!isTaskDueOn(t, ds)) return;
          expected++;
          if (completionMap[`${t.id}|${ds}`]) completed++;
        });
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

  // Faturamento consolidado pra CONSÓRCIO — mesma saída de loadFaturamento (total + byLoja),
  // fonte crm_leads (vendido no mês, status='vendido') em vez de sales_entries.
  const loadFaturamentoConsorcio = useCallback(async (lojaIds, monthArg) => {
    if (!lojaIds.length) { setFaturamento({ total: 0, byLoja: [] }); return; }
    setFaturamentoLoading(true);

    const { data: lojaRows } = await supabase.from("lojas").select("id, name").in("id", lojaIds);
    const { data: leadRows } = await supabase
      .from("crm_leads")
      .select("loja_id, status, valor, vendido_at")
      .in("loja_id", lojaIds);
    const vendidoRows = (leadRows || []).filter((l) => l.status === "vendido" && l.vendido_at && l.vendido_at.slice(0, 7) === monthArg.slice(0, 7));

    const byLoja = (lojaRows || [])
      .map((l) => ({
        loja_id: l.id,
        loja_name: l.name,
        total: vendidoRows.filter((e) => e.loja_id === l.id).reduce((s, e) => s + Number(e.valor || 0), 0),
      }))
      .sort((a, b) => b.total - a.total);
    const total = byLoja.reduce((s, l) => s + l.total, 0);
    setFaturamento({ total, byLoja });
    setFaturamentoLoading(false);
  }, []);

  // categoria é da EMPRESA — mesmo padrão de app/colaborador/page.js e app/gerente/page.js.
  async function resolveCategoriaSlug(empresaId) {
    if (!empresaId) return "vestuario";
    const { data: empresaRow } = await supabase.from("empresas").select("categoria_id").eq("id", empresaId).single();
    if (!empresaRow?.categoria_id) return "vestuario";
    const { data: categoriaRow } = await supabase.from("categorias_empresa").select("slug").eq("id", empresaRow.categoria_id).single();
    return categoriaRow?.slug || "vestuario";
  }

  useEffect(() => {
    let active = true;
    (async () => {
      // Master Admin "vendo como" esse sócio/supervisor — pula sessão/redirect e usa o perfil já carregado.
      if (impersonate) {
        if (!active) return;
        setProfile(impersonate);
        const slug = await resolveCategoriaSlug(impersonate.empresa_id);
        if (!active) return;
        setCategoriaSlug(slug);
        const enriched = await loadLojas(impersonate);
        const lojaIds = enriched.map((l) => l.loja_id);
        const initialMonth = firstDayOfMonth(todayStr());
        const initialLoja = enriched[0]?.loja_id || "";
        setSelectedLojaId(initialLoja);
        if (slug === "consorcio") {
          await Promise.all([
            loadHeroConsorcio(initialLoja, initialMonth),
            loadRankingsConsorcio(lojaIds, initialMonth),
            loadFaturamentoConsorcio(lojaIds, initialMonth),
          ]);
        } else {
          await Promise.all([
            loadHero(initialLoja, initialMonth),
            loadRankings(lojaIds, initialMonth),
            loadFaturamento(lojaIds, initialMonth),
          ]);
        }
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
      // Carrega categoria/lojas/hero SEMPRE, independente de must_change_password.
      // Bug real corrigido aqui (2026-07-20): esse efeito de mount só roda uma vez; antes,
      // o carregamento inteiro ficava atrás de `if (!prof.must_change_password)`. No primeiro
      // login (toda conta nova de sócio/supervisor nasce com must_change_password=true), o
      // usuário caía na tela de trocar senha SEM nunca ter chamado loadLojas — e o
      // ChangePassword.onDone só troca a flag em memória (setProfile), não remonta o
      // componente nem reroda este efeito. Resultado: `lojas` ficava `[]` pra sempre, e a
      // pessoa via "Nenhuma loja atribuída" mesmo tendo loja_access de verdade no banco.
      // Mesmo padrão de app/colaborador/page.js e app/gerente/page.js, que sempre carregam a
      // categoria da empresa antes de decidir o que renderizar, independente da senha.
      const slug = await resolveCategoriaSlug(prof.empresa_id);
      if (!active) return;
      setCategoriaSlug(slug);
      const enriched = await loadLojas(prof);
      const lojaIds = enriched.map((l) => l.loja_id);
      const initialMonth = firstDayOfMonth(todayStr());
      const initialLoja = enriched[0]?.loja_id || "";
      setSelectedLojaId(initialLoja);
      if (slug === "consorcio") {
        await Promise.all([
          loadHeroConsorcio(initialLoja, initialMonth),
          loadRankingsConsorcio(lojaIds, initialMonth),
          loadFaturamentoConsorcio(lojaIds, initialMonth),
        ]);
      } else {
        await Promise.all([
          loadHero(initialLoja, initialMonth),
          loadRankings(lojaIds, initialMonth),
          loadFaturamento(lojaIds, initialMonth),
        ]);
      }
      didInit.current = true;
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router, role, loadLojas, loadHero, loadHeroConsorcio, loadRankings, loadFaturamento, loadRankingsConsorcio, loadFaturamentoConsorcio, impersonate]);

  // troca de loja ou de mês: recarrega o herocard (rankings/faturamento só dependem do mês)
  useEffect(() => {
    if (!didInit.current) return;
    if (categoriaSlug === "consorcio") {
      loadHeroConsorcio(selectedLojaId, month);
    } else {
      loadHero(selectedLojaId, month);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLojaId, month, categoriaSlug]);

  useEffect(() => {
    if (!didInit.current) return;
    const lojaIds = lojas.map((l) => l.loja_id);
    if (categoriaSlug === "consorcio") {
      loadRankingsConsorcio(lojaIds, month);
      loadFaturamentoConsorcio(lojaIds, month);
    } else {
      loadRankings(lojaIds, month);
      loadFaturamento(lojaIds, month);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, categoriaSlug]);

  async function refreshLoja() {
    if (categoriaSlug === "consorcio") {
      await loadHeroConsorcio(selectedLojaId, month);
    } else {
      await loadHero(selectedLojaId, month);
    }
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

  const isConsorcio = categoriaSlug === "consorcio";

  if (viewingEmployee) {
    const colabTabs = isConsorcio ? TABS_CONSORCIO_COLAB : EMPRESA_TABS;
    const colabTab = colabTabs.some((t) => t.key === tab) ? tab : "atividades";
    return (
      <AppShell userName={shellName} userId={shellId} userUsername={shellUsername} userAvatarUrl={shellAvatarUrl} onNameChange={shellOnNameChange} onAvatarChange={shellOnAvatarChange} tabs={colabTabs} activeTab={colabTab} onTabChange={setTab}>
        {impersonationBanner}
        {isConsorcio ? (
          <ColaboradorViewConsorcio key={viewingEmployee.id} profile={viewingEmployee} tab={colabTab} viewedByManager onBack={() => setViewingEmployee(null)} />
        ) : (
          <ColaboradorView key={viewingEmployee.id} profile={viewingEmployee} tab={colabTab} viewedByManager onBack={() => setViewingEmployee(null)} />
        )}
      </AppShell>
    );
  }
  if (viewingGerente) {
    const gerTabs = isConsorcio ? GERENTE_TABS_CONSORCIO : EMPRESA_TABS;
    const gerTab = gerTabs.some((t) => t.key === tab) ? tab : "atividades";
    return (
      <AppShell userName={shellName} userId={shellId} userUsername={shellUsername} userAvatarUrl={shellAvatarUrl} onNameChange={shellOnNameChange} onAvatarChange={shellOnAvatarChange} tabs={gerTabs} activeTab={gerTab} onTabChange={setTab}>
        {impersonationBanner}
        {isConsorcio ? (
          <GerenteViewConsorcio key={viewingGerente.id} profile={viewingGerente} tab={gerTab} viewedBySupervisor onBack={() => setViewingGerente(null)} />
        ) : (
          <GerenteView key={viewingGerente.id} profile={viewingGerente} tab={gerTab} viewedBySupervisor onBack={() => setViewingGerente(null)} />
        )}
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
                {tab === "atividades" && isConsorcio && (() => {
                  const isSocio = role === "socio";
                  const heroBg = isSocio
                    ? "linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)"
                    : "linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)";
                  const heroShadow = isSocio ? "0 10px 28px rgba(100,116,139,0.35)" : "0 10px 28px rgba(37,99,235,0.35)";
                  return (
                    <div
                      className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
                      style={{ background: heroBg, boxShadow: heroShadow }}
                    >
                      <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-navy/10" />
                      <div className="relative flex items-center gap-2 mb-3">
                        <Store size={18} className="text-navy" />
                        <span className="text-xs font-bold uppercase tracking-wider text-navy">Funil · {selectedLoja?.loja_name || "loja"}</span>
                      </div>
                      <AutoFitText className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(heroConsorcio.soldLoja)}</AutoFitText>
                      <p className="relative text-xs font-semibold text-navy/70 mt-1">
                        {heroConsorcio.metaLoja > 0 ? `faltam ${formatBRL(Math.max(0, heroConsorcio.metaLoja - heroConsorcio.soldLoja))} pra próxima meta` : "nenhuma meta cadastrada ainda"}
                      </p>
                      <p className="relative text-xs font-semibold text-navy/70 mt-1">Vendido no mês — {monthLabel(month)}</p>

                      <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-5 sm:gap-4 mt-6 pt-5 border-t border-navy/15">
                        <div className="min-w-0">
                          <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{heroConsorcio.ligacoesHoje}</AutoFitText>
                          <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><PhoneCall size={11} className="shrink-0" /> Ligações hoje</p>
                        </div>
                        <div className="min-w-0">
                          <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{heroConsorcio.agendamentosHoje}</AutoFitText>
                          <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><CalendarClock size={11} className="shrink-0" /> Reuniões hoje</p>
                        </div>
                        <div className="min-w-0">
                          <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{heroConsorcio.pendingToday}</AutoFitText>
                          <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><ListTodo size={11} className="shrink-0" /> Atividades pendentes</p>
                        </div>
                        <div className="min-w-0">
                          <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{heroConsorcio.leaderName || "—"}</AutoFitText>
                          <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Trophy size={11} className="shrink-0" /> Líder de vendas</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {tab === "atividades" && !isConsorcio && (() => {
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
                      <AutoFitText className={`relative text-4xl sm:text-5xl font-extrabold ${textMain} leading-tight`}>{formatBRL(dailyGoal)}</AutoFitText>
                      <p className={`relative text-xs font-semibold ${textSub} mt-1`}>
                        {isCurrentMonth ? `pra bater a meta da loja nos ${remaining} dia${remaining !== 1 ? "s" : ""} restantes` : `mês fechado — ${monthLabel(month)}`}
                      </p>
                      <p className={`relative text-xs font-semibold ${textSub} mt-1`}>{isCurrentMonth ? "Vendido até hoje" : "Vendido no mês"}: {formatBRL(hero.soldLoja)}</p>

                      <div className={`relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-5 sm:gap-4 mt-6 pt-5 border-t ${borderCol}`}>
                        <div className="min-w-0">
                          <AutoFitText className={`text-lg sm:text-xl font-extrabold ${textMain}`}>{formatBRL(restoDaMeta)}</AutoFitText>
                          <p className={`text-[11px] font-semibold ${textSub} mt-0.5 flex items-center gap-1`}><Rocket size={11} className="shrink-0" /> Falta pra meta do mês</p>
                        </div>
                        <div className="min-w-0">
                          <AutoFitText className={`text-lg sm:text-xl font-extrabold ${textMain}`}>{remaining}</AutoFitText>
                          <p className={`text-[11px] font-semibold ${textSub} mt-0.5 flex items-center gap-1`}><CalendarClock size={11} className="shrink-0" /> Dias restantes no mês</p>
                        </div>
                        <div className="min-w-0">
                          <AutoFitText className={`text-lg sm:text-xl font-extrabold ${textMain}`}>{hero.pendingToday}</AutoFitText>
                          <p className={`text-[11px] font-semibold ${textSub} mt-0.5 flex items-center gap-1`}><ListTodo size={11} className="shrink-0" /> Atividades pendentes</p>
                        </div>
                        <div className="min-w-0">
                          <AutoFitText className={`text-lg sm:text-xl font-extrabold ${textMain}`}>{hero.leaderName || "—"}</AutoFitText>
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

                    {/* Metas/ranking de venda diária são conceito de vestuário — pra consórcio, a aba
                        Metas do próprio ConsorcioDashboard (abaixo) já traz os cards de meta em camadas
                        e vendas recentes, fonte crm_leads/consorcio_goals. */}
                    {!isConsorcio && goalsList.length > 0 && (
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

                    {!isConsorcio && storeRanking.length > 0 && (
                      <div className="card-dark animate-pop">
                        <p className="label-dark mb-3 flex items-center gap-1.5"><Trophy size={14} className="text-goldlight" /> Ranking de vendas — {monthLabel(month)}</p>
                        <ul>
                          {storeRanking.map((r, idx) => (
                            <li key={r.id} className="row-card">
                              <span className={`rank-pos ${rankPosClass(idx)}`}>{idx + 1}</span>
                              <Avatar name={r.name} avatarUrl={r.avatar_url} size={32} />
                              <span className="font-medium text-white text-xs sm:text-sm truncate flex-1 min-w-0">{r.name}</span>
                              <span className="font-bold text-goldlight text-xs sm:text-sm shrink-0 whitespace-nowrap">{formatBRL(r.sold)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {isConsorcio ? (
                  <ConsorcioDashboard
                    lojaId={selectedLojaId}
                    empresaId={profile.empresa_id}
                    viewerRole={canManageSelected ? role : "leitor"}
                    tab={tab}
                    month={month}
                    onOpenEmployee={setViewingEmployee}
                    onOpenGerente={setViewingGerente}
                    atSub={atSub === "placar" ? "funil" : atSub}
                    onAtSubChange={setAtSub}
                  />
                ) : (
                  <EmpresaDashboard
                    lojaId={selectedLojaId}
                    empresaId={profile.empresa_id}
                    viewerRole={canManageSelected ? role : "leitor"}
                    tab={tab}
                    month={month}
                    onOpenEmployee={setViewingEmployee}
                    onOpenGerente={setViewingGerente}
                    atSub={atSub}
                    onAtSubChange={setAtSub}
                  />
                )}

                {tab === "atividades" && !canManageSelected && (
                  <div className="card"><p className="text-xs text-muted">Você tem apenas visualização nessa loja — algumas ações de edição não estarão disponíveis.</p></div>
                )}

                {tab === "atividades" && !isConsorcio && atSub === "placar" && (
                  <>
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
                      <div className="card-dark animate-pop">
                        <p className="label-dark mb-3 flex items-center gap-1.5"><Trophy size={14} className="text-goldlight" /> Ranking de vendas — {monthLabel(month)}</p>
                        <ul>
                          {storeRanking.map((r, idx) => (
                            <li key={r.id} className="row-card">
                              <span className={`rank-pos ${rankPosClass(idx)}`}>{idx + 1}</span>
                              <Avatar name={r.name} avatarUrl={r.avatar_url} size={32} />
                              <span className="font-medium text-white text-xs sm:text-sm truncate flex-1 min-w-0">{r.name}</span>
                              <span className="font-bold text-goldlight text-xs sm:text-sm shrink-0 whitespace-nowrap">{formatBRL(r.sold)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {lojas.length > 1 && <LojaRankingCard byLoja={faturamento.byLoja} month={month} />}
                  </>
                )}

                {tab === "atividades" && isConsorcio && (atSub === "funil" || atSub === "placar") && (
                  <div className="card animate-pop border-purple/20">
                    <p className="label mb-3 flex items-center gap-1.5"><TrendingUp size={14} /> Conversão — {monthLabel(month)}</p>
                    {heroConsorcio.ligacoesMes === 0 ? (
                      <p className="text-sm text-muted">Nenhuma ligação registrada nesse mês ainda.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                          <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(heroConsorcio.pctLigacaoAgendamento)}</AutoFitText>
                          <p className="text-[11px] text-muted mt-0.5">Ligação → Agendamento</p>
                          <p className="text-[10px] text-muted/80 mt-0.5">{heroConsorcio.agendadosMes} de {heroConsorcio.ligacoesMes} ligações</p>
                        </div>
                        <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                          <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(heroConsorcio.pctAgendamentoVenda)}</AutoFitText>
                          <p className="text-[11px] text-muted mt-0.5">Agendamento → Venda</p>
                          <p className="text-[10px] text-muted/80 mt-0.5">{heroConsorcio.vendidosMesCohort} de {heroConsorcio.agendadosMes} agendados</p>
                        </div>
                        <div className="rounded-2xl bg-purple/5 border border-purple/20 p-3 min-w-0">
                          <AutoFitText className="text-2xl font-extrabold text-purple">{formatPct(heroConsorcio.pctLigacaoVenda)}</AutoFitText>
                          <p className="text-[11px] text-muted mt-0.5">Funil completo</p>
                          <p className="text-[10px] text-muted/80 mt-0.5">{heroConsorcio.vendidosMesCohort} de {heroConsorcio.ligacoesMes} ligações</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* 2026-07-20: Rankings/Faturamento agora funcionam pra consórcio também — mesmos
                componentes RankingsTab/FaturamentoTab de vestuário (já eram agnósticos de
                categoria, só consomem os states `rankings`/`faturamento`), alimentados por
                loadRankingsConsorcio/loadFaturamentoConsorcio quando a empresa é consórcio. */}
            {tab === "rankings" && (
              <RankingsTab rankings={rankings} loading={rankingsLoading || faturamentoLoading} month={month} byLoja={faturamento.byLoja} />
            )}

            {tab === "faturamento" && (
              <FaturamentoTab faturamento={faturamento} loading={faturamentoLoading} month={month} />
            )}

            {tab === "supervisores" && role === "socio" && (
              <SupervisoresTab empresaId={profile.empresa_id} lojas={lojas} isConsorcio={isConsorcio} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

// Ranking das LOJAS liberadas pra visão do sócio/supervisor (não de colaboradores) — por valor
// vendido no mês, reaproveitando o mesmo dado já calculado pra aba Faturamento (faturamento.byLoja,
// que já vem ordenado desc). Mesmo padrão visual do card "Ranking de vendas" (numerado, 1º em
// destaque), só que o item aqui é a loja inteira em vez de um colaborador.
function rankPosClass(idx) {
  if (idx === 0) return "rank-pos-1";
  if (idx === 1) return "rank-pos-2";
  if (idx === 2) return "rank-pos-3";
  return "rank-pos-plain";
}

function LojaRankingCard({ byLoja, month }) {
  return (
    <div className="card-dark animate-pop">
      <p className="label-dark mb-3 flex items-center gap-1.5"><Store size={14} className="text-goldlight" /> Ranking de lojas — {monthLabel(month)}</p>
      {byLoja.length === 0 ? (
        <p className="text-sm text-white/50">Nenhum lançamento ainda.</p>
      ) : (
        <ul>
          {byLoja.map((l, idx) => (
            <li key={l.loja_id} className="row-card">
              <span className={`rank-pos ${rankPosClass(idx)}`}>{idx + 1}</span>
              <span className="avatar-chip"><Store size={15} /></span>
              <span className="font-medium text-white text-xs sm:text-sm truncate flex-1 min-w-0">{l.loja_name}</span>
              <span className="font-bold text-goldlight text-xs sm:text-sm shrink-0 whitespace-nowrap">{formatBRL(l.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RankingCard({ title, Icon, items, formatValue, emptyLabel }) {
  return (
    <div className="card-dark">
      <p className="label-dark mb-3 flex items-center gap-1.5"><Icon size={14} className="text-goldlight" /> {title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-white/50">{emptyLabel}</p>
      ) : (
        <ul>
          {items.map((it, idx) => (
            <li key={it.id} className="row-card">
              <span className={`rank-pos ${rankPosClass(idx)}`}>{idx + 1}</span>
              <Avatar name={it.name} avatarUrl={it.avatarUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white text-xs sm:text-sm truncate">{it.name}</p>
                <p className="text-[11px] text-white/50 truncate">{it.lojaName}</p>
              </div>
              <p className="font-bold text-goldlight text-xs sm:text-sm shrink-0 whitespace-nowrap">{formatValue(it.value)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RankingsTab({ rankings, loading, month, byLoja }) {
  if (loading) {
    return <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando…</p>;
  }
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">Rankings entre todas as suas lojas — {monthLabel(month)}.</p>
      <LojaRankingCard byLoja={byLoja} month={month} />
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
        <AutoFitText className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(faturamento.total)}</AutoFitText>
        <p className="relative text-xs font-semibold text-navy/70 mt-1">somando todas as suas lojas</p>
      </div>

      <div className="card overflow-x-auto">
        <p className="label mb-3">Faturamento por loja</p>
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
function SupervisoresTab({ empresaId, lojas, isConsorcio = false }) {
  const notifySaved = useSavedNotice();
  const [loading, setLoading] = useState(true);
  const [supervisores, setSupervisores] = useState([]);
  const [access, setAccess] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [togglingKey, setTogglingKey] = useState(null);
  const [confirmToggleSup, setConfirmToggleSup] = useState(null);

  const [showForm, setShowForm] = useState(false);
  // 2026-07-21: "administrativo" (exclusivo de consórcio) cadastra pelo mesmo formulário —
  // reaproveita a mesma UI de vínculo a múltiplas lojas do supervisor, só sem o toggle ver/gerenciar
  // (administrativo não gerencia loja, só confirma vendas — permission fica sempre 'ver').
  const [roleType, setRoleType] = useState("supervisor");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [picked, setPicked] = useState({});
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");
  const roleLabel = roleType === "administrativo" ? "administrativo" : "supervisor";

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

  function switchRoleType(next) {
    setRoleType(next);
    // administrativo não tem toggle ver/gerenciar — normaliza qualquer seleção já feita pra 'ver'.
    if (next === "administrativo") {
      setPicked((p) => {
        const flat = {};
        Object.keys(p).forEach((k) => { flat[k] = "ver"; });
        return flat;
      });
    }
  }

  function setPickedPermission(lojaId, permission) {
    setPicked((p) => ({ ...p, [lojaId]: permission }));
  }

  async function createSupervisor(e) {
    e.preventDefault();
    const selected = Object.entries(picked).map(([lojaId, permission]) => ({ lojaId, permission: roleType === "administrativo" ? "ver" : permission }));
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
      body: JSON.stringify({ role: roleType, empresaId, fullName: fullName.trim(), username: username.trim(), lojaAccess: selected }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setMsg(`${roleType === "administrativo" ? "Administrativo criado" : "Supervisor criado"}! Usuário: ${json.username}${json.defaultPassword ? ` · senha padrão: ${json.defaultPassword}` : ""}`);
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
    const nextActive = !sup.active;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/update-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ employeeId: sup.id, newActive: nextActive }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || "não foi possível atualizar.");
    }
    notifySaved(`${sup.full_name} ${nextActive ? "ativado(a)" : "desativado(a)"} com sucesso.`);
    await load();
  }

  if (loading) {
    return <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <button type="button" onClick={() => setShowForm((v) => !v)} className="w-full flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 whitespace-nowrap m-0 text-xs uppercase tracking-wider text-muted font-bold">
            <ShieldCheck size={14} className="shrink-0" /> {isConsorcio ? "Novo supervisor / administrativo" : "Novo supervisor"}
          </p>
          {showForm ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
        </button>
        {showForm && (
          lojas.length === 0 ? (
            <p className="text-xs text-muted mt-2">Cadastre uma loja antes de incluir um supervisor.</p>
          ) : (
            <form onSubmit={createSupervisor} className="mt-3 space-y-3">
              {isConsorcio && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5">Papel</p>
                  <div className="flex items-center gap-1.5">
                    {[{ key: "supervisor", label: "Supervisor" }, { key: "administrativo", label: "Administrativo" }].map((opt) => (
                      <button
                        type="button"
                        key={opt.key}
                        onClick={() => switchRoleType(opt.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                          roleType === opt.key ? "bg-navy text-white border-navy" : "border-line text-muted hover:border-navy"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {roleType === "administrativo" && (
                    <p className="text-[11px] text-muted mt-1.5">Confirma/recusa vendas e vê metas e dados de vendas das lojas atribuídas — não gerencia tarefas, advertências, premiações nem colaboradores.</p>
                  )}
                </div>
              )}
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
                        {perm && roleType !== "administrativo" && (
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
              <button className="btn" type="submit" disabled={creating}>{creating ? "Criando…" : `Criar ${roleLabel}`}</button>
              <p className="text-[11px] text-muted">A senha padrão (123456789) é definida automaticamente. Troca no primeiro acesso.</p>
            </form>
          )
        )}
        {msg && (
          <p className="text-xs text-muted mt-2">{msg}</p>
        )}
      </div>

      {[
        { role: "supervisor", label: "Supervisores" },
        ...(isConsorcio ? [{ role: "administrativo", label: "Administrativos" }] : []),
      ].map(({ role: groupRole, label }) => {
        const group = supervisores.filter((s) => (s.role || "supervisor") === groupRole);
        return (
          <div className="card" key={groupRole}>
            <p className="label mb-3 flex items-center gap-1.5"><ShieldCheck size={14} /> {label} ({group.length})</p>
            {group.length === 0 && <p className="text-sm text-muted">Nenhum(a) {groupRole === "administrativo" ? "administrativo" : "supervisor"} cadastrado(a) ainda.</p>}
            <div className="space-y-2">
              {group.map((sup) => {
                const supAccess = access.filter((a) => a.profile_id === sup.id);
                const isOpen = openId === sup.id;
                const isAdministrativo = groupRole === "administrativo";
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
                                  disabled={togglingKey === key || isAdministrativo}
                                  onClick={() => !isAdministrativo && setAccessFor(sup.id, a.loja_id, isManage ? "ver" : "gerenciar")}
                                  title={isAdministrativo ? undefined : "Clique para alternar entre ver e gerenciar"}
                                  className={`badge transition-colors active:scale-95 ${
                                    isManage ? "bg-purple/15 text-purple hover:bg-purple/25" : "bg-teal/10 text-teal hover:bg-teal/20"
                                  } ${isAdministrativo ? "cursor-default" : ""}`}
                                >
                                  <Store size={10} /> {loja?.loja_name || "loja"}{isAdministrativo ? "" : ` · ${isManage ? "gerenciar" : "ver"}`} {!isAdministrativo && <ArrowLeftRight size={10} />}
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setConfirmToggleSup(sup)}
                            title={sup.active ? "Desativar" : "Ativar"}
                            aria-label={sup.active ? "Desativar" : "Ativar"}
                            className={`p-1.5 rounded-lg hover:bg-line/60 transition-colors ${sup.active ? "text-muted hover:text-navy" : "text-danger"}`}
                          >
                            <Power size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <ConfirmModal
        open={!!confirmToggleSup}
        title={`${confirmToggleSup?.active ? "Desativar" : "Ativar"} ${confirmToggleSup?.full_name || ""}?`}
        message={confirmToggleSup?.active ? "A pessoa perde o acesso até você reativar." : "A pessoa recupera o acesso imediatamente."}
        confirmLabel={confirmToggleSup?.active ? "Desativar" : "Ativar"}
        danger={!!confirmToggleSup?.active}
        onConfirm={async () => { await toggleActive(confirmToggleSup); setConfirmToggleSup(null); }}
        onCancel={() => setConfirmToggleSup(null)}
      />
    </div>
  );
}

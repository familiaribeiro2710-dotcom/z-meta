"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Store,
  PhoneCall,
  Phone,
  CalendarClock,
  ListTodo,
  Coins,
  Gift,
  Eye,
  ArrowLeft,
  CheckSquare,
  Check,
  AlertTriangle,
  Target,
  Trophy,
  Home,
  Wallet,
  CalendarDays,
  X,
  TrendingUp,
  Users,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  Edit3,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import ConsorcioDashboard, { CONSORCIO_TABS } from "./ConsorcioDashboard";
import ColaboradorViewConsorcio from "./ColaboradorViewConsorcio";
import ConfirmModal from "./ConfirmModal";
import MonthNav from "./MonthNav";
import SelectField from "./SelectField";
import { CurrencyInput, PhoneInput } from "./MaskedInputs";
import Led from "./Led";
import AutoFitText from "./AutoFitText";
import Avatar from "./Avatar";
import CountUp from "./CountUp";
import MonthClosingAskModal from "./MonthClosingAskModal";
import MonthClosingCongratsModal from "./MonthClosingCongratsModal";
import { needsClosingAsk, unseenClosingWinners, markClosingWinnerSeen, closingTargetMonth, closingTargetMonthLabel } from "./monthClosing";
import { formatBRL, formatPct, currentGoalTarget } from "./scoring";
import { greeting, todayStr, firstDayOfMonth, monthLabel, isTaskDueOn, daysElapsedInMonth, daysInMonth } from "./date";
import { useSavedNotice } from "./SavedNotice";

export { CONSORCIO_TABS };

// Mesmo padrão de medalha usada nos rankings de HierarchyHome.js/ColaboradorView.js/GerenteView.js
// (.rank-pos/.rank-pos-1/2/3/plain).
function rankPosClass(idx) {
  if (idx === 0) return "rank-pos-1";
  if (idx === 1) return "rank-pos-2";
  if (idx === 2) return "rank-pos-3";
  return "rank-pos-plain";
}

// Igual a CONSORCIO_TABS (Início/Metas), só que com "Calendário" no meio — exclusivo do gerente
// (pedido do Felipe: "o gerente também precisa ter uma aba calendário", equipe inteira, não o
// supervisor/sócio/master que usam <ConsorcioDashboard> puro via CONSORCIO_TABS). Usado tanto na
// própria página do gerente (app/gerente/page.js) quanto em qualquer "ver como gerente"
// (HierarchyHome.js, app/admin/page.js) — pela regra de ouro de UI, a tela tem que ficar idêntica.
// 2026-07-20: aba "Leads" — listagem paginada de todos os leads da equipe, com opção de
// transferir 1, vários ou todos de um colaborador pra outro (uso principal: colaborador
// desligado, o gerente redistribui a carteira dele pro resto da equipe sem perder histórico).
// 2026-07-21: aba "Vendas" — pedido explícito do Felipe: "exatamente a aba Vendas que aparece no
// usuário administrativo, tem que ter também na visão do gerente e ele também tem a mesma
// autonomia" (aprovar/recusar/editar venda pendente). Escopada pela equipe do gerente em vez de
// loja_access — RLS já permitia (is_gerente() and is_my_team_member), então essa aba não
// precisou de nenhuma migração, só UI. Ver VendasTab abaixo.
export const GERENTE_TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "calendario", label: "Calendário", Icon: CalendarDays },
  { key: "metas", label: "Metas", Icon: Wallet },
  { key: "leads", label: "Leads", Icon: Users },
  { key: "vendas", label: "Vendas", Icon: Coins },
];

const STATUS_LABEL = {
  novo: "Novo",
  agendado: "Agendado",
  follow_up: "Follow-up",
  perdido: "Perdido",
  vendido_pendente: "Aguardando confirmação",
  vendido: "Vendido",
  cancelado: "Cancelado",
};

const STATUS_CHIP = {
  novo: "bg-line text-muted",
  agendado: "bg-blue/15 text-blue",
  follow_up: "bg-warn/15 text-warn",
  perdido: "bg-danger/15 text-danger",
  vendido: "bg-success/15 text-success",
  vendido_pendente: "bg-orange/15 text-orange",
  cancelado: "bg-line text-muted line-through",
};

function fmtHora(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function fmtLongDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const s = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Espelha buildCalendarGrid de ColaboradorViewConsorcio.js — duplicado de propósito (mesmo padrão
// de isolar risco entre árvores de componente já usado no resto do módulo de consórcio) em vez de
// exportar/importar entre os dois arquivos.
function buildCalendarGrid(monthStr) {
  const totalDays = daysInMonth(monthStr);
  const firstWeekday = new Date(monthStr + "T00:00:00").getDay();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(`${monthStr.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Espelha lib/GerenteView.js (segmento vestuário) pro segmento CONSÓRCIO — mesma estrutura (herocard +
// dashboard da loja + cards de apoio), só troca a fonte dos dados: em vez de sales_entries/sales_goals
// (venda diária), usa crm_leads (funil ligação → agendamento → resultado) e consorcio_goals. Usado
// tanto pela própria página do gerente quanto pelo supervisor "vendo como" um gerente de loja consórcio.
export default function GerenteViewConsorcio({ profile, tab, viewedBySupervisor = false, onBack }) {
  const [lojaName, setLojaName] = useState("");
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(firstDayOfMonth(todayStr()));
  // sub-aba ativa dentro de <ConsorcioDashboard> (funil/colaboradores/tarefas/advertencias/
  // premiacoes) — os cards de apoio abaixo só aparecem junto do Funil, mesmo padrão do GerenteView.js.
  const [atSub, setAtSub] = useState("funil");
  const didInit = useRef(false);
  const [hero, setHero] = useState({
    metaLoja: 0,
    soldLoja: 0,
    ligacoesHoje: 0,
    agendamentosHoje: 0,
    pendingToday: 0,
    commissionSoFar: 0,
    prizesSoFar: 0,
    commissionPct: 0,
    commissionTierLabel: "não atingimento",
    leaderName: null,
    ligacoesMes: 0,
    agendadosMes: 0,
    vendidosMesCohort: 0,
    pctLigacaoAgendamento: 0,
    pctAgendamentoVenda: 0,
    pctLigacaoVenda: 0,
  });
  const [personalTasks, setPersonalTasks] = useState([]);
  const [personalCompletions, setPersonalCompletions] = useState({});
  const [personalWarnings, setPersonalWarnings] = useState([]);
  const [personalPrizes, setPersonalPrizes] = useState([]);
  const [teamEmps, setTeamEmps] = useState([]);
  const [activeGoal, setActiveGoal] = useState(null);
  const [activeGoalAllocs, setActiveGoalAllocs] = useState([]);
  const [storeRanking, setStoreRanking] = useState([]);
  const [teamActivity, setTeamActivity] = useState([]);
  const [showClosingAsk, setShowClosingAsk] = useState(false);
  const [closingWinners, setClosingWinners] = useState([]);
  // Agenda de hoje (todos os colaboradores) — pra viver tanto no card do Início quanto como base
  // do dia selecionado ao abrir a aba Calendário já em "hoje".
  const [todayMeetings, setTodayMeetings] = useState([]);
  // Aba Calendário — mês navegável independente do MonthNav do Início (que controla soldLoja/metas).
  const [calMonth, setCalMonth] = useState(firstDayOfMonth(todayStr()));
  const [calSelectedDay, setCalSelectedDay] = useState(todayStr());
  const [calLeads, setCalLeads] = useState([]);
  // Guarda o empIds mais recente fora de state — evita depender de teamEmps (que muda de referência
  // logo após o mount, ainda com didInit.current=false) como gatilho do efeito da aba Calendário.
  const teamEmpIdsRef = useRef([]);
  const greet = greeting();
  const today = todayStr();
  const month = selectedMonth || firstDayOfMonth(today);

  // Ritual de fechamento de mês — só na sessão real do gerente (nunca em "ver como"). Reavalia
  // toda vez que a aba Início é reaberta, mesmo padrão de GerenteView.js (vestuário) — aqui a
  // RPC é a variante _consorcio (crm_leads em vez de sales_entries).
  useEffect(() => {
    if (tab !== "atividades" || viewedBySupervisor) return;
    let active = true;
    (async () => {
      const [winners, needsAsk] = await Promise.all([
        unseenClosingWinners(profile.id, "gerente"),
        needsClosingAsk(profile.id),
      ]);
      if (!active) return;
      setClosingWinners(winners);
      setShowClosingAsk(needsAsk);
    })();
    return () => { active = false; };
  }, [tab, profile.id, viewedBySupervisor]);

  // tarefas/advertências/premiações lançadas diretamente pro gerente (não pra equipe) — 100%
  // idêntico ao GerenteView.js (vestuário): tasks/warnings/employee_prizes não têm nada de específico
  // de categoria.
  const loadPersonal = useCallback(async (prof, monthArg) => {
    const nextMonth = new Date(monthArg + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    const { data: myTasks } = await supabase.from("tasks").select("*").eq("employee_id", prof.id).eq("active", true).order("created_at");
    setPersonalTasks(myTasks || []);
    const taskIds = (myTasks || []).map((t) => t.id);
    if (taskIds.length) {
      const { data: rows } = await supabase.from("task_completions").select("*").in("task_id", taskIds).eq("completion_date", todayStr());
      const map = {};
      (rows || []).forEach((r) => { map[r.task_id] = r; });
      setPersonalCompletions(map);
    } else {
      setPersonalCompletions({});
    }

    const { data: wRows } = await supabase
      .from("warnings")
      .select("*")
      .eq("employee_id", prof.id)
      .gte("warning_date", monthArg)
      .lt("warning_date", nextMonthStr);
    setPersonalWarnings(wRows || []);

    const { data: pRows } = await supabase.from("employee_prizes").select("*").eq("employee_id", prof.id).eq("month", monthArg);
    setPersonalPrizes(pRows || []);
  }, []);

  async function togglePersonalTask(taskId) {
    // Tarefa "contatos" nunca é marcada manualmente — o banco calcula sozinho (ver
    // sync_contatos_completions/trigger em crm_leads). Não deveria existir atribuída
    // diretamente a um gerente na prática, mas a defesa fica aqui por segurança.
    const task = personalTasks.find((t) => t.id === taskId);
    if (task?.task_type === "contatos") return;
    const current = !!personalCompletions[taskId]?.completed;
    const newVal = !current;
    await supabase.from("task_completions").upsert(
      { task_id: taskId, completion_date: today, completed: newVal, completed_at: newVal ? new Date().toISOString() : null },
      { onConflict: "task_id,completion_date" }
    );
    setPersonalCompletions((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), completed: newVal } }));
  }

  const loadStats = useCallback(async (prof, monthArg) => {
    const { data: loja } = await supabase.from("lojas").select("name").eq("id", prof.loja_id).single();
    setLojaName(loja?.name || "");

    const { data: emps } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("gerente_id", prof.id)
      .eq("role", "colaborador")
      .eq("active", true);
    const empIds = (emps || []).map((e) => e.id);
    setTeamEmps(emps || []);
    teamEmpIdsRef.current = empIds;

    const nextMonth = new Date(monthArg + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    // Agenda de hoje (equipe inteira) — mesma janela de "hoje" usada pra ligacoesHoje/agendamentosHoje
    // abaixo, mas guardando as linhas (não só a contagem) pra alimentar o card do Início e a aba
    // Calendário já abrindo em "hoje".
    if (monthArg === firstDayOfMonth(todayStr()) && empIds.length) {
      const todayNow = todayStr();
      const tomorrow = new Date(todayNow + "T00:00:00");
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      const { data: meetingRows } = await supabase
        .from("crm_leads")
        .select("id, employee_id, nome_completo, telefone, status, agendamento_at")
        .in("employee_id", empIds)
        .gte("agendamento_at", todayNow)
        .lt("agendamento_at", tomorrowStr)
        .order("agendamento_at", { ascending: true });
      setTodayMeetings(meetingRows || []);
    } else {
      setTodayMeetings([]);
    }

    // Atividades pendentes hoje — idêntico ao GerenteView.js (task-based, agnóstico de categoria).
    let pendingToday = 0;
    if (monthArg === firstDayOfMonth(todayStr()) && empIds.length) {
      const { data: activeTasks } = await supabase
        .from("tasks")
        .select("id, recurrence_type, weekday, once_date, start_date")
        .in("employee_id", empIds)
        .eq("active", true);
      const dueToday = (activeTasks || []).filter((t) => isTaskDueOn(t, todayStr()));
      const taskIds = dueToday.map((t) => t.id);
      if (taskIds.length) {
        const { data: todayRows } = await supabase
          .from("task_completions")
          .select("task_id, completed")
          .in("task_id", taskIds)
          .eq("completion_date", todayStr());
        const doneTaskIds = new Set((todayRows || []).filter((r) => r.completed).map((r) => r.task_id));
        pendingToday = taskIds.filter((id) => !doneTaskIds.has(id)).length;
      }
    }

    // Atividades por colaborador — idêntico ao GerenteView.js (mesmo padrão de cálculo, ver
    // comentário detalhado lá: "esperado" nunca vem de contar completions existentes).
    let teamActivityData = [];
    if (empIds.length) {
      const { data: allTeamTasks } = await supabase
        .from("tasks")
        .select("id, employee_id, recurrence_type, weekday, once_date, start_date")
        .in("employee_id", empIds)
        .eq("active", true);
      const allTaskIds = (allTeamTasks || []).map((t) => t.id);

      let actCompletions = [];
      if (allTaskIds.length) {
        const { data } = await supabase
          .from("task_completions")
          .select("task_id, completed, completion_date")
          .in("task_id", allTaskIds)
          .gte("completion_date", monthArg)
          .lt("completion_date", nextMonthStr);
        actCompletions = data || [];
      }
      const completionMap = {};
      actCompletions.forEach((c) => { completionMap[`${c.task_id}|${c.completion_date}`] = c.completed; });

      const todayNow = todayStr();
      const daysRange = daysElapsedInMonth(monthArg, todayNow);

      teamActivityData = (emps || []).map((emp) => {
        const empTasks = (allTeamTasks || []).filter((t) => t.employee_id === emp.id);
        let expected = 0, doneCount = 0, overdue = 0, pendingTodayCount = 0;
        empTasks.forEach((t) => {
          daysRange.forEach((ds) => {
            if (!isTaskDueOn(t, ds)) return;
            expected++;
            if (completionMap[`${t.id}|${ds}`]) doneCount++;
            else if (ds < todayNow) overdue++;
            else if (ds === todayNow) pendingTodayCount++;
          });
        });
        let status = "gray";
        if (overdue > 0) status = "red";
        else if (pendingTodayCount > 0) status = "yellow";
        else if (expected > 0 && doneCount === expected) status = "green";
        return { id: emp.id, name: emp.full_name, expected, completed: doneCount, overdue, pendingToday: pendingTodayCount, status };
      });
    }
    setTeamActivity(teamActivityData);

    const { data: goalRows } = await supabase
      .from("consorcio_goals")
      .select("id, name, store_total, commission_pct_colaborador, commission_pct_gerente")
      .eq("loja_id", prof.loja_id)
      .eq("month", monthArg)
      .order("store_total", { ascending: true });

    let leadRows = [];
    let ligacoesHoje = 0;
    let agendamentosHoje = 0;
    if (empIds.length) {
      const { data } = await supabase.from("crm_leads").select("employee_id, status, valor, data_ligacao, agendamento_at, vendido_at").in("employee_id", empIds);
      leadRows = data || [];
      const todayNow = todayStr();
      ligacoesHoje = leadRows.filter((l) => l.data_ligacao === todayNow).length;
      agendamentosHoje = leadRows.filter((l) => l.agendamento_at && l.agendamento_at.slice(0, 10) === todayNow).length;
    }
    const vendidoRows = leadRows.filter((l) => l.status === "vendido" && l.vendido_at && l.vendido_at.slice(0, 7) === monthArg.slice(0, 7));
    const soldLoja = vendidoRows.reduce((s, l) => s + Number(l.valor || 0), 0);

    // Conversão do mês — mesma lógica/cohort de ConsorcioDashboard.js (Funil): agrupa por
    // data_ligacao (não por vendido_at/agendamento_at), pra manter a mesma safra do início ao fim
    // do funil. Agendados em aberto contam no denominador de agendamento→venda (decisão confirmada
    // com o Felipe).
    const cohortRows = leadRows.filter((l) => l.data_ligacao && l.data_ligacao.slice(0, 7) === monthArg.slice(0, 7));
    const ligacoesMes = cohortRows.length;
    const agendadosMes = cohortRows.filter((l) => !!l.agendamento_at).length;
    const vendidosMesCohort = cohortRows.filter((l) => l.status === "vendido").length;
    const pctLigacaoAgendamento = ligacoesMes > 0 ? (agendadosMes / ligacoesMes) * 100 : 0;
    const pctAgendamentoVenda = agendadosMes > 0 ? (vendidosMesCohort / agendadosMes) * 100 : 0;
    const pctLigacaoVenda = ligacoesMes > 0 ? (vendidosMesCohort / ligacoesMes) * 100 : 0;

    const soldByEmp = {};
    vendidoRows.forEach((l) => {
      soldByEmp[l.employee_id] = (soldByEmp[l.employee_id] || 0) + Number(l.valor || 0);
    });
    let leaderName = null;
    let leaderSold = 0;
    (emps || []).forEach((emp) => {
      const sold = soldByEmp[emp.id] || 0;
      if (sold > leaderSold) { leaderSold = sold; leaderName = emp.full_name; }
    });

    const ranking = (emps || [])
      .map((emp) => ({ id: emp.id, name: emp.full_name, avatar_url: emp.avatar_url, sold: soldByEmp[emp.id] || 0 }))
      .sort((a, b) => b.sold - a.sold);
    setStoreRanking(ranking);

    const metaLoja = currentGoalTarget((goalRows || []).map((g) => g.store_total), soldLoja);
    const activeGoalRow = (goalRows || []).find((g) => soldLoja < Number(g.store_total)) || (goalRows && goalRows.length ? goalRows[goalRows.length - 1] : null);
    setActiveGoal(activeGoalRow || null);

    if (activeGoalRow && empIds.length) {
      const { data: allocRows } = await supabase
        .from("consorcio_goal_allocations")
        .select("*")
        .eq("goal_id", activeGoalRow.id)
        .in("employee_id", empIds);
      setActiveGoalAllocs(allocRows || []);
    } else {
      setActiveGoalAllocs([]);
    }

    const { data: commissionRow } = await supabase
      .from("consorcio_commission_settings")
      .select("*")
      .eq("loja_id", prof.loja_id)
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
      const { data: prizeRows } = await supabase
        .from("employee_prizes")
        .select("amount")
        .in("employee_id", empIds)
        .eq("month", monthArg);
      prizesSoFar = (prizeRows || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    }

    setHero({
      metaLoja, soldLoja, ligacoesHoje, agendamentosHoje, pendingToday, commissionSoFar, prizesSoFar, commissionPct, commissionTierLabel, leaderName,
      ligacoesMes, agendadosMes, vendidosMesCohort, pctLigacaoAgendamento, pctAgendamentoVenda, pctLigacaoVenda,
    });
  }, []);

  // Aba Calendário — agendamentos de TODOS os colaboradores da equipe no mês navegado (não só o
  // usuário logado, ao contrário de ColaboradorViewConsorcio.js). Independente do MonthNav do
  // Início (calMonth tem sua própria navegação).
  const loadCalendar = useCallback(async (empIds, monthArg) => {
    if (!empIds.length) { setCalLeads([]); return; }
    const nextMonth = new Date(monthArg + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);
    const { data } = await supabase
      .from("crm_leads")
      .select("id, employee_id, nome_completo, telefone, status, agendamento_at, feedback, valor")
      .in("employee_id", empIds)
      .not("agendamento_at", "is", null)
      .gte("agendamento_at", monthArg)
      .lt("agendamento_at", nextMonthStr);
    setCalLeads(data || []);
  }, []);

  useEffect(() => {
    if (!didInit.current) return;
    loadCalendar(teamEmpIdsRef.current, calMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calMonth]);

  useEffect(() => {
    let active = true;
    (async () => {
      const initialMonth = firstDayOfMonth(todayStr());
      await Promise.all([loadStats(profile, initialMonth), loadPersonal(profile, initialMonth)]);
      if (!active) return;
      didInit.current = true;
      loadCalendar(teamEmpIdsRef.current, calMonth);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  useEffect(() => {
    if (!didInit.current || !selectedMonth) return;
    loadStats(profile, selectedMonth);
    loadPersonal(profile, selectedMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const personalTasksToday = personalTasks.filter((t) => isTaskDueOn(t, today));
  const restoDaMeta = Math.max(0, hero.metaLoja - hero.soldLoja);

  // Nome do colaborador por id — pra atribuir cada compromisso no card do Início e no Calendário
  // (diferença chave em relação ao calendário do próprio colaborador: aqui é a equipe inteira).
  const empNameById = {};
  teamEmps.forEach((e) => { empNameById[e.id] = e.full_name; });
  const calWeeks = buildCalendarGrid(calMonth);
  const leadsByDay = {};
  calLeads.forEach((l) => {
    const day = l.agendamento_at.slice(0, 10);
    if (!leadsByDay[day]) leadsByDay[day] = [];
    leadsByDay[day].push(l);
  });
  Object.values(leadsByDay).forEach((arr) => arr.sort((a, b) => (a.agendamento_at < b.agendamento_at ? -1 : 1)));

  if (viewingEmployee) {
    return (
      <ColaboradorViewConsorcio
        key={viewingEmployee.id}
        profile={viewingEmployee}
        tab={tab}
        viewedByManager
        onBack={() => setViewingEmployee(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {closingWinners.length > 0 && (
        <MonthClosingCongratsModal
          winner={closingWinners[0]}
          role="gerente"
          firstName={profile.full_name.split(" ")[0]}
          monthLabelText={closingTargetMonthLabel()}
          onClose={async () => {
            await markClosingWinnerSeen(closingWinners[0].id);
            setClosingWinners((q) => q.slice(1));
          }}
        />
      )}
      {closingWinners.length === 0 && (
        <MonthClosingAskModal
          open={showClosingAsk}
          role="gerente"
          monthLabel={closingTargetMonthLabel()}
          onConfirm={async () => {
            const { error } = await supabase.rpc("confirm_month_closing_gerente_consorcio", { p_month: closingTargetMonth() });
            if (error) throw error;
            setShowClosingAsk(false);
          }}
          onDismiss={() => setShowClosingAsk(false)}
        />
      )}

      {viewedBySupervisor && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-teal/10 border-2 border-teal/25 rounded-2xl px-4 py-2.5">
          <span className="text-xs font-bold text-teal flex items-center gap-1.5">
            <Eye size={14} /> Visualizando como {profile.full_name} — mesma tela que ele(a) vê ao entrar
          </span>
          {onBack && (
            <button onClick={onBack} className="text-xs font-bold uppercase tracking-wider text-navy flex items-center gap-1 hover:text-teal">
              <ArrowLeft size={13} /> Voltar
            </button>
          )}
        </div>
      )}

      {tab === "atividades" && (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold text-navy flex items-center gap-2">
              <greet.Icon size={20} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
            </h1>
            <MonthNav month={month} onChange={setSelectedMonth} maxMonth={firstDayOfMonth(today)} />
          </div>

          <div
            className="relative overflow-hidden rounded-3xl p-6 sm:p-7 reveal-up"
            style={{ background: "linear-gradient(135deg, #16a34a 0%, #4ade80 100%)", boxShadow: "0 10px 28px rgba(22,163,74,0.35)" }}
          >
            <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/15" />
            <div className="relative flex items-center gap-2 mb-3">
              <Store size={18} className="text-navy" />
              <span className="text-xs font-bold uppercase tracking-wider text-navy">Funil de hoje · {lojaName || "sua loja"}</span>
            </div>
            <AutoFitText className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(hero.soldLoja)}</AutoFitText>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">
              {hero.metaLoja > 0 ? `faltam ${formatBRL(restoDaMeta)} pra próxima meta` : "nenhuma meta cadastrada ainda"}
            </p>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">Vendido no mês — {monthLabel(month)}</p>

            <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-4 mt-6 pt-5 border-t border-navy/15">
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{hero.ligacoesHoje}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><PhoneCall size={11} className="shrink-0" /> Ligações hoje</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{hero.agendamentosHoje}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><CalendarClock size={11} className="shrink-0" /> Reuniões hoje</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{hero.pendingToday}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><ListTodo size={11} className="shrink-0" /> Atividades pendentes</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{formatBRL(hero.commissionSoFar)}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Coins size={11} className="shrink-0" /> Comissão até agora</p>
                {hero.metaLoja > 0 && (
                  <p className="text-[10px] text-navy/60 mt-0.5">{hero.commissionPct}% · {hero.commissionTierLabel}</p>
                )}
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{formatBRL(hero.prizesSoFar)}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Gift size={11} className="shrink-0" /> Premiações</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{hero.leaderName || "—"}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Trophy size={11} className="shrink-0" /> Líder de vendas</p>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "calendario" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-extrabold text-navy capitalize flex items-center gap-2">
              <CalendarDays size={22} className="text-blue" /> {capitalize(monthLabel(calMonth))}
            </h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-outline !py-1.5 !text-xs whitespace-nowrap"
                onClick={() => { setCalMonth(firstDayOfMonth(todayStr())); setCalSelectedDay(todayStr()); }}
              >
                Hoje
              </button>
              <MonthNav month={calMonth} onChange={setCalMonth} />
            </div>
          </div>
          <p className="text-xs text-muted -mt-4">Reuniões de toda a equipe — {lojaName || "sua loja"}.</p>

          <div className="card">
            <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center mb-1">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                <div key={i} className="text-[10px] sm:text-xs font-bold text-muted uppercase py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {calWeeks.flat().map((dateStr, idx) => {
                if (!dateStr) return <div key={idx} />;
                const dayLeads = leadsByDay[dateStr] || [];
                const isToday = dateStr === today;
                const isSelected = dateStr === calSelectedDay;
                const dayNum = Number(dateStr.slice(-2));
                const visible = dayLeads.slice(0, 2);
                const extra = dayLeads.length - visible.length;
                return (
                  <button
                    type="button"
                    key={dateStr}
                    onClick={() => setCalSelectedDay(dateStr)}
                    className={`min-h-[64px] sm:min-h-[80px] rounded-xl p-1 sm:p-1.5 text-left border-2 transition-all overflow-hidden ${
                      isSelected ? "border-blue bg-blue/5" : "border-transparent hover:border-line"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[11px] sm:text-xs font-bold ${
                        isToday ? "bg-pink text-white" : "text-navy"
                      }`}
                    >
                      {dayNum}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {visible.map((l) => (
                        <div key={l.id} className={`text-[9px] sm:text-[10px] font-semibold truncate px-1 py-0.5 rounded ${STATUS_CHIP[l.status] || ""}`}>
                          {(empNameById[l.employee_id] || "—").split(" ")[0]}: {l.nome_completo}
                        </div>
                      ))}
                      {extra > 0 && <div className="text-[9px] sm:text-[10px] text-muted px-1">+{extra}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {calSelectedDay && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="label mb-0">{fmtLongDate(calSelectedDay)}</p>
                <button type="button" onClick={() => setCalSelectedDay(null)} className="text-muted hover:text-navy" aria-label="Fechar">
                  <X size={16} />
                </button>
              </div>
              {(leadsByDay[calSelectedDay] || []).length === 0 ? (
                <p className="text-sm text-muted">Nada agendado nesse dia.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {(leadsByDay[calSelectedDay] || []).map((l) => (
                    <li key={l.id} className="py-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-navy flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{l.nome_completo}</span>
                            <span className={`badge !text-[10px] shrink-0 ${STATUS_CHIP[l.status] || STATUS_CHIP.novo}`}>{fmtHora(l.agendamento_at)}</span>
                          </p>
                          <p className="text-xs text-muted mt-0.5 flex items-center gap-3 flex-wrap">
                            <span className="flex items-center gap-1"><Phone size={11} className="shrink-0" /> {l.telefone}</span>
                            <span>{empNameById[l.employee_id] || "—"}</span>
                          </p>
                          {l.feedback && <p className="text-[11px] text-muted mt-1 italic truncate">&ldquo;{l.feedback}&rdquo;</p>}
                          {(l.status === "vendido" || l.status === "vendido_pendente") && <p className={`text-xs font-bold mt-1 ${l.status === "vendido" ? "text-success" : "text-orange"}`}>{formatBRL(l.valor)}</p>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "leads" && <LeadsTab teamEmps={teamEmps} />}

      {tab === "vendas" && <VendasTab teamEmps={teamEmps} profile={profile} />}

      {tab !== "calendario" && tab !== "leads" && tab !== "vendas" && (
        <ConsorcioDashboard
          lojaId={profile.loja_id}
          empresaId={profile.empresa_id}
          viewerRole="gerente"
          viewerId={profile.id}
          tab={tab}
          month={month}
          onOpenEmployee={setViewingEmployee}
          atSub={atSub}
          onAtSubChange={setAtSub}
        />
      )}

      {tab === "atividades" && atSub === "funil" && (
        <>
          <div className="card animate-pop border-blue/20">
            <p className="label mb-3 flex items-center gap-1.5"><CalendarDays size={14} /> Agenda de hoje — equipe inteira</p>
            {todayMeetings.length === 0 ? (
              <p className="text-sm text-muted">Nenhum agendamento pra hoje na equipe.</p>
            ) : (
              <ul className="divide-y divide-line">
                {todayMeetings.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`badge !text-[10px] shrink-0 ${STATUS_CHIP[l.status] || STATUS_CHIP.novo}`}>{fmtHora(l.agendamento_at)}</span>
                      <span className="min-w-0">
                        <span className="block font-medium text-navy truncate">{l.nome_completo}</span>
                        <span className="block text-[11px] text-muted truncate">{empNameById[l.employee_id] || "—"}</span>
                      </span>
                    </span>
                    <span className="text-muted shrink-0 flex items-center gap-1 text-xs"><Phone size={11} /> {l.telefone}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card animate-pop border-purple/20">
            <p className="label mb-3 flex items-center gap-1.5"><TrendingUp size={14} /> Conversão — {monthLabel(month)}</p>
            {hero.ligacoesMes === 0 ? (
              <p className="text-sm text-muted">Nenhuma ligação registrada nesse mês ainda.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                  <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(hero.pctLigacaoAgendamento)}</AutoFitText>
                  <p className="text-[11px] text-muted mt-0.5">Ligação → Agendamento</p>
                  <p className="text-[10px] text-muted/80 mt-0.5">{hero.agendadosMes} de {hero.ligacoesMes} ligações</p>
                </div>
                <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                  <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(hero.pctAgendamentoVenda)}</AutoFitText>
                  <p className="text-[11px] text-muted mt-0.5">Agendamento → Venda</p>
                  <p className="text-[10px] text-muted/80 mt-0.5">{hero.vendidosMesCohort} de {hero.agendadosMes} agendados</p>
                </div>
                <div className="rounded-2xl bg-purple/5 border border-purple/20 p-3 min-w-0">
                  <AutoFitText className="text-2xl font-extrabold text-purple">{formatPct(hero.pctLigacaoVenda)}</AutoFitText>
                  <p className="text-[11px] text-muted mt-0.5">Funil completo</p>
                  <p className="text-[10px] text-muted/80 mt-0.5">{hero.vendidosMesCohort} de {hero.ligacoesMes} ligações</p>
                </div>
              </div>
            )}
          </div>

          {activeGoal && (
            <div className="card animate-pop border-blue/20">
              <p className="label mb-3 flex items-center gap-1.5"><Target size={14} /> Distribuição da meta em jogo — {activeGoal.name}</p>
              {teamEmps.length === 0 ? (
                <p className="text-sm text-muted">Nenhum colaborador na equipe ainda.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {teamEmps.map((emp) => {
                    const alloc = activeGoalAllocs.find((a) => a.employee_id === emp.id);
                    return (
                      <li key={emp.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="text-navy font-medium truncate min-w-0">{emp.full_name}</span>
                        <span className="text-muted shrink-0 whitespace-nowrap">{alloc ? formatBRL(alloc.amount) : "sem distribuição"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {storeRanking.length > 0 && (
            <div className="card-dark animate-pop">
              <p className="label-dark mb-3 flex items-center gap-1.5"><Trophy size={14} className="text-goldlight" /> Ranking de vendas — {monthLabel(month)}</p>
              <ul>
                {storeRanking.map((r, idx) => (
                  <li key={r.id} className="row-card reveal-up" style={{ animationDelay: `${idx * 60}ms` }}>
                    <span className={`rank-pos ${rankPosClass(idx)}`}>{idx + 1}</span>
                    <Avatar name={r.name} avatarUrl={r.avatar_url} size={32} />
                    <span className="font-medium text-white text-xs sm:text-sm truncate flex-1 min-w-0">{r.name}</span>
                    <span className="font-bold text-goldlight text-xs sm:text-sm shrink-0 whitespace-nowrap"><CountUp value={r.sold} currency /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {teamActivity.length > 0 && (
            <div className="card animate-pop">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <p className="label mb-0 flex items-center gap-1.5"><CheckSquare size={14} /> Atividades por colaborador</p>
                <div className="flex items-center gap-3 text-[10px] text-muted font-medium">
                  <span className="flex items-center gap-1"><Led color="red" size={8} /> atrasada</span>
                  <span className="flex items-center gap-1"><Led color="yellow" size={8} /> pendente hoje</span>
                  <span className="flex items-center gap-1"><Led color="green" size={8} /> em dia</span>
                </div>
              </div>
              <ul className="divide-y divide-line">
                {teamActivity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-xs sm:text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <Led color={a.status} size={9} />
                      <span className="font-medium text-navy truncate">{a.name}</span>
                    </span>
                    <span className="text-muted shrink-0 whitespace-nowrap">{a.completed}/{a.expected} tarefas</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(personalTasksToday.length > 0 || personalWarnings.length > 0 || personalPrizes.length > 0) && (
            <div className="card border-teal/20">
              <p className="label mb-3 flex items-center gap-1.5"><CheckSquare size={14} /> Painel pessoal (definido pelo supervisor)</p>
              {personalTasksToday.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted mb-2">Suas tarefas de hoje</p>
                  <ul className="divide-y divide-line">
                    {personalTasksToday.map((t) => {
                      const done = !!personalCompletions[t.id]?.completed;
                      const isContatos = t.task_type === "contatos";
                      return (
                        <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                          {isContatos ? (
                            <span
                              title="Marcado automaticamente pelo sistema"
                              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-bold text-white transition-all ${done ? "" : "bg-blue/15 text-blue"}`}
                              style={done ? { background: "linear-gradient(135deg, #84cc16, #0d9488)" } : undefined}
                            >
                              {done ? <Check size={13} strokeWidth={3} /> : <PhoneCall size={12} />}
                            </span>
                          ) : (
                            <button
                              onClick={() => togglePersonalTask(t.id)}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-bold text-white transition-all ${done ? "" : "bg-line text-muted hover:bg-line/70"}`}
                              style={done ? { background: "linear-gradient(135deg, #84cc16, #0d9488)" } : undefined}
                            >
                              {done && <Check size={13} strokeWidth={3} />}
                            </button>
                          )}
                          <span className={done ? "text-navy line-through" : "text-navy"}>{t.title}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-muted flex-wrap">
                {personalWarnings.length > 0 && (
                  <span className="flex items-center gap-1"><AlertTriangle size={13} className="text-warn" /> {personalWarnings.length} advertência(s) no mês</span>
                )}
                {personalPrizes.length > 0 && (
                  <span className="flex items-center gap-1"><Gift size={13} className="text-purple" /> {formatBRL(personalPrizes.reduce((s, p) => s + Number(p.amount || 0), 0))} em premiações no mês</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const LEADS_PAGE_SIZE = 20;

// 2026-07-20: aba Leads do gerente — listagem paginada de todos os leads da equipe (todos os
// colaboradores ativos dela) com opção de transferir 1, vários ou todos os leads selecionados
// pra outro colaborador da mesma equipe. Caso de uso principal (pedido do Felipe): colaborador
// desligado — o gerente redistribui a carteira de leads dele pro resto da equipe sem perder
// histórico (é um UPDATE de employee_id, não um DELETE — o lead continua existindo, só muda de
// dono). Busca tudo de uma vez (mesmo padrão de fetch amplo + filtro/paginação em JS já usado no
// resto do módulo de consórcio, ver ConsorcioDashboard.js) — volume de leads por equipe não deve
// justificar paginação de verdade no servidor.
function LeadsTab({ teamEmps }) {
  const notifySaved = useSavedNotice();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  // Rascunho do filtro (draftFilterEmp/draftSearch) só passa a valer quando o usuário clica em
  // "Aplicar filtros" (pedido do Felipe: nenhum filtro do app pode recalcular a cada tecla
  // digitada/campo alterado — mesmo padrão já usado em ConsorcioDashboard.js).
  const [draftFilterEmp, setDraftFilterEmp] = useState("todos");
  const [draftSearch, setDraftSearch] = useState("");
  const [filterEmp, setFilterEmp] = useState("todos");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState({});
  const [targetEmployee, setTargetEmployee] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const empIds = teamEmps.map((e) => e.id);
  const empNameById = {};
  teamEmps.forEach((e) => { empNameById[e.id] = e.full_name; });

  const load = useCallback(async () => {
    if (!empIds.length) { setLeads([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("crm_leads")
      .select("id, employee_id, nome_completo, telefone, status, data_ligacao, agendamento_at, valor, created_at")
      .in("employee_id", empIds)
      .order("created_at", { ascending: false });
    setLeads(data || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamEmps]);

  useEffect(() => { load(); }, [load]);

  const filtered = leads.filter((l) => {
    if (filterEmp !== "todos" && l.employee_id !== filterEmp) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!l.nome_completo?.toLowerCase().includes(q) && !l.telefone?.includes(q)) return false;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / LEADS_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(pageClamped * LEADS_PAGE_SIZE, pageClamped * LEADS_PAGE_SIZE + LEADS_PAGE_SIZE);
  const selectedCount = Object.values(selectedIds).filter(Boolean).length;
  // teamEmps já vem só com colaboradores ativos (query em loadStats já filtra active=true) —
  // qualquer um da equipe é um destino válido de transferência.
  const eligibleTargets = teamEmps;
  const filtroAtivo = filterEmp !== "todos" || !!search.trim();
  const filtrosPendentes = draftFilterEmp !== filterEmp || draftSearch !== search;

  function aplicarFiltros(e) {
    if (e) e.preventDefault();
    setFilterEmp(draftFilterEmp);
    setSearch(draftSearch);
    setPage(0);
  }

  function limparFiltros() {
    setDraftFilterEmp("todos");
    setDraftSearch("");
    setFilterEmp("todos");
    setSearch("");
    setPage(0);
  }

  function toggleOne(id) {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function togglePage(checked) {
    setSelectedIds((prev) => {
      const next = { ...prev };
      pageItems.forEach((l) => { next[l.id] = checked; });
      return next;
    });
  }

  function selectAllFiltered() {
    const next = {};
    filtered.forEach((l) => { next[l.id] = true; });
    setSelectedIds(next);
  }

  function clearSelection() {
    setSelectedIds({});
  }

  async function confirmTransfer() {
    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (!ids.length || !targetEmployee) return;
    setTransferring(true);
    const { error } = await supabase.from("crm_leads").update({ employee_id: targetEmployee, updated_at: new Date().toISOString() }).in("id", ids);
    setTransferring(false);
    if (error) throw new Error(error.message || "Não foi possível transferir os leads.");
    setConfirmOpen(false);
    clearSelection();
    notifySaved(`${ids.length} lead(s) transferido(s) com sucesso.`);
    await load();
  }

  const pageAllSelected = pageItems.length > 0 && pageItems.every((l) => selectedIds[l.id]);

  if (loading) {
    return <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <form onSubmit={aplicarFiltros} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="label">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input !pl-9"
                placeholder="nome ou telefone"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="sm:w-56">
            <label className="label">Colaborador</label>
            <SelectField className="w-full" value={draftFilterEmp} onChange={(e) => setDraftFilterEmp(e.target.value)}>
              <option value="todos">Todos da equipe</option>
              {teamEmps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </SelectField>
          </div>
          <div className="flex items-end gap-3">
            <button type="submit" className="btn !py-1.5 !text-xs whitespace-nowrap">Aplicar filtros</button>
            {(filtroAtivo || filtrosPendentes) && (
              <button type="button" onClick={limparFiltros} className="text-[11px] font-bold uppercase tracking-wider text-muted hover:text-blue whitespace-nowrap">
                Limpar
              </button>
            )}
          </div>
        </form>
        {filtrosPendentes && <p className="text-[11px] text-warn mt-2">alterações pendentes — clique em Aplicar</p>}
      </div>

      {selectedCount > 0 && (
        <div className="card border-blue/30 bg-blue/5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <p className="text-xs font-bold text-navy mb-1.5">{selectedCount} lead(s) selecionado(s)</p>
              <label className="label">Transferir para</label>
              <SelectField className="w-full" value={targetEmployee} onChange={(e) => setTargetEmployee(e.target.value)}>
                <option value="">Selecione o colaborador de destino</option>
                {eligibleTargets.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </SelectField>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-outline !text-xs whitespace-nowrap" onClick={clearSelection}>Limpar seleção</button>
              <button
                type="button"
                className="btn !text-xs whitespace-nowrap flex items-center gap-1.5"
                disabled={!targetEmployee}
                onClick={() => setConfirmOpen(true)}
              >
                <ArrowLeftRight size={13} /> Transferir
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <p className="label mb-0">Leads da equipe ({filtered.length})</p>
          {filtered.length > 0 && (
            <button type="button" className="text-xs font-bold text-blue hover:underline" onClick={selectAllFiltered}>
              Selecionar todos os {filtered.length} leads (todas as páginas)
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted py-4">Nenhum lead encontrado com esse filtro.</p>
        ) : (
          <>
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-[10px] sm:text-xs uppercase tracking-wider text-muted border-b border-line">
                  <th className="pb-2 pr-2 w-8">
                    <input type="checkbox" checked={pageAllSelected} onChange={(e) => togglePage(e.target.checked)} />
                  </th>
                  <th className="pb-2 pr-3 whitespace-nowrap">Lead</th>
                  <th className="pb-2 pr-3 whitespace-nowrap">Colaborador</th>
                  <th className="pb-2 pr-3 whitespace-nowrap">Status</th>
                  <th className="pb-2 whitespace-nowrap">Ligação</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-2"><input type="checkbox" checked={!!selectedIds[l.id]} onChange={() => toggleOne(l.id)} /></td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-navy whitespace-nowrap">{l.nome_completo}</p>
                      <p className="text-[11px] text-muted whitespace-nowrap flex items-center gap-1"><Phone size={10} /> {l.telefone}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-navy whitespace-nowrap">{empNameById[l.employee_id] || "—"}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <span className={`badge !text-[10px] ${STATUS_CHIP[l.status] || STATUS_CHIP.novo}`}>{l.status}</span>
                    </td>
                    <td className="py-2.5 text-muted whitespace-nowrap">{l.data_ligacao ? fmtLongDate(l.data_ligacao) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
              <p className="text-[11px] text-muted">Página {pageClamped + 1} de {totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-outline !p-1.5"
                  disabled={pageClamped === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  className="btn-outline !p-1.5"
                  disabled={pageClamped >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label="Próxima página"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={`Transferir ${selectedCount} lead(s)?`}
        message={`Esses leads passam a pertencer a ${empNameById[targetEmployee] || teamEmps.find((e) => e.id === targetEmployee)?.full_name || "outro colaborador"}. O histórico (ligações, agendamentos, feedback) continua intacto — só o dono do lead muda.`}
        confirmLabel="Transferir"
        onConfirm={confirmTransfer}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

const VENDAS_PAGE_SIZE = 20;

// Aba Vendas do gerente (2026-07-21) — mesma UI/lógica de lib/AdministrativoView.js (fila de
// confirmação: aprovar/recusar/editar venda pendente), só que escopada pela EQUIPE do gerente
// (teamEmps, employee.gerente_id === profile.id) em vez de loja_access. O gerente já tinha
// permissão de UPDATE nesses leads via RLS (policy crm_leads_update: "is_gerente() and
// is_my_team_member(employee_id)"), então essa aba não precisou de nenhuma migração — só front.
//
// Trade-off assumido conscientemente (avisado ao Felipe): dar ao gerente a mesma autonomia do
// Administrativo reduz a separação de funções que o fluxo de confirmação foi desenhado pra
// garantir originalmente (quem lança a venda não deveria ser quem a confirma) — agora o gerente
// pode aprovar a venda da própria equipe sem depender do Administrativo. Implementado assim por
// ser pedido explícito.
// Somente leitura de propósito: o gerente vê a fila de confirmação da própria equipe, mas quem
// aprova/recusa/edita a venda pendente é só o papel administrativo (can_confirm_vendas) — decisão
// de 2026-07-23 pra manter separação de funções (quem ganha comissão em cima da venda não pode
// ser quem valida ela). Ver VendasTab em lib/AdministrativoView.js pro fluxo completo de ação.
function VendasTab({ teamEmps, profile }) {
  const notifySaved = useSavedNotice();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [produtoCategorias, setProdutoCategorias] = useState([]);

  const [draftBusca, setDraftBusca] = useState("");
  const [draftFiltroEmp, setDraftFiltroEmp] = useState("todos");
  const [draftFiltroStatus, setDraftFiltroStatus] = useState("vendido_pendente");
  const [busca, setBusca] = useState("");
  const [filtroEmp, setFiltroEmp] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("vendido_pendente");
  const [page, setPage] = useState(0);

  // Editar uma venda já confirmada (status='vendido') — 2026-07-23, pedido do Felipe: o gerente
  // não aprova/recusa (isso continua exclusivo do administrativo, decisão de 2026-07-23), mas
  // pode corrigir os dados de uma venda da própria equipe depois de fechada. RLS já libera
  // (crm_leads_update: is_gerente() and is_my_team_member(employee_id)) — trigger no banco
  // (prevent_colaborador_edit_vendida_lead) só bloqueia o COLABORADOR editar um lead vendido, não
  // o gerente. Toda edição feita aqui fica registrada em venda_editada_por/venda_editada_em
  // automaticamente (trigger stamp_venda_edit_audit), não precisa gravar isso manualmente.
  const [editModal, setEditModal] = useState(null); // lead
  const [eNome, setENome] = useState("");
  const [eTelefone, setETelefone] = useState("");
  const [eEndereco, setEEndereco] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eDataLigacao, setEDataLigacao] = useState("");
  const [eValor, setEValor] = useState("");
  const [eCategoriaId, setECategoriaId] = useState("");
  const [eObs, setEObs] = useState("");
  const [eSaving, setESaving] = useState(false);

  const empIds = teamEmps.map((e) => e.id);
  const empNameById = {};
  teamEmps.forEach((e) => { empNameById[e.id] = e.full_name; });

  const load = useCallback(async () => {
    if (!empIds.length) { setLeads([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("crm_leads")
      .select("*")
      .in("employee_id", empIds)
      .order("created_at", { ascending: false });
    setLeads(data || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamEmps]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile?.empresa_id) return;
    (async () => {
      const { data } = await supabase
        .from("consorcio_produto_categorias")
        .select("*")
        .eq("empresa_id", profile.empresa_id)
        .eq("active", true)
        .order("nome");
      setProdutoCategorias(data || []);
    })();
  }, [profile?.empresa_id]);

  function openEdit(lead) {
    setEditModal(lead);
    setENome(lead.nome_completo || "");
    setETelefone(lead.telefone || "");
    setEEndereco(lead.endereco || "");
    setEEmail(lead.email || "");
    setEDataLigacao(lead.data_ligacao || "");
    setEValor(lead.valor != null ? String(lead.valor) : "");
    setECategoriaId(lead.categoria_produto_id || "");
    setEObs(lead.observacoes || "");
  }

  async function saveEdit() {
    if (!editModal) return;
    setESaving(true);
    const { error } = await supabase
      .from("crm_leads")
      .update({
        nome_completo: eNome.trim(),
        telefone: eTelefone.trim(),
        endereco: eEndereco.trim() || null,
        email: eEmail.trim() || null,
        data_ligacao: eDataLigacao || null,
        valor: eValor === "" ? null : Number(eValor),
        categoria_produto_id: eCategoriaId || null,
        observacoes: eObs.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editModal.id);
    setESaving(false);
    if (!error) {
      setEditModal(null);
      notifySaved("Venda atualizada com sucesso.");
      await load();
    }
  }

  const vendasFiltradas = leads.filter((l) => {
    if (filtroStatus !== "todos" && l.status !== filtroStatus) return false;
    if (filtroEmp !== "todos" && l.employee_id !== filtroEmp) return false;
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      if (!l.nome_completo?.toLowerCase().includes(q) && !l.telefone?.includes(q)) return false;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(vendasFiltradas.length / VENDAS_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const vendasPage = vendasFiltradas.slice(pageClamped * VENDAS_PAGE_SIZE, pageClamped * VENDAS_PAGE_SIZE + VENDAS_PAGE_SIZE);

  const filtrosPendentes = draftFiltroStatus !== filtroStatus || draftFiltroEmp !== filtroEmp || draftBusca !== busca;
  const filtroAtivo = filtroStatus !== "vendido_pendente" || filtroEmp !== "todos" || !!busca.trim();

  function aplicarFiltros(e) {
    if (e) e.preventDefault();
    setFiltroStatus(draftFiltroStatus);
    setFiltroEmp(draftFiltroEmp);
    setBusca(draftBusca);
    setPage(0);
  }

  function limparFiltros() {
    setDraftFiltroStatus("vendido_pendente"); setDraftFiltroEmp("todos"); setDraftBusca("");
    setFiltroStatus("vendido_pendente"); setFiltroEmp("todos"); setBusca("");
    setPage(0);
  }

  if (loading) {
    return <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-navy flex items-center gap-2">
          <Coins size={22} className="text-orange" /> Vendas
        </h1>
        <p className="text-xs text-muted mt-1">
          Aprovar, recusar ou editar uma venda aguardando confirmação é exclusivo do administrativo — aqui você só visualiza a fila pendente. Vendas já confirmadas podem ser editadas.
        </p>
      </div>

      <div className="card">
        <form onSubmit={aplicarFiltros} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input !pl-9" placeholder="nome ou telefone" value={draftBusca} onChange={(e) => setDraftBusca(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Colaborador</label>
            <SelectField className="w-full" value={draftFiltroEmp} onChange={(e) => setDraftFiltroEmp(e.target.value)}>
              <option value="todos">Todos da equipe</option>
              {teamEmps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </SelectField>
          </div>
          <div>
            <label className="label">Status</label>
            <SelectField className="w-full" value={draftFiltroStatus} onChange={(e) => setDraftFiltroStatus(e.target.value)}>
              <option value="vendido_pendente">Aguardando confirmação</option>
              <option value="vendido">Vendido</option>
              <option value="todos">Todos</option>
              <option value="novo">Novo</option>
              <option value="agendado">Agendado</option>
              <option value="follow_up">Follow-up</option>
              <option value="perdido">Perdido</option>
              <option value="cancelado">Cancelado</option>
            </SelectField>
          </div>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
            <button type="submit" className="btn !py-1.5 !text-xs whitespace-nowrap">Aplicar filtros</button>
            {(filtroAtivo || filtrosPendentes) && (
              <button type="button" onClick={limparFiltros} className="text-[11px] font-bold uppercase tracking-wider text-muted hover:text-orange whitespace-nowrap">
                Limpar
              </button>
            )}
            {filtrosPendentes && <span className="text-[11px] text-warn">alterações pendentes — clique em Aplicar</span>}
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <p className="label mb-3">{vendasFiltradas.length} venda(s)</p>
        {vendasFiltradas.length === 0 ? (
          <p className="text-sm text-muted py-4">Nenhuma venda encontrada com esse filtro.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {vendasPage.map((l) => (
                <li key={l.id} className="py-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-navy flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{l.nome_completo}</span>
                        <span className={`badge !text-[10px] shrink-0 ${STATUS_CHIP[l.status] || STATUS_CHIP.novo}`}>{STATUS_LABEL[l.status] || l.status}</span>
                      </p>
                      <p className="text-xs text-muted mt-0.5 flex items-center gap-3 flex-wrap">
                        <span>{empNameById[l.employee_id] || "—"}</span>
                        <span>{l.telefone}</span>
                      </p>
                      {(l.status === "vendido" || l.status === "vendido_pendente") && (
                        <p className={`text-sm font-bold mt-1 ${l.status === "vendido" ? "text-success" : "text-orange"}`}>{formatBRL(l.valor)}</p>
                      )}
                      {l.venda_motivo_recusa && <p className="text-[11px] text-danger mt-1">Recusada antes: {l.venda_motivo_recusa}</p>}
                    </div>
                    {l.status === "vendido" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => openEdit(l)} title="Editar venda" aria-label="Editar" className="p-1.5 rounded-lg border border-line text-muted hover:border-blue hover:text-blue transition-colors">
                          <Edit3 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 mt-4">
                <button type="button" className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1" disabled={pageClamped === 0} onClick={() => setPage(pageClamped - 1)}>
                  <ChevronLeft size={14} /> Anterior
                </button>
                <span className="text-xs text-muted">Página {pageClamped + 1} de {totalPages}</span>
                <button type="button" className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1" disabled={pageClamped >= totalPages - 1} onClick={() => setPage(pageClamped + 1)}>
                  Próxima <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full max-h-[85vh] overflow-y-auto animate-bounce-in border-blue/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><Edit3 className="text-blue" size={20} /> Editar venda</h2>
            <p className="text-[11px] text-muted mt-1">Venda já confirmada — a edição fica registrada com seu nome e horário.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="label">Nome completo</label>
                <input className="input" value={eNome} onChange={(e) => setENome(e.target.value)} maxLength={60} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <PhoneInput value={eTelefone} onChange={setETelefone} />
              </div>
              <div>
                <label className="label">Endereço</label>
                <input className="input" value={eEndereco} onChange={(e) => setEEndereco(e.target.value)} maxLength={120} />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input type="email" className="input" value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Data da ligação</label>
                <input type="date" className="input date-input" value={eDataLigacao} onChange={(e) => setEDataLigacao(e.target.value)} />
              </div>
              <div>
                <label className="label">Valor da venda</label>
                <CurrencyInput value={eValor} onChange={setEValor} />
              </div>
              <div>
                <label className="label">Categoria</label>
                <SelectField className="w-full" value={eCategoriaId} onChange={(e) => setECategoriaId(e.target.value)}>
                  <option value="">— selecione —</option>
                  {produtoCategorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </SelectField>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input" rows={2} value={eObs} onChange={(e) => setEObs(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={eSaving} onClick={saveEdit}>{eSaving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

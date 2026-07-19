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
} from "lucide-react";
import { supabase } from "./supabaseClient";
import ConsorcioDashboard, { CONSORCIO_TABS } from "./ConsorcioDashboard";
import ColaboradorViewConsorcio from "./ColaboradorViewConsorcio";
import MonthNav from "./MonthNav";
import Led from "./Led";
import AutoFitText from "./AutoFitText";
import { formatBRL, formatPct, currentGoalTarget } from "./scoring";
import { greeting, todayStr, firstDayOfMonth, monthLabel, isTaskDueOn, daysElapsedInMonth, daysInMonth } from "./date";

export { CONSORCIO_TABS };

// Igual a CONSORCIO_TABS (Início/Metas), só que com "Calendário" no meio — exclusivo do gerente
// (pedido do Felipe: "o gerente também precisa ter uma aba calendário", equipe inteira, não o
// supervisor/sócio/master que usam <ConsorcioDashboard> puro via CONSORCIO_TABS). Usado tanto na
// própria página do gerente (app/gerente/page.js) quanto em qualquer "ver como gerente"
// (HierarchyHome.js, app/admin/page.js) — pela regra de ouro de UI, a tela tem que ficar idêntica.
export const GERENTE_TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "calendario", label: "Calendário", Icon: CalendarDays },
  { key: "metas", label: "Metas", Icon: Wallet },
];

const STATUS_CHIP = {
  novo: "bg-line text-muted",
  agendado: "bg-blue/15 text-blue",
  follow_up: "bg-warn/15 text-warn",
  perdido: "bg-danger/15 text-danger",
  vendido: "bg-success/15 text-success",
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
      .select("id, full_name")
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
      .map((emp) => ({ id: emp.id, name: emp.full_name, sold: soldByEmp[emp.id] || 0 }))
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
            className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
            style={{ background: "linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)", boxShadow: "0 10px 28px rgba(37,99,235,0.35)" }}
          >
            <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/15" />
            <div className="relative flex items-center gap-2 mb-3">
              <Store size={18} className="text-white" />
              <span className="text-xs font-bold uppercase tracking-wider text-white">Funil de hoje · {lojaName || "sua loja"}</span>
            </div>
            <AutoFitText className="relative text-4xl sm:text-5xl font-extrabold text-white leading-tight">{formatBRL(hero.soldLoja)}</AutoFitText>
            <p className="relative text-xs font-semibold text-white/80 mt-1">
              {hero.metaLoja > 0 ? `faltam ${formatBRL(restoDaMeta)} pra próxima meta` : "nenhuma meta cadastrada ainda"}
            </p>
            <p className="relative text-xs font-semibold text-white/80 mt-1">Vendido no mês — {monthLabel(month)}</p>

            <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-4 mt-6 pt-5 border-t border-white/20">
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-white">{hero.ligacoesHoje}</AutoFitText>
                <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><PhoneCall size={11} className="shrink-0" /> Ligações hoje</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-white">{hero.agendamentosHoje}</AutoFitText>
                <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><CalendarClock size={11} className="shrink-0" /> Agendamentos hoje</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-white">{hero.pendingToday}</AutoFitText>
                <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><ListTodo size={11} className="shrink-0" /> Atividades pendentes</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-white">{formatBRL(hero.commissionSoFar)}</AutoFitText>
                <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><Coins size={11} className="shrink-0" /> Comissão até agora</p>
                {hero.metaLoja > 0 && (
                  <p className="text-[10px] text-white/70 mt-0.5">{hero.commissionPct}% · {hero.commissionTierLabel}</p>
                )}
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-white">{formatBRL(hero.prizesSoFar)}</AutoFitText>
                <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><Gift size={11} className="shrink-0" /> Premiações</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-white">{hero.leaderName || "—"}</AutoFitText>
                <p className="text-[11px] font-semibold text-white/80 mt-0.5 flex items-center gap-1"><Trophy size={11} className="shrink-0" /> Líder de vendas</p>
              </div>
            </div>
          </div>

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
                          {l.status === "vendido" && <p className="text-xs font-bold text-success mt-1">{formatBRL(l.valor)}</p>}
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

      {tab !== "calendario" && (
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
            <div className="card animate-pop border-blue/20">
              <p className="label mb-3 flex items-center gap-1.5"><Trophy size={14} /> Ranking de vendas — {monthLabel(month)}</p>
              <ul className="divide-y divide-line">
                {storeRanking.map((r, idx) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-xs sm:text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          idx === 0 ? "bg-blue text-white" : "bg-line text-muted"
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
                      return (
                        <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                          <button
                            onClick={() => togglePersonalTask(t.id)}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-bold text-white transition-all ${done ? "" : "bg-line text-muted hover:bg-line/70"}`}
                            style={done ? { background: "linear-gradient(135deg, #84cc16, #0d9488)" } : undefined}
                          >
                            {done && <Check size={13} strokeWidth={3} />}
                          </button>
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

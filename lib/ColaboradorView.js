"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Target,
  Wallet,
  Trophy,
  Flame,
  PartyPopper,
  CheckSquare,
  Check,
  AlertTriangle,
  ThumbsUp,
  Rocket,
  FileText,
  CalendarClock,
  ListTodo,
  Coins,
  Gift,
  ArrowLeft,
  Eye,
  Medal,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import ProgressBar from "./ProgressBar";
import Confetti from "./Confetti";
import { CurrencyInput } from "./MaskedInputs";
import DateNav from "./DateNav";
import MonthNav from "./MonthNav";
import AutoFitText from "./AutoFitText";
import { calcIndividualPct, formatBRL, formatPct, motivationalMessage, currentGoalTarget } from "./scoring";
import { todayStr, firstDayOfMonth, remainingDaysInMonth, monthLabel, greeting, isTaskDueOn, yesterdayStr } from "./date";

// Reaproveita exatamente a mesma experiência do colaborador (herocard, metas, tarefas do dia,
// advertências, lançamento de venda) — usado tanto pela própria página do colaborador quanto pelo
// gerente, quando ele clica em um colaborador na aba "Colaboradores" pra ver/agir como se tivesse
// entrado com o id daquela pessoa. Monte com key={profile.id} pra garantir estado limpo por pessoa.
export default function ColaboradorView({ profile, tab, viewedByManager = false, onBack }) {
  const [tasks, setTasks] = useState([]);
  const [todayCompletions, setTodayCompletions] = useState({});
  const [viewDate, setViewDate] = useState(todayStr());
  const [dayCompletions, setDayCompletions] = useState({});
  const [individualPct, setIndividualPct] = useState(0);
  const [teamPct, setTeamPct] = useState(0);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState({ warning_penalty_points: 10, team_threshold_pct: 95, monthly_prize: 1000 });
  const [showCongrats, setShowCongrats] = useState(false);
  const [goalCelebrations, setGoalCelebrations] = useState([]); // fila de níveis de meta batidos, um modal por vez

  const [selectedMonth, setSelectedMonth] = useState(firstDayOfMonth(todayStr()));
  const didInit = useRef(false);

  const [goals, setGoals] = useState([]);
  const [commissionSettings, setCommissionSettings] = useState({ non_achievement_colaborador_pct: 0 });
  const [prizes, setPrizes] = useState([]);
  const [entries, setEntries] = useState([]);
  const [entryDate, setEntryDate] = useState(yesterdayStr(todayStr()));
  const [entryValue, setEntryValue] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryMsg, setEntryMsg] = useState("");
  const [storeRanking, setStoreRanking] = useState([]);
  const [showFolgaModal, setShowFolgaModal] = useState(false);

  const today = todayStr();
  const month = selectedMonth || firstDayOfMonth(today);
  const isCurrentMonth = month === firstDayOfMonth(today);
  const greet = greeting();
  // só as tarefas que valem hoje (diária sempre, semanal só no seu dia, única só na sua data) —
  // é o conjunto usado no checklist "de hoje", na barra do dia e no aviso de 100% concluído.
  const todayTasksList = tasks.filter((t) => isTaskDueOn(t, today));
  // idem, mas pro dia sendo navegado no checklist (DateNav) — pode ser um dia anterior.
  const viewTasksList = tasks.filter((t) => isTaskDueOn(t, viewDate || today));

  const loadAll = useCallback(async (uid, lojaId, monthArg) => {
    const { data: settingsRow } = await supabase.from("app_settings").select("*").eq("loja_id", lojaId).single();
    if (settingsRow) setSettings(settingsRow);
    const penalty = settingsRow?.warning_penalty_points ?? 10;

    const nextMonth = new Date(monthArg + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    const { data: myTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("employee_id", uid)
      .eq("active", true)
      .order("created_at");
    setTasks(myTasks || []);

    // só semeia (e conta como "pendente hoje") a tarefa no dia em que ela realmente vale — diária
    // sempre, semanal só no seu dia da semana, única só na sua data. O total do mês (expected/
    // completed) continua olhando TODAS as tarefas ativas, porque uma semanal/única também soma
    // completions em dias que não são hoje.
    const todayTasks = (myTasks || []).filter((t) => isTaskDueOn(t, today));

    if (todayTasks.length) {
      const rows = todayTasks.map((t) => ({ task_id: t.id, completion_date: today }));
      await supabase.from("task_completions").upsert(rows, { onConflict: "task_id,completion_date", ignoreDuplicates: true });
    }

    const todayTaskIds = todayTasks.map((t) => t.id);
    const taskIds = (myTasks || []).map((t) => t.id);
    if (taskIds.length) {
      const { data: todayRows } = todayTaskIds.length
        ? await supabase
            .from("task_completions")
            .select("*")
            .in("task_id", todayTaskIds)
            .eq("completion_date", today)
        : { data: [] };
      const map = {};
      (todayRows || []).forEach((r) => (map[r.task_id] = r));
      setTodayCompletions(map);

      const { data: monthRows } = await supabase
        .from("task_completions")
        .select("completed, completion_date")
        .in("task_id", taskIds)
        .gte("completion_date", monthArg)
        .lt("completion_date", nextMonthStr);
      const expected = (monthRows || []).length;
      const completed = (monthRows || []).filter((r) => r.completed).length;

      const { data: monthWarnings } = await supabase
        .from("warnings")
        .select("*")
        .eq("employee_id", uid)
        .gte("warning_date", monthArg)
        .lt("warning_date", nextMonthStr)
        .order("warning_date", { ascending: false });
      setWarnings(monthWarnings || []);

      setIndividualPct(
        calcIndividualPct({ completed, expected, warningsCount: (monthWarnings || []).length, penaltyPerWarning: penalty })
      );
    } else {
      const { data: monthWarnings } = await supabase
        .from("warnings")
        .select("*")
        .eq("employee_id", uid)
        .gte("warning_date", monthArg)
        .lt("warning_date", nextMonthStr)
        .order("warning_date", { ascending: false });
      setWarnings(monthWarnings || []);
      setIndividualPct(calcIndividualPct({ completed: 0, expected: 0, warningsCount: (monthWarnings || []).length, penaltyPerWarning: penalty }));
    }

    const { data: teamPctData } = await supabase.rpc("get_team_progress", { p_month: monthArg, p_loja: lojaId, p_today: todayStr() });
    setTeamPct(Number(teamPctData) || 0);

    const { data: goalRows } = await supabase.from("sales_goals").select("*").eq("month", monthArg).order("store_total");
    const { data: allocRows } = await supabase.from("sales_goal_allocations").select("*").eq("employee_id", uid);
    const combined = (goalRows || [])
      .map((g) => ({ goal: g, allocation: (allocRows || []).find((a) => a.goal_id === g.id) }))
      .filter((x) => x.allocation);
    setGoals(combined);

    const { data: commissionRow } = await supabase
      .from("commission_settings")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("month", monthArg)
      .maybeSingle();
    setCommissionSettings(commissionRow || { non_achievement_colaborador_pct: 0 });

    const { data: entryRows } = await supabase
      .from("sales_entries")
      .select("*")
      .eq("employee_id", uid)
      .gte("entry_date", monthArg)
      .lt("entry_date", nextMonthStr)
      .order("entry_date", { ascending: false });
    setEntries(entryRows || []);

    const { data: prizeRows } = await supabase.from("employee_prizes").select("*").eq("employee_id", uid).eq("month", monthArg);
    setPrizes(prizeRows || []);

    // ranking de vendas entre os colaboradores da mesma loja, no mês selecionado — usado no
    // card "Ranking de vendas" e na posição exibida no herocard. Vem de uma function no banco
    // (get_store_sales_ranking) porque a RLS de "profiles" não deixa um colaborador comum
    // enxergar os perfis de outros colegas — só quem tem can_view_loja (gerente/sócio/supervisor/
    // master). A function roda com SECURITY DEFINER e confere a permissão internamente.
    const { data: rankingRows } = await supabase.rpc("get_store_sales_ranking", { p_month: monthArg, p_loja: lojaId });
    setStoreRanking((rankingRows || []).map((r) => ({ id: r.employee_id, name: r.full_name, sold: Number(r.sold) || 0 })));
  }, [today]);

  useEffect(() => {
    let active = true;
    (async () => {
      const initialMonth = firstDayOfMonth(todayStr());
      await loadAll(profile.id, profile.loja_id, initialMonth);
      if (!active) return;
      didInit.current = true;
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  useEffect(() => {
    if (!didInit.current || !selectedMonth) return;
    loadAll(profile.id, profile.loja_id, selectedMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  async function toggleTask(taskId) {
    const current = todayCompletions[taskId];
    const newVal = !current?.completed;
    await supabase
      .from("task_completions")
      .update({ completed: newVal, completed_at: newVal ? new Date().toISOString() : null })
      .eq("task_id", taskId)
      .eq("completion_date", today);
    await loadAll(profile.id, profile.loja_id, month);

    if (newVal && !viewedByManager) {
      const willAllBeDone = todayTasksList.length > 0 && todayTasksList.every((t) => (t.id === taskId ? true : todayCompletions[t.id]?.completed));
      if (willAllBeDone) {
        const flagKey = `zmeta_congrats_${profile.id}_${today}`;
        if (typeof window !== "undefined" && !window.localStorage.getItem(flagKey)) {
          window.localStorage.setItem(flagKey, "1");
          setShowCongrats(true);
          // avisa gerente/supervisor/sócio (respeitando hierarquia e preferência de cada um) —
          // RPC tem guarda própria no banco (só reporta a própria conclusão) e é idempotente
          // por dia, então é seguro chamar aqui mesmo sem esperar a resposta.
          supabase.rpc("notify_tarefas_completas", { p_employee_id: profile.id }).then(() => {});
        }
      }
    }
  }

  useEffect(() => {
    if (!viewDate || !viewTasksList.length) { setDayCompletions(viewDate === today ? todayCompletions : {}); return; }
    if (viewDate === today) { setDayCompletions(todayCompletions); return; }
    let active = true;
    (async () => {
      const taskIds = viewTasksList.map((t) => t.id);
      const { data } = await supabase.from("task_completions").select("*").in("task_id", taskIds).eq("completion_date", viewDate);
      if (!active) return;
      const map = {};
      (data || []).forEach((r) => { map[r.task_id] = r; });
      setDayCompletions(map);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate, tasks, today, todayCompletions]);

  async function saveEntry(e) {
    e.preventDefault();
    if (entryValue === "" || entryValue === null || entryValue === undefined || Number(entryValue) < 0) return;
    // venda R$0,00 pode significar que o colaborador não trabalhou naquele dia (folga) — em vez de
    // salvar direto, confirma com o usuário pra, se for o caso, já marcar as tarefas daquele dia
    // como concluídas automaticamente (não faz sentido cobrar tarefas de um dia de folga).
    if (Number(entryValue) === 0) {
      setShowFolgaModal(true);
      return;
    }
    await doSaveEntry(false);
  }

  async function doSaveEntry(isFolga) {
    setSavingEntry(true);
    setEntryMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("sales_entries").upsert(
      {
        employee_id: profile.id,
        entry_date: entryDate,
        daily_amount: Number(entryValue),
        edited_by_manager: viewedByManager,
        created_by: session.user.id,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
        empresa_id: profile.empresa_id,
        loja_id: profile.loja_id,
      },
      { onConflict: "employee_id,entry_date" }
    );

    if (!error && isFolga) {
      const dueTasks = tasks.filter((t) => isTaskDueOn(t, entryDate));
      if (dueTasks.length) {
        const rows = dueTasks.map((t) => ({
          task_id: t.id,
          completion_date: entryDate,
          completed: true,
          completed_at: new Date().toISOString(),
        }));
        await supabase.from("task_completions").upsert(rows, { onConflict: "task_id,completion_date" });
      }
    }

    setSavingEntry(false);
    setShowFolgaModal(false);
    if (error) {
      setEntryMsg("Erro ao salvar: " + error.message);
    } else {
      setEntryMsg(isFolga ? "Lançamento salvo e tarefas do dia marcadas como concluídas (folga)." : "Lançamento salvo.");
      setEntryValue("");
      await loadAll(profile.id, profile.loja_id, month);
    }
  }

  const remaining = isCurrentMonth ? remainingDaysInMonth(today) : 0;
  const doneCount = todayTasksList.filter((t) => todayCompletions[t.id]?.completed).length;
  const pendingCount = isCurrentMonth ? todayTasksList.length - doneCount : 0;
  const todayPct = todayTasksList.length ? Math.round((doneCount / todayTasksList.length) * 100) : 0;
  const willRelease = teamPct >= Number(settings.team_threshold_pct);

  const soldSoFar = entries.reduce((s, en) => s + Number(en.daily_amount || 0), 0);
  const latestEntry = entries[0];

  // metas são níveis (Meta, Super Meta, Hiper Meta…) — não somam. O alvo "em jogo" é sempre o
  // próximo nível ainda não batido; se todos já foram batidos, fica valendo o último deles.
  const metaDoMes = currentGoalTarget(goals.map(({ allocation }) => allocation.amount), soldSoFar);
  const activeGoalItem = goals.find(({ allocation }) => soldSoFar < Number(allocation.amount)) || (goals.length ? goals[goals.length - 1] : null);
  const restoDaMeta = Math.max(0, metaDoMes - soldSoFar);
  const dailyGoal = remaining > 0 ? restoDaMeta / remaining : 0;

  let achievedTier = null;
  goals.forEach((g) => {
    if (soldSoFar >= Number(g.allocation.amount || 0)) achievedTier = g;
  });
  const activeCommissionPct = achievedTier
    ? Number(achievedTier.goal.commission_pct_colaborador) || 0
    : Number(commissionSettings.non_achievement_colaborador_pct) || 0;
  const activeTierLabel = achievedTier ? achievedTier.goal.name : "não atingimento";
  const commissionSoFar = soldSoFar * (activeCommissionPct / 100);
  const prizesSoFar = prizes.reduce((s, p) => s + Number(p.amount || 0), 0);

  const myRankIndex = storeRanking.findIndex((r) => r.id === profile.id);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

  const historyAsc = [...entries].sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1));
  let running = 0;
  const historyWithRunning = historyAsc.map((en) => {
    running += Number(en.daily_amount || 0);
    return { ...en, running };
  });
  historyWithRunning.reverse();

  // Modal de "bateu a meta": dispara um pop-up por nível de meta batido (Meta, Super Meta,
  // Hiper Meta…), na ordem em que existem, cada um uma única vez por colaborador/mês/nível
  // (marcado no localStorage pra não repetir a cada vez que a tela recarrega). Só roda pra quem
  // está de fato logado como o colaborador (não quando o gerente está "vendo como") e só pro mês
  // corrente — bater uma meta de um mês fechado não deve gerar pop-up.
  useEffect(() => {
    if (viewedByManager) return;
    if (!isCurrentMonth) return;
    if (!goals.length) return;
    const newlyAchieved = [];
    goals.forEach(({ goal, allocation }) => {
      if (soldSoFar >= Number(allocation.amount || 0)) {
        const flagKey = `zmeta_goalhit_${profile.id}_${month}_${goal.id}`;
        if (typeof window !== "undefined" && !window.localStorage.getItem(flagKey)) {
          window.localStorage.setItem(flagKey, "1");
          newlyAchieved.push(goal);
        }
      }
    });
    if (newlyAchieved.length) {
      setGoalCelebrations((q) => [...q, ...newlyAchieved]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, soldSoFar, month, isCurrentMonth, viewedByManager]);

  return (
    <div className="space-y-6">
      {viewedByManager && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-purple/10 border-2 border-purple/25 rounded-2xl px-4 py-2.5">
          <span className="text-xs font-bold text-purple flex items-center gap-1.5">
            <Eye size={14} /> Visualizando como {profile.full_name} — mesma tela que ele(a) vê ao entrar
          </span>
          {onBack && (
            <button onClick={onBack} className="text-xs font-bold uppercase tracking-wider text-navy flex items-center gap-1 hover:text-purple">
              <ArrowLeft size={13} /> Voltar
            </button>
          )}
        </div>
      )}

      {showCongrats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <Confetti />
          <div className="card max-w-sm w-full text-center animate-bounce-in border-purple/30">
            <div className="flex justify-center mb-3 animate-wiggle">
              <PartyPopper size={56} className="text-pink" />
            </div>
            <h2 className="text-xl font-extrabold gradient-text">Parabéns, {profile.full_name.split(" ")[0]}!</h2>
            <p className="text-sm text-muted mt-2 flex items-center justify-center gap-1.5 flex-wrap">
              Você concluiu <span className="font-bold text-navy">100%</span> das suas tarefas de hoje. Continue assim pra manter a barra da equipe lá em cima! <Flame size={15} className="text-orange" />
            </p>
            <button className="btn-hype mt-5 w-full" onClick={() => setShowCongrats(false)}>Show de bola!</button>
          </div>
        </div>
      )}

      {!showCongrats && goalCelebrations.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <Confetti />
          <div className="card max-w-sm w-full text-center animate-bounce-in border-purple/30">
            <div className="flex justify-center mb-3 animate-wiggle">
              <Trophy size={56} className="text-pink" />
            </div>
            <h2 className="text-xl font-extrabold gradient-text">Parabéns, {profile.full_name.split(" ")[0]}!</h2>
            <p className="text-sm text-muted mt-2 flex items-center justify-center gap-1.5 flex-wrap">
              Você bateu a <span className="font-bold text-navy">{goalCelebrations[0].name}</span> deste mês! Continue faturando! <PartyPopper size={15} className="text-orange" />
            </p>
            <button className="btn-hype mt-5 w-full" onClick={() => setGoalCelebrations((q) => q.slice(1))}>
              {goalCelebrations.length > 1 ? "Bora pra próxima!" : "Show de bola!"}
            </button>
          </div>
        </div>
      )}

      {showFolgaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full text-center animate-bounce-in border-purple/30">
            <h2 className="text-lg font-extrabold text-navy">Foi um dia de folga?</h2>
            <p className="text-sm text-muted mt-2">
              Você lançou <span className="font-bold text-navy">R$ 0,00</span> em {entryDate.split("-").reverse().join("/")}. Se foi folga, podemos marcar automaticamente todas as tarefas desse dia como concluídas.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <button className="btn-outline flex-1" disabled={savingEntry} onClick={() => doSaveEntry(false)}>
                Não foi folga
              </button>
              <button className="btn flex-1" disabled={savingEntry} onClick={() => doSaveEntry(true)}>
                {savingEntry ? "Salvando…" : "Sim, foi folga"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "atividades" && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-navy flex items-center gap-2">
                <greet.Icon size={22} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
              </h1>
            </div>
            <MonthNav month={month} onChange={setSelectedMonth} maxMonth={firstDayOfMonth(today)} />
          </div>

          <div
            className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
            style={{ background: "linear-gradient(135deg, #a78bfa 0%, #ddd6fe 100%)", boxShadow: "0 10px 28px rgba(167,139,250,0.35)" }}
          >
            <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/15" />
            <div className="relative flex items-center gap-2 mb-3">
              <Target size={18} className="text-navy" />
              <span className="text-xs font-bold uppercase tracking-wider text-navy">Meta de hoje</span>
            </div>
            <AutoFitText className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(dailyGoal)}</AutoFitText>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">
              {isCurrentMonth ? `pra bater a meta do mês nos ${remaining} dia${remaining !== 1 ? "s" : ""} restantes` : `mês fechado — ${monthLabel(month)}`}
            </p>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">{isCurrentMonth ? "Vendido até ontem" : "Vendido no mês"}: {formatBRL(soldSoFar)}</p>

            <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-4 mt-6 pt-5 border-t border-navy/15">
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{formatBRL(restoDaMeta)}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Rocket size={11} className="shrink-0" /> Falta pra meta do mês</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{remaining}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><CalendarClock size={11} className="shrink-0" /> Dias restantes no mês</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{pendingCount}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><ListTodo size={11} className="shrink-0" /> Atividades pendentes</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{formatBRL(commissionSoFar)}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Coins size={11} className="shrink-0" /> Comissão até agora</p>
                {goals.length > 0 && (
                  <p className="text-[10px] text-navy/60 mt-0.5">{activeCommissionPct}% · {activeTierLabel}</p>
                )}
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{formatBRL(prizesSoFar)}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Gift size={11} className="shrink-0" /> Premiações</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">
                  {myRank ? `${myRank}º` : "—"}
                  {storeRanking.length > 0 ? ` /${storeRanking.length}` : ""}
                </AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Medal size={11} className="shrink-0" /> Posição no ranking</p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card animate-pop border-purple/20">
              <p className="label flex items-center gap-1.5"><Target size={14} /> Barra Individual</p>
              <ProgressBar pct={individualPct} />
              <p className="text-xs text-muted mt-2 flex items-center gap-1.5">
                {(() => { const m = motivationalMessage(todayPct); return (<><m.Icon size={13} /> {m.text}</>); })()}
              </p>
            </div>
            <div className="card animate-pop border-pink/20">
              <p className="label flex items-center gap-1.5"><Trophy size={14} /> Barra Geral de Atividades</p>
              <ProgressBar pct={teamPct} threshold={settings.team_threshold_pct} />
              <p className={`text-[12px] mt-2 font-bold flex items-center gap-1.5 ${willRelease ? "text-teal" : "text-muted"}`}>
                {willRelease ? <PartyPopper size={14} /> : <Wallet size={14} />}
                {willRelease ? `Prêmio garantido se seguir assim!` : `Prêmio do mês liberado com ${settings.team_threshold_pct}%+ no fim do mês.`}
              </p>
            </div>
          </div>

          {goals.length > 0 && (
            <div className="card animate-pop border-teal/20">
              <p className="label mb-3 flex items-center gap-1.5"><Target size={14} /> Minhas metas — {monthLabel(month)}</p>
              <p className="text-[11px] text-muted mb-2">Vale a meta real até ela ser batida, depois passa a valer a próxima, e assim sucessivamente.</p>
              <ul className="divide-y divide-line">
                {goals.map(({ goal, allocation }) => {
                  const target = Number(allocation.amount);
                  const goalPct = target > 0 ? Math.min(100, (soldSoFar / target) * 100) : 0;
                  return (
                    <li key={goal.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                        <span className="font-medium text-navy flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{goal.name}</span>
                          {activeGoalItem?.goal.id === goal.id && <span className="badge bg-purple/15 text-purple shrink-0">em jogo</span>}
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
                {storeRanking.map((r, idx) => {
                  const isMe = r.id === profile.id;
                  return (
                    <li
                      key={r.id}
                      className={`flex items-center justify-between gap-2 py-2 text-xs sm:text-sm ${isMe ? "bg-purple/5 -mx-2 px-2 rounded-xl" : ""}`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            idx === 0 ? "bg-orange text-white" : isMe ? "bg-purple text-white" : "bg-line text-muted"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className={`font-medium truncate ${isMe ? "text-purple" : "text-navy"}`}>
                          {r.name}
                          {isMe ? " (você)" : ""}
                        </span>
                      </span>
                      <span className={`font-semibold shrink-0 whitespace-nowrap ${isMe ? "text-purple" : "text-navy"}`}>{formatBRL(r.sold)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="label mb-0 flex items-center gap-1.5"><CheckSquare size={14} /> Tarefas {viewDate === today ? "de hoje" : ""}</p>
              <div className="flex items-center gap-3">
                <DateNav date={viewDate || today} onChange={setViewDate} maxDate={today} />
                {viewTasksList.length > 0 && <span className="text-xs text-muted">{viewTasksList.filter((t) => dayCompletions[t.id]?.completed).length}/{viewTasksList.length}</span>}
              </div>
            </div>
            {viewTasksList.length === 0 && <p className="text-sm text-muted">Nenhuma tarefa valendo nesse dia.</p>}
            {viewDate !== today && <p className="text-[11px] text-muted mb-2">Visualização de um dia anterior — só é possível marcar tarefas no dia de hoje.</p>}
            <ul className="divide-y divide-line">
              {viewTasksList.map((t) => {
                const done = !!dayCompletions[t.id]?.completed;
                const editable = viewDate === today;
                return (
                  <li className="flex items-center gap-3 py-3" key={t.id}>
                    <button
                      onClick={() => editable && toggleTask(t.id)}
                      disabled={!editable}
                      className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center shrink-0 transition-all font-bold text-white ${
                        done ? "border-transparent animate-bounce-in" : "border-line bg-white hover:border-purple"
                      } ${!editable ? "pointer-events-none opacity-80" : ""}`}
                      style={done ? { background: "linear-gradient(135deg, #84cc16, #0d9488)" } : undefined}
                    >
                      {done && <Check size={16} strokeWidth={3} />}
                    </button>
                    <span className={`text-sm font-medium ${done ? "line-through text-muted" : "text-navy"}`}>{t.title}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="card">
            <p className="label mb-2 flex items-center gap-1.5"><AlertTriangle size={14} /> Advertências no mês ({warnings.length})</p>
            {warnings.length === 0 ? (
              <p className="text-sm text-muted flex items-center gap-1.5"><ThumbsUp size={14} className="text-success" /> Nenhuma advertência este mês. Continue assim!</p>
            ) : (
              <ul className="space-y-2">
                {warnings.map((w) => (
                  <li key={w.id} className="text-sm flex justify-between gap-2 flex-wrap border-b border-line pb-2">
                    <span className="break-words">{w.reason}</span>
                    <span className="text-muted text-xs whitespace-nowrap">{w.warning_date} · -{w.points}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "metas" && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-navy flex items-center gap-2"><Wallet size={20} className="text-purple" /> Metas — {monthLabel(month)}</h1>
              <p className="text-xs text-muted mt-1">
                Vendido no mês até {latestEntry ? latestEntry.entry_date : "—"}: {formatBRL(soldSoFar)}
                {!isCurrentMonth ? " · mês fechado" : ""}
              </p>
            </div>
            <MonthNav month={month} onChange={setSelectedMonth} maxMonth={firstDayOfMonth(today)} />
          </div>

          {goals.length === 0 ? (
            <div className="card"><p className="text-sm text-muted">Nenhuma meta cadastrada para este mês ainda.</p></div>
          ) : (
            <div className={`grid gap-4 ${goals.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {goals.map(({ goal, allocation }, i) => {
                const target = Number(allocation.amount);
                const rest = Math.max(0, target - soldSoFar);
                const goalDailyGoal = remaining > 0 ? rest / remaining : 0;
                const progressPct = target > 0 ? Math.min(100, (soldSoFar / target) * 100) : 0;
                const icons = [Target, Rocket, Trophy];
                const IconCmp = icons[i % icons.length];
                const borders = ["border-purple/25", "border-orange/25", "border-teal/25"];
                return (
                  <div key={goal.id} className={`card animate-pop ${borders[i % borders.length]}`}>
                    <p className="font-bold text-xs sm:text-sm text-navy flex items-center gap-1.5"><IconCmp size={15} /> {goal.name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      meta individual: {formatBRL(target)}
                      {Number(goal.commission_pct_colaborador) > 0 && ` · ${Number(goal.commission_pct_colaborador)}% de comissão ao bater essa meta`}
                    </p>
                    <div className="mt-3"><ProgressBar pct={progressPct} showLabel={false} /></div>
                    <p className="text-xs text-muted mt-1">{formatPct(progressPct)} da meta</p>
                    <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-2 sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted uppercase tracking-wider font-bold">Meta de hoje</p>
                        <AutoFitText className="text-lg sm:text-xl font-extrabold gradient-text mt-0.5">{formatBRL(goalDailyGoal)}</AutoFitText>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted uppercase tracking-wider font-bold">Falta pra bater</p>
                        <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy mt-0.5">{formatBRL(rest)}</AutoFitText>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isCurrentMonth ? (
            <div className="card">
              <p className="label mb-3 flex items-center gap-1.5"><FileText size={14} /> Lançar valor vendido</p>
              <form onSubmit={saveEntry} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="label">Dia da venda</label>
                  <input
                    type="date"
                    className="input date-input"
                    value={entryDate}
                    max={yesterdayStr(today)}
                    onChange={(e) => setEntryDate(e.target.value)}
                    required
                  />
                </div>
                <div className="flex-1 w-full">
                  <label className="label">Valor vendido nesse dia</label>
                  <CurrencyInput value={entryValue} onChange={setEntryValue} required />
                </div>
                <button type="submit" className="btn whitespace-nowrap w-full sm:w-auto" disabled={savingEntry}>
                  {savingEntry ? "Salvando…" : "Salvar"}
                </button>
              </form>
              {entryMsg && <p className="text-xs text-muted mt-2">{entryMsg}</p>}
            </div>
          ) : (
            <div className="card">
              <p className="text-sm text-muted">Visualização de um mês anterior — lançamentos só podem ser feitos no mês atual.</p>
            </div>
          )}

          <div className="card overflow-x-auto">
            <p className="label mb-3">Registros do mês</p>
            {historyWithRunning.length === 0 ? (
              <p className="text-sm text-muted">Nenhum lançamento este mês ainda.</p>
            ) : (
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-line">
                    <th className="pb-2">Data</th>
                    <th className="pb-2">Vendido no dia</th>
                    <th className="pb-2">Acumulado no mês</th>
                  </tr>
                </thead>
                <tbody>
                  {historyWithRunning.map((en) => (
                    <tr key={en.id} className="border-b border-line last:border-0">
                      <td className="py-2 text-muted">{en.entry_date}{en.edited_by_manager ? " (corrigido pelo gerente)" : ""}</td>
                      <td className="py-2 text-navy font-medium">{formatBRL(en.daily_amount)}</td>
                      <td className="py-2 text-muted">{formatBRL(en.running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

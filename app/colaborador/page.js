"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
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
  Loader2,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ProgressBar from "../../lib/ProgressBar";
import ChangePassword from "../../lib/ChangePassword";
import Confetti from "../../lib/Confetti";
import { CurrencyInput } from "../../lib/MaskedInputs";
import DateNav from "../../lib/DateNav";
import MonthNav from "../../lib/MonthNav";
import { calcIndividualPct, formatBRL, formatPct, motivationalMessage } from "../../lib/scoring";
import {
  todayStr,
  firstDayOfMonth,
  remainingDaysInMonth,
  monthLabel,
  greeting,
  yesterdayStr,
} from "../../lib/date";

const TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "metas", label: "Metas", Icon: Wallet },
];

export default function ColaboradorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("atividades");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [selectedMonth, setSelectedMonth] = useState(""); // mês visualizado no dashboard (só permite meses anteriores ao atual)
  const didInit = useRef(false);

  const [tasks, setTasks] = useState([]);
  const [todayCompletions, setTodayCompletions] = useState({});
  const [viewDate, setViewDate] = useState(""); // dia visualizado no checklist de tarefas (pode navegar pra dias anteriores)
  const [dayCompletions, setDayCompletions] = useState({});
  const [individualPct, setIndividualPct] = useState(0);
  const [teamPct, setTeamPct] = useState(0);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState({ warning_penalty_points: 10, team_threshold_pct: 95, monthly_prize: 1000 });
  const [streak, setStreak] = useState(0);
  const [showCongrats, setShowCongrats] = useState(false);

  const [goals, setGoals] = useState([]); // {goal, allocation}, ordenado por store_total crescente (Meta 1, Meta 2…)
  const [commissionSettings, setCommissionSettings] = useState({ non_achievement_colaborador_pct: 0 });
  const [prizes, setPrizes] = useState([]); // premiação mensal lançada pelo gerente (0 ou 1 linha por mês)
  const [entries, setEntries] = useState([]); // lançamentos do mês (valor vendido em cada dia), mais recente primeiro
  const [entryDate, setEntryDate] = useState("");
  const [entryValue, setEntryValue] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryMsg, setEntryMsg] = useState("");

  const today = todayStr();
  const month = selectedMonth || firstDayOfMonth(today);
  const isCurrentMonth = month === firstDayOfMonth(today);
  const greet = greeting();

  const loadAll = useCallback(async (uid, lojaId, monthArg) => {
    const { data: settingsRow } = await supabase.from("app_settings").select("*").eq("loja_id", lojaId).single();
    if (settingsRow) setSettings(settingsRow);
    const penalty = settingsRow?.warning_penalty_points ?? 10;

    const nextMonth = new Date(monthArg + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    // tarefas ativas do colaborador
    const { data: myTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("employee_id", uid)
      .eq("active", true)
      .order("created_at");
    setTasks(myTasks || []);

    // garante que hoje existe uma linha de conclusão pra cada tarefa ativa (reset automático)
    if (myTasks && myTasks.length) {
      const rows = myTasks.map((t) => ({ task_id: t.id, completion_date: today }));
      await supabase.from("task_completions").upsert(rows, { onConflict: "task_id,completion_date", ignoreDuplicates: true });
    }

    const taskIds = (myTasks || []).map((t) => t.id);
    if (taskIds.length) {
      const { data: todayRows } = await supabase
        .from("task_completions")
        .select("*")
        .in("task_id", taskIds)
        .eq("completion_date", today);
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

      // streak: dias consecutivos (voltando de ontem) com 100% das tarefas concluídas — só faz sentido pro mês atual
      if (monthArg === firstDayOfMonth(today)) {
        const byDate = {};
        (monthRows || []).forEach((r) => {
          if (!byDate[r.completion_date]) byDate[r.completion_date] = { total: 0, done: 0 };
          byDate[r.completion_date].total += 1;
          if (r.completed) byDate[r.completion_date].done += 1;
        });
        let s = 0;
        let cursor = yesterdayStr(today);
        while (byDate[cursor] && byDate[cursor].total > 0 && byDate[cursor].done === byDate[cursor].total) {
          s += 1;
          cursor = yesterdayStr(cursor);
        }
        setStreak(s);
      } else {
        setStreak(0);
      }

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
      setStreak(0);
    }

    const { data: teamPctData } = await supabase.rpc("get_team_progress", { p_month: monthArg, p_loja: lojaId });
    setTeamPct(Number(teamPctData) || 0);

    const { data: goalRows } = await supabase.from("sales_goals").select("*").eq("month", monthArg).order("store_total");
    const { data: allocRows } = await supabase
      .from("sales_goal_allocations")
      .select("*")
      .eq("employee_id", uid);
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

    const { data: prizeRows } = await supabase
      .from("employee_prizes")
      .select("*")
      .eq("employee_id", uid)
      .eq("month", monthArg);
    setPrizes(prizeRows || []);
  }, [today]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== "colaborador") {
        router.replace(
          prof?.role === "master_admin"
            ? "/admin"
            : prof?.role === "gerente"
              ? "/gerente"
              : prof?.role === "socio"
                ? "/socio"
                : prof?.role === "supervisor"
                  ? "/supervisor"
                  : "/login"
        );
        return;
      }
      if (!active) return;
      setUser(session.user);
      setProfile(prof);
      setEntryDate(yesterdayStr(todayStr()));
      setViewDate(todayStr());
      const initialMonth = firstDayOfMonth(todayStr());
      setSelectedMonth(initialMonth);
      if (!prof.must_change_password) {
        await loadAll(session.user.id, prof.loja_id, initialMonth);
      }
      didInit.current = true;
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router, loadAll]);

  // recarrega tudo quando o usuário navega pra outro mês (o primeiro carregamento já é feito acima)
  useEffect(() => {
    if (!didInit.current || !user || !profile || !selectedMonth) return;
    loadAll(user.id, profile.loja_id, selectedMonth);
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
    await loadAll(user.id, profile.loja_id, month);

    if (newVal) {
      const willAllBeDone = tasks.length > 0 && tasks.every((t) => (t.id === taskId ? true : todayCompletions[t.id]?.completed));
      if (willAllBeDone) {
        const flagKey = `zmeta_congrats_${user.id}_${today}`;
        if (typeof window !== "undefined" && !window.localStorage.getItem(flagKey)) {
          window.localStorage.setItem(flagKey, "1");
          setShowCongrats(true);
        }
      }
    }
  }

  // checklist de tarefas por dia navegável — "hoje" reaproveita todayCompletions (já vem do loadAll),
  // dias anteriores buscam sob demanda. Só o dia de hoje é editável (toggleTask sempre grava em "today").
  useEffect(() => {
    if (!viewDate || !tasks.length) { setDayCompletions(viewDate === today ? todayCompletions : {}); return; }
    if (viewDate === today) { setDayCompletions(todayCompletions); return; }
    let active = true;
    (async () => {
      const taskIds = tasks.map((t) => t.id);
      const { data } = await supabase
        .from("task_completions")
        .select("*")
        .in("task_id", taskIds)
        .eq("completion_date", viewDate);
      if (!active) return;
      const map = {};
      (data || []).forEach((r) => { map[r.task_id] = r; });
      setDayCompletions(map);
    })();
    return () => { active = false; };
  }, [viewDate, tasks, today, todayCompletions]);

  async function saveEntry(e) {
    e.preventDefault();
    if (entryValue === "" || entryValue === null || entryValue === undefined || Number(entryValue) < 0) return;
    setSavingEntry(true);
    setEntryMsg("");
    const { error } = await supabase.from("sales_entries").upsert(
      {
        employee_id: user.id,
        entry_date: entryDate,
        daily_amount: Number(entryValue),
        edited_by_manager: false,
        created_by: user.id,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        empresa_id: profile.empresa_id,
        loja_id: profile.loja_id,
      },
      { onConflict: "employee_id,entry_date" }
    );
    setSavingEntry(false);
    if (error) {
      setEntryMsg("Erro ao salvar: " + error.message);
    } else {
      setEntryMsg("Lançamento salvo.");
      setEntryValue("");
      await loadAll(user.id, profile.loja_id, month);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-muted gap-2">
        <Loader2 size={16} className="animate-spin" /> carregando…
      </div>
    );
  }

  if (profile.must_change_password) {
    return (
      <ChangePassword
        force
        onDone={async () => {
          const updated = { ...profile, must_change_password: false };
          setProfile(updated);
          await loadAll(user.id, updated.loja_id, month);
        }}
      />
    );
  }

  const remaining = isCurrentMonth ? remainingDaysInMonth(today) : 0;
  const doneCount = tasks.filter((t) => todayCompletions[t.id]?.completed).length;
  const pendingCount = isCurrentMonth ? tasks.length - doneCount : 0;
  const todayPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const willRelease = teamPct >= Number(settings.team_threshold_pct);

  // vendido no mês = soma dos lançamentos diários (cada um é o valor vendido naquele dia)
  const soldSoFar = entries.reduce((s, en) => s + Number(en.daily_amount || 0), 0);
  const latestEntry = entries[0];

  // meta combinada do mês (soma de todas as metas atribuídas a este colaborador)
  const metaDoMes = goals.reduce((s, { allocation }) => s + Number(allocation.amount || 0), 0);
  const restoDaMeta = Math.max(0, metaDoMes - soldSoFar);
  const dailyGoal = remaining > 0 ? restoDaMeta / remaining : 0;

  // comissão por nível de meta: quem passa da meta individual de um nível, comissiona na taxa daquele nível
  // (goals já vem ordenado por valor crescente — meta 1, meta 2, meta 3…). Enquanto não bate nenhuma, usa a
  // taxa de "não atingimento" definida pelo sócio/supervisor.
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

  // histórico com acumulado corrido (mais antigo primeiro pra calcular o acumulado, depois exibido do mais recente)
  const historyAsc = [...entries].sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1));
  let running = 0;
  const historyWithRunning = historyAsc.map((en) => {
    running += Number(en.daily_amount || 0);
    return { ...en, running };
  });
  historyWithRunning.reverse();

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
            <button className="btn mt-5 w-full" onClick={() => setShowCongrats(false)}>Show de bola!</button>
          </div>
        </div>
      )}

      {tab === "atividades" && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-extrabold text-navy flex items-center gap-2">
                <greet.Icon size={22} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
              </h1>
              <p className="text-xs text-muted mt-1 flex items-center flex-wrap gap-2">
                <span>{monthLabel(month)}</span>
                {streak > 0 && (
                  <span className="badge bg-orange/15 text-orange"><Flame size={12} /> {streak} dia{streak > 1 ? "s" : ""} seguidos</span>
                )}
              </p>
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
            <p className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(dailyGoal)}</p>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">
              {isCurrentMonth ? `pra bater a meta do mês nos ${remaining} dia${remaining !== 1 ? "s" : ""} restantes` : `mês fechado — ${monthLabel(month)}`}
            </p>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">{isCurrentMonth ? "Vendido até ontem" : "Vendido no mês"}: {formatBRL(soldSoFar)}</p>

            <div className="relative grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 pt-5 border-t border-navy/15">
              <div>
                <p className="text-xl font-extrabold text-navy">{formatBRL(restoDaMeta)}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Rocket size={11} /> Falta pra meta do mês</p>
              </div>
              <div>
                <p className="text-xl font-extrabold text-navy">{remaining}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><CalendarClock size={11} /> Dias restantes no mês</p>
              </div>
              <div>
                <p className="text-xl font-extrabold text-navy">{pendingCount}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><ListTodo size={11} /> Atividades pendentes</p>
              </div>
              <div>
                <p className="text-xl font-extrabold text-navy">{formatBRL(commissionSoFar)}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Coins size={11} /> Comissão até agora</p>
                {goals.length > 0 && (
                  <p className="text-[10px] text-navy/60 mt-0.5">{activeCommissionPct}% · {activeTierLabel}</p>
                )}
              </div>
              <div>
                <p className="text-xl font-extrabold text-navy">{formatBRL(prizesSoFar)}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Gift size={11} /> Premiações</p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card animate-pop border-purple/20">
              <p className="label flex items-center gap-1.5"><Target size={14} /> Minha barra (mês)</p>
              <ProgressBar pct={individualPct} />
              <p className="text-xs text-muted mt-2 flex items-center gap-1.5">
                {(() => { const m = motivationalMessage(todayPct); return (<><m.Icon size={13} /> {m.text}</>); })()}
              </p>
            </div>
            <div className="card animate-pop border-pink/20">
              <p className="label flex items-center gap-1.5"><Trophy size={14} /> Barra geral da equipe</p>
              <ProgressBar pct={teamPct} threshold={settings.team_threshold_pct} />
              <p className={`text-[12px] mt-2 font-bold flex items-center gap-1.5 ${willRelease ? "text-teal" : "text-muted"}`}>
                {willRelease ? <PartyPopper size={14} /> : <Wallet size={14} />}
                {willRelease
                  ? `Prêmio garantido se seguir assim!`
                  : `Prêmio do mês liberado com ${settings.team_threshold_pct}%+ no fim do mês.`}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="label mb-0 flex items-center gap-1.5"><CheckSquare size={14} /> Tarefas {viewDate === today ? "de hoje" : ""}</p>
              <div className="flex items-center gap-3">
                <DateNav date={viewDate || today} onChange={setViewDate} maxDate={today} />
                {tasks.length > 0 && <span className="text-xs text-muted">{tasks.filter((t) => dayCompletions[t.id]?.completed).length}/{tasks.length}</span>}
              </div>
            </div>
            {tasks.length === 0 && <p className="text-sm text-muted">Nenhuma tarefa cadastrada ainda.</p>}
            {viewDate !== today && <p className="text-[11px] text-muted mb-2">Visualização de um dia anterior — só é possível marcar tarefas no dia de hoje.</p>}
            <ul className="divide-y divide-line">
              {tasks.map((t) => {
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
                  <li key={w.id} className="text-sm flex justify-between border-b border-line pb-2">
                    <span>{w.reason}</span>
                    <span className="text-muted text-xs">{w.warning_date} · -{w.points}%</span>
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
              <h1 className="text-xl font-bold text-navy flex items-center gap-2"><Wallet size={20} className="text-purple" /> Minhas metas — {monthLabel(month)}</h1>
              <p className="text-xs text-muted mt-1">
                Vendido no mês até {latestEntry ? latestEntry.entry_date : "—"}: {formatBRL(soldSoFar)}
                {isCurrentMonth ? ` · faltam ${remaining} dia(s) no mês` : " · mês fechado"}
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
                    <p className="font-bold text-sm text-navy flex items-center gap-1.5"><IconCmp size={15} /> {goal.name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      meta individual: {formatBRL(target)}
                      {Number(goal.commission_pct_colaborador) > 0 && ` · ${Number(goal.commission_pct_colaborador)}% de comissão ao bater essa meta`}
                    </p>
                    <div className="mt-3"><ProgressBar pct={progressPct} showLabel={false} /></div>
                    <p className="text-xs text-muted mt-1">{formatPct(progressPct)} da meta</p>
                    <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] text-muted uppercase tracking-wider font-bold">Meta de hoje</p>
                        <p className="text-xl font-extrabold gradient-text mt-0.5">{formatBRL(goalDailyGoal)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted uppercase tracking-wider font-bold">Falta pra bater</p>
                        <p className="text-xl font-extrabold text-navy mt-0.5">{formatBRL(rest)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isCurrentMonth ? (
            <div className="card">
              <p className="label mb-3 flex items-center gap-1.5"><FileText size={14} /> Lançar valor vendido ontem</p>
              <form onSubmit={saveEntry} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="label">Dia da venda</label>
                  <input type="date" className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
                </div>
                <div className="flex-1 w-full">
                  <label className="label">Valor vendido nesse dia</label>
                  <CurrencyInput value={entryValue} onChange={setEntryValue} required />
                </div>
                <button type="submit" className="btn whitespace-nowrap" disabled={savingEntry}>
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
              <table className="w-full text-sm">
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
    </AppShell>
  );
}

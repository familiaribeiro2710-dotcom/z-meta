"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Target,
  Wallet,
  Trophy,
  Flame,
  PartyPopper,
  Gamepad2,
  CheckSquare,
  Check,
  AlertTriangle,
  ThumbsUp,
  Rocket,
  FileText,
  Loader2,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ProgressBar from "../../lib/ProgressBar";
import ChangePassword from "../../lib/ChangePassword";
import Confetti from "../../lib/Confetti";
import { calcIndividualPct, formatBRL, formatPct, motivationalMessage } from "../../lib/scoring";
import {
  todayStr,
  firstDayOfMonth,
  remainingDaysInMonth,
  monthLabel,
  stageNumberForDate,
  stageRangeLabel,
  greeting,
  yesterdayStr,
} from "../../lib/date";

const TABS = [
  { key: "atividades", label: "Atividades", Icon: Target },
  { key: "metas", label: "Metas", Icon: Wallet },
];

export default function ColaboradorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("atividades");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [todayCompletions, setTodayCompletions] = useState({});
  const [individualPct, setIndividualPct] = useState(0);
  const [teamPct, setTeamPct] = useState(0);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState({ warning_penalty_points: 10, team_threshold_pct: 95, monthly_prize: 1000 });
  const [stages, setStages] = useState([]);
  const [streak, setStreak] = useState(0);
  const [showCongrats, setShowCongrats] = useState(false);

  const [goals, setGoals] = useState([]); // {goal, allocation}
  const [entries, setEntries] = useState([]);
  const [entryDate, setEntryDate] = useState("");
  const [entryValue, setEntryValue] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryMsg, setEntryMsg] = useState("");

  const today = todayStr();
  const month = firstDayOfMonth(today);
  const greet = greeting();

  const loadAll = useCallback(async (uid, empresaId) => {
    const { data: settingsRow } = await supabase.from("app_settings").select("*").eq("empresa_id", empresaId).single();
    if (settingsRow) setSettings(settingsRow);
    const penalty = settingsRow?.warning_penalty_points ?? 10;

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

      const nextMonth = new Date(month + "T00:00:00");
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthStr = nextMonth.toISOString().slice(0, 10);
      const { data: monthRows } = await supabase
        .from("task_completions")
        .select("completed, completion_date")
        .in("task_id", taskIds)
        .gte("completion_date", month)
        .lt("completion_date", nextMonthStr);
      const expected = (monthRows || []).length;
      const completed = (monthRows || []).filter((r) => r.completed).length;

      // streak: dias consecutivos (voltando de ontem) com 100% das tarefas concluídas
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

      const { data: monthWarnings } = await supabase
        .from("warnings")
        .select("*")
        .eq("employee_id", uid)
        .gte("warning_date", month)
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
        .gte("warning_date", month)
        .order("warning_date", { ascending: false });
      setWarnings(monthWarnings || []);
      setIndividualPct(calcIndividualPct({ completed: 0, expected: 0, warningsCount: (monthWarnings || []).length, penaltyPerWarning: penalty }));
      setStreak(0);
    }

    const { data: teamPctData } = await supabase.rpc("get_team_progress", { p_month: month, p_empresa: empresaId });
    setTeamPct(Number(teamPctData) || 0);

    const { data: stageRows } = await supabase.from("stage_dynamics").select("*").eq("month", month).order("stage_number");
    setStages(stageRows || []);

    const { data: goalRows } = await supabase.from("sales_goals").select("*").eq("month", month).order("store_total");
    const { data: allocRows } = await supabase
      .from("sales_goal_allocations")
      .select("*")
      .eq("employee_id", uid);
    const combined = (goalRows || [])
      .map((g) => ({ goal: g, allocation: (allocRows || []).find((a) => a.goal_id === g.id) }))
      .filter((x) => x.allocation);
    setGoals(combined);

    const { data: entryRows } = await supabase
      .from("sales_entries")
      .select("*")
      .eq("employee_id", uid)
      .order("entry_date", { ascending: false })
      .limit(31);
    setEntries(entryRows || []);
  }, [today, month]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== "colaborador") {
        router.replace(prof?.role === "master_admin" ? "/admin" : prof?.role === "gestor" ? "/gestor" : "/login");
        return;
      }
      if (!active) return;
      setUser(session.user);
      setProfile(prof);
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setEntryDate(y.toISOString().slice(0, 10));
      if (!prof.must_change_password) {
        await loadAll(session.user.id, prof.empresa_id);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router, loadAll]);

  async function toggleTask(taskId) {
    const current = todayCompletions[taskId];
    const newVal = !current?.completed;
    await supabase
      .from("task_completions")
      .update({ completed: newVal, completed_at: newVal ? new Date().toISOString() : null })
      .eq("task_id", taskId)
      .eq("completion_date", today);
    await loadAll(user.id, profile.empresa_id);

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

  async function saveEntry(e) {
    e.preventDefault();
    if (!entryValue || Number(entryValue) < 0) return;
    setSavingEntry(true);
    setEntryMsg("");
    const { error } = await supabase.from("sales_entries").upsert(
      {
        employee_id: user.id,
        entry_date: entryDate,
        cumulative_amount: Number(entryValue),
        edited_by_manager: false,
        created_by: user.id,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        empresa_id: profile.empresa_id,
      },
      { onConflict: "employee_id,entry_date" }
    );
    setSavingEntry(false);
    if (error) {
      setEntryMsg("Erro ao salvar: " + error.message);
    } else {
      setEntryMsg("Lançamento salvo.");
      setEntryValue("");
      await loadAll(user.id, profile.empresa_id);
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
          await loadAll(user.id, updated.empresa_id);
        }}
      />
    );
  }

  const remaining = remainingDaysInMonth(today);
  const currentStage = stageNumberForDate(today);
  const latestEntry = entries[0];
  const soldSoFar = latestEntry ? Number(latestEntry.cumulative_amount) : 0;
  const doneCount = tasks.filter((t) => todayCompletions[t.id]?.completed).length;
  const todayPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const willRelease = teamPct >= Number(settings.team_threshold_pct);

  return (
    <AppShell userName={profile.full_name} tabs={TABS} activeTab={tab} onTabChange={setTab}>
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
          <div>
            <h1 className="text-2xl font-extrabold text-navy flex items-center gap-2">
              <greet.Icon size={22} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
            </h1>
            <p className="text-xs text-muted mt-1 flex items-center flex-wrap gap-2">
              <span>{monthLabel(today)} · estágio {currentStage} ({stageRangeLabel(currentStage, today)})</span>
              {streak > 0 && (
                <span className="badge bg-orange/15 text-orange"><Flame size={12} /> {streak} dia{streak > 1 ? "s" : ""} seguidos</span>
              )}
            </p>
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
                  ? `Prêmio de ${formatBRL(settings.monthly_prize)} garantido se seguir assim!`
                  : `Prêmio do mês: ${formatBRL(settings.monthly_prize)} — libera com ${settings.team_threshold_pct}%+ no fim do mês.`}
              </p>
            </div>
          </div>

          {stages.some((s) => s.title || s.description) && (
            <div className="card">
              <p className="label mb-2 flex items-center gap-1.5"><Gamepad2 size={14} /> Dinâmica do estágio atual</p>
              {stages.filter((s) => s.stage_number === currentStage).map((s) => (
                <div key={s.id}>
                  <p className="text-sm font-semibold text-navy">{s.title || `Estágio ${s.stage_number}`}</p>
                  {s.description && <p className="text-sm text-muted mt-1">{s.description}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="label mb-0 flex items-center gap-1.5"><CheckSquare size={14} /> Tarefas de hoje</p>
              {tasks.length > 0 && <span className="text-xs text-muted">{doneCount}/{tasks.length}</span>}
            </div>
            {tasks.length === 0 && <p className="text-sm text-muted">Nenhuma tarefa cadastrada ainda.</p>}
            <ul className="divide-y divide-line">
              {tasks.map((t) => {
                const done = !!todayCompletions[t.id]?.completed;
                return (
                  <li className="flex items-center gap-3 py-3" key={t.id}>
                    <button
                      onClick={() => toggleTask(t.id)}
                      className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center shrink-0 transition-all font-bold text-white ${
                        done ? "border-transparent animate-bounce-in" : "border-line bg-white hover:border-purple"
                      }`}
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

          <ChangePassword />
        </div>
      )}

      {tab === "metas" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-navy flex items-center gap-2"><Wallet size={20} className="text-purple" /> Minhas metas — {monthLabel(today)}</h1>
            <p className="text-xs text-muted mt-1">
              Vendido até {latestEntry ? latestEntry.entry_date : "—"}: {formatBRL(soldSoFar)} · faltam {remaining} dia(s) no mês
            </p>
          </div>

          {goals.length === 0 ? (
            <div className="card"><p className="text-sm text-muted">Nenhuma meta cadastrada para este mês ainda.</p></div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {goals.map(({ goal, allocation }, i) => {
                const target = Number(allocation.amount);
                const rest = Math.max(0, target - soldSoFar);
                const dailyGoal = rest / remaining;
                const progressPct = target > 0 ? Math.min(100, (soldSoFar / target) * 100) : 0;
                const icons = [Target, Rocket, Trophy];
                const IconCmp = icons[i % icons.length];
                const borders = ["border-purple/25", "border-orange/25", "border-teal/25"];
                return (
                  <div key={goal.id} className={`card animate-pop ${borders[i % borders.length]}`}>
                    <p className="font-bold text-sm text-navy flex items-center gap-1.5"><IconCmp size={15} /> {goal.name}</p>
                    <p className="text-xs text-muted mt-0.5">meta individual: {formatBRL(target)}</p>
                    <div className="mt-3"><ProgressBar pct={progressPct} showLabel={false} /></div>
                    <p className="text-xs text-muted mt-1">{formatPct(progressPct)} da meta</p>
                    <div className="mt-3 pt-3 border-t border-line">
                      <p className="text-[11px] text-muted uppercase tracking-wider font-bold">Meta de hoje</p>
                      <p className="text-xl font-extrabold gradient-text mt-0.5">{formatBRL(dailyGoal)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="card">
            <p className="label mb-3 flex items-center gap-1.5"><FileText size={14} /> Lançar valor vendido no mês (acumulado)</p>
            <form onSubmit={saveEntry} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label className="label">Data de referência</label>
                <input type="date" className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
              </div>
              <div className="flex-1 w-full">
                <label className="label">Valor total vendido no mês até essa data</label>
                <input type="number" step="0.01" min="0" className="input" value={entryValue} onChange={(e) => setEntryValue(e.target.value)} required />
              </div>
              <button type="submit" className="btn whitespace-nowrap" disabled={savingEntry}>
                {savingEntry ? "Salvando…" : "Salvar"}
              </button>
            </form>
            {entryMsg && <p className="text-xs text-muted mt-2">{entryMsg}</p>}

            {entries.length > 0 && (
              <div className="mt-5">
                <p className="label mb-2">Histórico recente</p>
                <ul className="text-sm divide-y divide-line">
                  {entries.slice(0, 8).map((en) => (
                    <li key={en.id} className="flex justify-between py-1.5">
                      <span className="text-muted">{en.entry_date}{en.edited_by_manager ? " (corrigido pelo gestor)" : ""}</span>
                      <span>{formatBRL(en.cumulative_amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

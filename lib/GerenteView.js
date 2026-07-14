"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Store, Rocket, CalendarClock, ListTodo, Coins, Gift, Eye, ArrowLeft, CheckSquare, Check, AlertTriangle, Target, Trophy } from "lucide-react";
import { supabase } from "./supabaseClient";
import EmpresaDashboard, { EMPRESA_TABS } from "./EmpresaDashboard";
import ColaboradorView from "./ColaboradorView";
import MonthNav from "./MonthNav";
import Led from "./Led";
import { formatBRL, currentGoalTarget } from "./scoring";
import { greeting, todayStr, firstDayOfMonth, remainingDaysInMonth, monthLabel, isTaskDueOn } from "./date";

export { EMPRESA_TABS };

// Reaproveita a mesma experiência do gerente (herocard da loja/equipe + EmpresaDashboard) — usado
// tanto pela própria página do gerente quanto pelo supervisor, quando ele clica em um gerente na
// aba Colaboradores pra ver como se tivesse entrado com o id daquele gerente. Monte com
// key={profile.id} pra garantir estado limpo por pessoa.
export default function GerenteView({ profile, tab, viewedBySupervisor = false, onBack }) {
  const [lojaName, setLojaName] = useState("");
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(firstDayOfMonth(todayStr()));
  const didInit = useRef(false);
  const [hero, setHero] = useState({
    metaLoja: 0,
    soldLoja: 0,
    pendingToday: 0,
    commissionSoFar: 0,
    prizesSoFar: 0,
    commissionPct: 0,
    commissionTierLabel: "não atingimento",
    leaderName: null,
  });
  const [personalTasks, setPersonalTasks] = useState([]);
  const [personalCompletions, setPersonalCompletions] = useState({});
  const [personalWarnings, setPersonalWarnings] = useState([]);
  const [personalPrizes, setPersonalPrizes] = useState([]);
  const [goalsList, setGoalsList] = useState([]);
  const [teamEmps, setTeamEmps] = useState([]);
  const [activeGoal, setActiveGoal] = useState(null);
  const [activeGoalAllocs, setActiveGoalAllocs] = useState([]);
  const [storeRanking, setStoreRanking] = useState([]);
  const [teamActivity, setTeamActivity] = useState([]);
  const greet = greeting();
  const today = todayStr();
  const month = selectedMonth || firstDayOfMonth(today);
  const isCurrentMonth = month === firstDayOfMonth(today);

  // tarefas/advertências/premiações lançadas diretamente pro gerente (não pra equipe) — o supervisor
  // pode atribuir essas coisas tanto pra colaboradores quanto pra gerentes.
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

    // só os colaboradores da PRÓPRIA equipe (gerente_id = este gerente) — a loja pode ter outros
    // gerentes com outras equipes.
    const { data: emps } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("gerente_id", prof.id)
      .eq("role", "colaborador")
      .eq("active", true);
    const empIds = (emps || []).map((e) => e.id);
    setTeamEmps(emps || []);

    const nextMonth = new Date(monthArg + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    let pendingToday = 0;
    if (monthArg === firstDayOfMonth(todayStr()) && empIds.length) {
      const { data: activeTasks } = await supabase
        .from("tasks")
        .select("id, recurrence_type, weekday, once_date, start_date")
        .in("employee_id", empIds)
        .eq("active", true);
      // só conta como pendente quem realmente vale hoje — diária sempre, semanal só no seu dia,
      // única só na sua data.
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

    // Atividades por colaborador: quantas tarefas cada um tem no mês selecionado e quantas já
    // concluiu, com um indicador de status — vermelho se tem alguma atrasada (dia passado sem
    // marcar), amarelo se tem pendente hoje (nenhuma atrasada), verde se está 100% em dia.
    // "Atrasada"/"pendente hoje" só fazem sentido pro mês corrente (não dá pra estar atrasado
    // num mês fechado) — em meses passados o indicador reflete só o que ficou sem concluir.
    let teamActivityData = [];
    if (empIds.length) {
      const { data: allTeamTasks } = await supabase
        .from("tasks")
        .select("id, employee_id")
        .in("employee_id", empIds);
      const employeeByTaskId = {};
      (allTeamTasks || []).forEach((t) => { employeeByTaskId[t.id] = t.employee_id; });
      const allTaskIds = Object.keys(employeeByTaskId);

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

      const todayNow = todayStr();
      teamActivityData = (emps || []).map((emp) => {
        const rows = actCompletions.filter((c) => employeeByTaskId[c.task_id] === emp.id);
        const expected = rows.length;
        const doneCount = rows.filter((r) => r.completed).length;
        const overdue = rows.filter((r) => !r.completed && r.completion_date < todayNow).length;
        const pendingTodayCount = rows.filter((r) => !r.completed && r.completion_date === todayNow).length;
        let status = "gray";
        if (overdue > 0) status = "red";
        else if (pendingTodayCount > 0) status = "yellow";
        else if (expected > 0 && doneCount === expected) status = "green";
        return { id: emp.id, name: emp.full_name, expected, completed: doneCount, overdue, pendingToday: pendingTodayCount, status };
      });
    }
    setTeamActivity(teamActivityData);

    const { data: goalRows } = await supabase
      .from("sales_goals")
      .select("id, name, store_total, commission_pct_colaborador, commission_pct_gerente")
      .eq("loja_id", prof.loja_id)
      .eq("month", monthArg)
      .order("store_total", { ascending: true });
    setGoalsList(goalRows || []);

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

    // quem está liderando as vendas da equipe até agora no mês — exibido no herocard ao lado de Premiações
    const soldByEmp = {};
    entryRows.forEach((e) => {
      soldByEmp[e.employee_id] = (soldByEmp[e.employee_id] || 0) + Number(e.daily_amount || 0);
    });
    let leaderName = null;
    let leaderSold = 0;
    (emps || []).forEach((emp) => {
      const sold = soldByEmp[emp.id] || 0;
      if (sold > leaderSold) { leaderSold = sold; leaderName = emp.full_name; }
    });

    // ranking de vendas da própria equipe do gerente — mesmos dados já carregados acima
    // (soldByEmp), sem precisar de RPC nem de outra query.
    const ranking = (emps || [])
      .map((emp) => ({ id: emp.id, name: emp.full_name, sold: soldByEmp[emp.id] || 0 }))
      .sort((a, b) => b.sold - a.sold);
    setStoreRanking(ranking);

    // metas são níveis (Meta, Super Meta, Hiper Meta…) — não somam. O alvo "em jogo" é sempre o
    // próximo nível ainda não batido; se todos já foram batidos, fica valendo o último deles.
    const metaLoja = currentGoalTarget((goalRows || []).map((g) => g.store_total), soldLoja);
    const activeGoal = (goalRows || []).find((g) => soldLoja < Number(g.store_total)) || (goalRows && goalRows.length ? goalRows[goalRows.length - 1] : null);
    setActiveGoal(activeGoal || null);

    // distribuição da meta atualmente em jogo entre os colaboradores da equipe — só leitura pro gerente
    if (activeGoal && empIds.length) {
      const { data: allocRows } = await supabase
        .from("sales_goal_allocations")
        .select("*")
        .eq("goal_id", activeGoal.id)
        .in("employee_id", empIds);
      setActiveGoalAllocs(allocRows || []);
    } else {
      setActiveGoalAllocs([]);
    }

    const { data: commissionRow } = await supabase
      .from("commission_settings")
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

    setHero({ metaLoja, soldLoja, pendingToday, commissionSoFar, prizesSoFar, commissionPct, commissionTierLabel, leaderName });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const initialMonth = firstDayOfMonth(todayStr());
      await Promise.all([loadStats(profile, initialMonth), loadPersonal(profile, initialMonth)]);
      if (!active) return;
      didInit.current = true;
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

  const remaining = isCurrentMonth ? remainingDaysInMonth(today) : 0;
  const restoDaMeta = Math.max(0, hero.metaLoja - hero.soldLoja);
  const dailyGoal = isCurrentMonth && remaining > 0 ? restoDaMeta / remaining : 0;
  const personalTasksToday = personalTasks.filter((t) => isTaskDueOn(t, today));

  if (viewingEmployee) {
    return (
      <ColaboradorView
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
            style={{ background: "linear-gradient(135deg, #16a34a 0%, #4ade80 100%)", boxShadow: "0 10px 28px rgba(22,163,74,0.35)" }}
          >
            <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/15" />
            <div className="relative flex items-center gap-2 mb-3">
              <Store size={18} className="text-navy" />
              <span className="text-xs font-bold uppercase tracking-wider text-navy">Meta de hoje · {lojaName || "sua loja"}</span>
            </div>
            <p className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(dailyGoal)}</p>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">
              {isCurrentMonth ? `pra bater a meta da loja nos ${remaining} dia${remaining !== 1 ? "s" : ""} restantes` : `mês fechado — ${monthLabel(month)}`}
            </p>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">{isCurrentMonth ? "Vendido até ontem" : "Vendido no mês"}: {formatBRL(hero.soldLoja)}</p>

            <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-4 mt-6 pt-5 border-t border-navy/15">
              <div className="min-w-0">
                <p className="text-lg sm:text-xl font-extrabold text-navy break-words">{formatBRL(restoDaMeta)}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Rocket size={11} className="shrink-0" /> Falta pra meta do mês</p>
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-xl font-extrabold text-navy">{remaining}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><CalendarClock size={11} className="shrink-0" /> Dias restantes no mês</p>
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-xl font-extrabold text-navy">{hero.pendingToday}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><ListTodo size={11} className="shrink-0" /> Atividades pendentes</p>
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-xl font-extrabold text-navy break-words">{formatBRL(hero.commissionSoFar)}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Coins size={11} className="shrink-0" /> Comissão até agora</p>
                {hero.metaLoja > 0 && (
                  <p className="text-[10px] text-navy/60 mt-0.5">{hero.commissionPct}% · {hero.commissionTierLabel}</p>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-xl font-extrabold text-navy break-words">{formatBRL(hero.prizesSoFar)}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Gift size={11} className="shrink-0" /> Premiações</p>
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-xl font-extrabold text-navy break-words truncate">{hero.leaderName || "—"}</p>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Trophy size={11} className="shrink-0" /> Líder de vendas</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* as abas Placar/Colaboradores/Tarefas/Advertências/Premiações (dentro do EmpresaDashboard)
          ficam logo abaixo do herocard, em todos os usuários — os cards de apoio (distribuição da
          meta, ranking, painel pessoal) vêm depois, não entre o herocard e as abas. */}
      <EmpresaDashboard
        lojaId={profile.loja_id}
        empresaId={profile.empresa_id}
        viewerRole="gerente"
        viewerId={profile.id}
        tab={tab}
        month={month}
        onOpenEmployee={setViewingEmployee}
      />

      {tab === "atividades" && (
        <>
          {activeGoal && (
            <div className="card animate-pop border-orange/20">
              <p className="label mb-3 flex items-center gap-1.5"><Target size={14} /> Distribuição da meta em jogo — {activeGoal.name}</p>
              {teamEmps.length === 0 ? (
                <p className="text-sm text-muted">Nenhum colaborador na equipe ainda.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {teamEmps.map((emp) => {
                    const alloc = activeGoalAllocs.find((a) => a.employee_id === emp.id);
                    return (
                      <li key={emp.id} className="flex items-center justify-between gap-2 flex-wrap py-2 text-sm">
                        <span className="text-navy font-medium break-words">{emp.full_name}</span>
                        <span className="text-muted whitespace-nowrap">{alloc ? formatBRL(alloc.amount) : "sem distribuição"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
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

          {teamActivity.length > 0 && (
            <div className="card animate-pop">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <p className="label mb-0 flex items-center gap-1.5"><CheckSquare size={14} /> Atividades por colaborador — {monthLabel(month)}</p>
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

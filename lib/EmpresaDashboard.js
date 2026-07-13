"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";
import ProgressBar from "./ProgressBar";
import { calcIndividualPct, calcTeamPct, formatBRL } from "./scoring";
import { todayStr, firstDayOfMonth, monthLabel, stageRangeLabel } from "./date";

const TABS = [
  { key: "atividades", label: "🎯 Atividades" },
  { key: "metas", label: "💰 Metas" },
];

const ATIV_SUBS = [
  { key: "placar", label: "🏆 Placar" },
  { key: "colaboradores", label: "👥 Colaboradores" },
  { key: "tarefas", label: "✅ Tarefas" },
  { key: "advertencias", label: "⚠️ Advertências" },
  { key: "estagios", label: "🕹️ Estágios" },
];

const META_SUBS = [
  { key: "metas", label: "🎯 Metas do mês" },
  { key: "lancamentos", label: "📝 Lançamentos" },
];

// Painel completo de uma empresa (Atividades + Metas). Usado tanto pelo gestor
// (com a empresa dele) quanto pelo Master Admin (escolhendo qualquer empresa).
export default function EmpresaDashboard({ empresaId }) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("atividades");
  const [atSub, setAtSub] = useState("placar");
  const [metaSub, setMetaSub] = useState("metas");

  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState({ warning_penalty_points: 10, team_threshold_pct: 95, monthly_prize: 1000 });
  const [stages, setStages] = useState([]);
  const [scoreboard, setScoreboard] = useState([]);
  const [teamPct, setTeamPct] = useState(0);

  const [goals, setGoals] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [entries, setEntries] = useState([]);

  const today = todayStr();
  const month = firstDayOfMonth(today);

  const loadAll = useCallback(async () => {
    if (!empresaId) return;
    const { data: emps } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "colaborador")
      .eq("empresa_id", empresaId)
      .order("full_name");
    setEmployees(emps || []);

    const { data: settingsRow } = await supabase
      .from("app_settings")
      .select("*")
      .eq("empresa_id", empresaId)
      .single();
    if (settingsRow) setSettings(settingsRow);
    const penalty = settingsRow?.warning_penalty_points ?? 10;

    const { data: allTasks } = await supabase.from("tasks").select("*").eq("empresa_id", empresaId).order("created_at");
    setTasks(allTasks || []);

    const { data: allWarnings } = await supabase
      .from("warnings")
      .select("*")
      .eq("empresa_id", empresaId)
      .gte("warning_date", month)
      .order("warning_date", { ascending: false });
    setWarnings(allWarnings || []);

    const { data: stageRows } = await supabase
      .from("stage_dynamics")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("month", month)
      .order("stage_number");
    setStages(stageRows || []);

    const { data: goalRows } = await supabase
      .from("sales_goals")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("month", month)
      .order("created_at");
    setGoals(goalRows || []);
    const { data: allocRows } = await supabase.from("sales_goal_allocations").select("*").eq("empresa_id", empresaId);
    setAllocations(allocRows || []);
    const { data: entryRows } = await supabase
      .from("sales_entries")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("entry_date", { ascending: false });
    setEntries(entryRows || []);

    const nextMonth = new Date(month + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    const { data: completions } = await supabase
      .from("task_completions")
      .select("task_id, completed, completion_date, tasks!inner(employee_id, empresa_id)")
      .eq("tasks.empresa_id", empresaId)
      .gte("completion_date", month)
      .lt("completion_date", nextMonthStr);

    const board = (emps || []).map((emp) => {
      const rows = (completions || []).filter((c) => c.tasks.employee_id === emp.id);
      const expected = rows.length;
      const completed = rows.filter((r) => r.completed).length;
      const wCount = (allWarnings || []).filter((w) => w.employee_id === emp.id).length;
      const pct = calcIndividualPct({ completed, expected, warningsCount: wCount, penaltyPerWarning: penalty });
      return { employee: emp, expected, completed, warnings: wCount, pct };
    });
    setScoreboard(board);
    setTeamPct(calcTeamPct(board.map((b) => b.pct)));
  }, [empresaId, month]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await loadAll();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [loadAll]);

  async function refresh() { await loadAll(); }

  if (loading) {
    return <p className="text-xs text-muted py-10 text-center">carregando… ⏳</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm font-medium px-4 py-2 rounded-full border transition-all ${
              tab === t.key ? "bg-gold text-navy border-gold shadow-soft" : "border-line text-muted hover:border-navy hover:text-navy"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "atividades" && (
        <div className="space-y-6">
          <SubNav subs={ATIV_SUBS} active={atSub} onChange={setAtSub} />
          {atSub === "placar" && (
            <Placar
              scoreboard={scoreboard}
              teamPct={teamPct}
              settings={settings}
              month={month}
              onSaveSettings={async (vals) => {
                await supabase.from("app_settings").update(vals).eq("empresa_id", empresaId);
                await refresh();
              }}
            />
          )}
          {atSub === "colaboradores" && <Colaboradores employees={employees} onChanged={refresh} />}
          {atSub === "tarefas" && <Tarefas employees={employees} tasks={tasks} empresaId={empresaId} onChanged={refresh} />}
          {atSub === "advertencias" && (
            <Advertencias employees={employees} warnings={warnings} settings={settings} today={today} empresaId={empresaId} onChanged={refresh} />
          )}
          {atSub === "estagios" && <Estagios stages={stages} month={month} today={today} empresaId={empresaId} onChanged={refresh} />}
        </div>
      )}

      {tab === "metas" && (
        <div className="space-y-6">
          <SubNav subs={META_SUBS} active={metaSub} onChange={setMetaSub} />
          {metaSub === "metas" && (
            <Metas employees={employees} goals={goals} allocations={allocations} month={month} empresaId={empresaId} onChanged={refresh} />
          )}
          {metaSub === "lancamentos" && (
            <Lancamentos employees={employees} entries={entries} empresaId={empresaId} onChanged={refresh} />
          )}
        </div>
      )}
    </div>
  );
}

function SubNav({ subs, active, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {subs.map((s) => (
        <button
          key={s.key}
          onClick={() => onChange(s.key)}
          className={`text-xs font-medium px-3.5 py-2 rounded-full border transition-all ${
            active === s.key ? "bg-navy text-white border-navy shadow-soft" : "border-line text-muted hover:border-navy hover:text-navy"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function Placar({ scoreboard, teamPct, settings, month, onSaveSettings }) {
  const [penalty, setPenalty] = useState(settings.warning_penalty_points);
  const [threshold, setThreshold] = useState(settings.team_threshold_pct);
  const [prize, setPrize] = useState(settings.monthly_prize);

  const willRelease = teamPct >= Number(settings.team_threshold_pct);

  return (
    <div className="space-y-6">
      <div className="card animate-pop">
        <p className="label">🏆 Barra geral da equipe — {monthLabel(month)}</p>
        <ProgressBar pct={teamPct} threshold={settings.team_threshold_pct} />
        <p className={`text-sm mt-3 font-semibold ${willRelease ? "text-success" : "text-danger"}`}>
          {willRelease
            ? `🎉 Se o mês fechasse hoje: prêmio de ${formatBRL(settings.monthly_prize)} liberado!`
            : `😬 Se o mês fechasse hoje: prêmio zerado (abaixo de ${settings.team_threshold_pct}%).`}
        </p>
      </div>

      <div className="card overflow-x-auto">
        <p className="label mb-3">Placar individual</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-line">
              <th className="pb-2">Colaborador</th>
              <th className="pb-2">Tarefas</th>
              <th className="pb-2">Advertências</th>
              <th className="pb-2 w-40">%</th>
            </tr>
          </thead>
          <tbody>
            {scoreboard.map((b) => (
              <tr key={b.employee.id} className="border-b border-line last:border-0">
                <td className="py-2.5 font-medium text-navy">{b.employee.full_name}</td>
                <td className="py-2.5 text-muted">{b.completed}/{b.expected}</td>
                <td className="py-2.5 text-muted">{b.warnings > 0 ? `⚠️ ${b.warnings}` : "—"}</td>
                <td className="py-2.5"><ProgressBar pct={b.pct} showLabel={false} height="h-2.5" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <p className="label mb-3">⚙️ Configurações</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSaveSettings({
              warning_penalty_points: Number(penalty),
              team_threshold_pct: Number(threshold),
              monthly_prize: Number(prize),
            });
          }}
          className="grid sm:grid-cols-3 gap-4"
        >
          <div>
            <label className="label">Desconto por advertência (%)</label>
            <input type="number" step="0.5" className="input" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          </div>
          <div>
            <label className="label">Meta da barra geral (%)</label>
            <input type="number" step="0.5" className="input" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div>
            <label className="label">Premiação mensal (R$)</label>
            <input type="number" step="0.01" className="input" value={prize} onChange={(e) => setPrize(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <button className="btn" type="submit">Salvar configurações</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Colaboradores({ employees, onChanged }) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ fullName, password }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setMsg(`✅ Colaborador criado! Usuário: ${json.username} · peça para trocar a senha no primeiro acesso.`);
    setFullName(""); setPassword("");
    onChanged();
  }

  async function toggleActive(emp) {
    await supabase.from("profiles").update({ active: !emp.active }).eq("id", emp.id);
    onChanged();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="label mb-3">➕ Novo colaborador</p>
        <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Nome completo</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Senha temporária</label>
            <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <button className="btn" type="submit" disabled={loading}>{loading ? "Criando…" : "Criar colaborador"}</button>
          </div>
        </form>
        <p className="text-[11px] text-muted mt-2">O usuário de login é gerado automaticamente a partir do nome. O colaborador poderá trocar a senha no primeiro acesso.</p>
        {msg && <p className="text-xs text-muted mt-2">{msg}</p>}
      </div>

      <div className="card">
        <p className="label mb-3">👥 Equipe ({employees.length})</p>
        <ul className="divide-y divide-line">
          {employees.map((emp) => (
            <li key={emp.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p className="font-medium text-navy">{emp.full_name}</p>
                <p className="text-xs text-muted">usuário: {emp.username}</p>
              </div>
              <button onClick={() => toggleActive(emp)} className={`text-xs uppercase tracking-wider font-medium ${emp.active ? "text-muted" : "text-danger"}`}>
                {emp.active ? "ativo (desativar)" : "inativo (ativar)"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Tarefas({ employees, tasks, empresaId, onChanged }) {
  const [selected, setSelected] = useState(employees[0]?.id || "");
  const [title, setTitle] = useState("");
  const myTasks = tasks.filter((t) => t.employee_id === selected);

  async function addTask(e) {
    e.preventDefault();
    if (!selected || !title.trim()) return;
    await supabase.from("tasks").insert({ employee_id: selected, title: title.trim(), empresa_id: empresaId });
    setTitle("");
    onChanged();
  }

  async function toggleActive(t) {
    await supabase.from("tasks").update({ active: !t.active }).eq("id", t.id);
    onChanged();
  }

  async function removeTask(t) {
    await supabase.from("tasks").delete().eq("id", t.id);
    onChanged();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label">Colaborador</label>
        <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
        </select>
      </div>

      <div className="card">
        <p className="label mb-3">✅ Tarefas diárias</p>
        <form onSubmit={addTask} className="flex gap-3 mb-4">
          <input className="input" placeholder="nome da tarefa" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn whitespace-nowrap" type="submit">Adicionar</button>
        </form>
        <ul className="divide-y divide-line">
          {myTasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className={t.active ? "text-navy" : "text-muted line-through"}>{t.title}</span>
              <div className="flex gap-3">
                <button onClick={() => toggleActive(t)} className="text-xs uppercase tracking-wider text-muted hover:text-navy">
                  {t.active ? "pausar" : "reativar"}
                </button>
                <button onClick={() => removeTask(t)} className="text-xs uppercase tracking-wider text-danger">excluir</button>
              </div>
            </li>
          ))}
          {myTasks.length === 0 && <p className="text-sm text-muted py-2">Nenhuma tarefa para este colaborador.</p>}
        </ul>
      </div>
    </div>
  );
}

function Advertencias({ employees, warnings, settings, today, empresaId, onChanged }) {
  const [selected, setSelected] = useState(employees[0]?.id || "");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [points, setPoints] = useState(settings.warning_penalty_points);
  const myWarnings = warnings.filter((w) => w.employee_id === selected);

  async function addWarning(e) {
    e.preventDefault();
    if (!selected || !reason.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("warnings").insert({
      employee_id: selected,
      warning_date: date,
      reason: reason.trim(),
      points: Number(points),
      created_by: session.user.id,
      empresa_id: empresaId,
    });
    setReason("");
    onChanged();
  }

  async function removeWarning(w) {
    await supabase.from("warnings").delete().eq("id", w.id);
    onChanged();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label">Colaborador</label>
        <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
        </select>
      </div>

      <div className="card">
        <p className="label mb-3">⚠️ Registrar advertência</p>
        <form onSubmit={addWarning} className="grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Motivo</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex: atraso, falha de atendimento…" />
          </div>
          <div>
            <label className="label">Desconto (%)</label>
            <input type="number" step="0.5" className="input" value={points} onChange={(e) => setPoints(e.target.value)} />
          </div>
          <div className="sm:col-span-4">
            <button className="btn" type="submit">Registrar</button>
          </div>
        </form>
      </div>

      <div className="card">
        <p className="label mb-3">Advertências do mês ({myWarnings.length})</p>
        <ul className="divide-y divide-line">
          {myWarnings.map((w) => (
            <li key={w.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p>{w.reason}</p>
                <p className="text-xs text-muted">{w.warning_date} · -{w.points}%</p>
              </div>
              <button onClick={() => removeWarning(w)} className="text-xs uppercase tracking-wider text-danger">remover</button>
            </li>
          ))}
          {myWarnings.length === 0 && <p className="text-sm text-muted py-2">Nenhuma advertência este mês. 👏</p>}
        </ul>
      </div>
    </div>
  );
}

function Estagios({ stages, month, today, empresaId, onChanged }) {
  const [drafts, setDrafts] = useState(() => {
    const base = { 1: { title: "", description: "" }, 2: { title: "", description: "" }, 3: { title: "", description: "" } };
    stages.forEach((s) => { base[s.stage_number] = { title: s.title || "", description: s.description || "" }; });
    return base;
  });

  useEffect(() => {
    const base = { 1: { title: "", description: "" }, 2: { title: "", description: "" }, 3: { title: "", description: "" } };
    stages.forEach((s) => { base[s.stage_number] = { title: s.title || "", description: s.description || "" }; });
    setDrafts(base);
  }, [stages]);

  async function save(n) {
    await supabase.from("stage_dynamics").upsert(
      { month, stage_number: n, title: drafts[n].title, description: drafts[n].description, empresa_id: empresaId },
      { onConflict: "empresa_id,month,stage_number" }
    );
    onChanged();
  }

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      {[1, 2, 3].map((n) => (
        <div key={n} className="card">
          <p className="label">🕹️ Estágio {n} · {stageRangeLabel(n, today)}</p>
          <input
            className="input mt-2"
            placeholder="nome da dinâmica"
            value={drafts[n].title}
            onChange={(e) => setDrafts((d) => ({ ...d, [n]: { ...d[n], title: e.target.value } }))}
          />
          <textarea
            className="input mt-2 min-h-[80px]"
            placeholder="descrição da dinâmica"
            value={drafts[n].description}
            onChange={(e) => setDrafts((d) => ({ ...d, [n]: { ...d[n], description: e.target.value } }))}
          />
          <button className="btn-outline mt-3 w-full" onClick={() => save(n)}>Salvar</button>
        </div>
      ))}
    </div>
  );
}

function Metas({ employees, goals, allocations, month, empresaId, onChanged }) {
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [mode, setMode] = useState("equal");
  const [editingGoal, setEditingGoal] = useState(null);
  const [customVals, setCustomVals] = useState({});

  async function createGoal(e) {
    e.preventDefault();
    if (!name.trim() || !total) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { data: goal, error } = await supabase
      .from("sales_goals")
      .insert({ month, name: name.trim(), store_total: Number(total), distribution_mode: mode, created_by: session.user.id, empresa_id: empresaId })
      .select()
      .single();
    if (error || !goal) return;

    if (mode === "equal") {
      const activeEmps = employees.filter((e) => e.active);
      const amount = activeEmps.length ? Number(total) / activeEmps.length : 0;
      const rows = activeEmps.map((emp) => ({ goal_id: goal.id, employee_id: emp.id, amount, percentage: activeEmps.length ? 100 / activeEmps.length : 0, empresa_id: empresaId }));
      if (rows.length) await supabase.from("sales_goal_allocations").insert(rows);
      setName(""); setTotal("");
      onChanged();
    } else {
      setName(""); setTotal("");
      onChanged();
      setEditingGoal(goal.id);
      const initial = {};
      employees.filter((e) => e.active).forEach((emp) => { initial[emp.id] = ""; });
      setCustomVals(initial);
    }
  }

  async function saveCustom(goalId) {
    const rows = Object.entries(customVals)
      .filter(([, v]) => v !== "")
      .map(([employee_id, v]) => ({ goal_id: goalId, employee_id, amount: Number(v), empresa_id: empresaId }));
    if (rows.length) {
      await supabase.from("sales_goal_allocations").upsert(rows, { onConflict: "goal_id,employee_id" });
    }
    setEditingGoal(null);
    onChanged();
  }

  function openEditor(goal) {
    const existing = {};
    employees.filter((e) => e.active).forEach((emp) => {
      const a = allocations.find((al) => al.goal_id === goal.id && al.employee_id === emp.id);
      existing[emp.id] = a ? String(a.amount) : "";
    });
    setCustomVals(existing);
    setEditingGoal(goal.id);
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="label mb-3">➕ Nova meta — {monthLabel(month)}</p>
        <form onSubmit={createGoal} className="grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Nome</label>
            <input className="input" placeholder="Meta / Super Meta / Hiper Meta…" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Valor total da loja (R$)</label>
            <input type="number" step="0.01" className="input" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <div>
            <label className="label">Distribuição</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="equal">Igual para todos</option>
              <option value="custom">Percentual configurável</option>
            </select>
          </div>
          <div>
            <button className="btn w-full" type="submit">Criar meta</button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        {goals.map((g) => {
          const goalAllocs = allocations.filter((a) => a.goal_id === g.id);
          const sum = goalAllocs.reduce((s, a) => s + Number(a.amount), 0);
          return (
            <div key={g.id} className="card">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-sm text-navy">🎯 {g.name}</p>
                  <p className="text-xs text-muted">{formatBRL(g.store_total)} · {g.distribution_mode === "equal" ? "distribuição igual" : "distribuição custom"}</p>
                </div>
                {g.distribution_mode === "custom" && (
                  <button className="text-xs uppercase tracking-wider text-muted hover:text-navy" onClick={() => openEditor(g)}>
                    editar distribuição
                  </button>
                )}
              </div>

              {editingGoal === g.id ? (
                <div className="mt-4 space-y-2">
                  {employees.filter((e) => e.active).map((emp) => (
                    <div key={emp.id} className="flex items-center gap-3">
                      <span className="text-sm flex-1">{emp.full_name}</span>
                      <input
                        type="number"
                        step="0.01"
                        className="input w-40"
                        value={customVals[emp.id] ?? ""}
                        onChange={(e) => setCustomVals((c) => ({ ...c, [emp.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <button className="btn mt-2" onClick={() => saveCustom(g.id)}>Salvar distribuição</button>
                </div>
              ) : (
                <ul className="mt-3 text-sm divide-y divide-line">
                  {goalAllocs.map((a) => {
                    const emp = employees.find((e) => e.id === a.employee_id);
                    return (
                      <li key={a.id} className="flex justify-between py-1.5">
                        <span className="text-muted">{emp?.full_name || "—"}</span>
                        <span>{formatBRL(a.amount)}</span>
                      </li>
                    );
                  })}
                  {goalAllocs.length === 0 && <p className="text-xs text-muted py-1.5">Sem distribuição definida ainda.</p>}
                </ul>
              )}
              {goalAllocs.length > 0 && Math.abs(sum - Number(g.store_total)) > 0.5 && (
                <p className="text-xs text-warn mt-2">⚠️ Soma distribuída ({formatBRL(sum)}) diferente do total da meta.</p>
              )}
            </div>
          );
        })}
        {goals.length === 0 && <p className="text-sm text-muted">Nenhuma meta cadastrada este mês.</p>}
      </div>
    </div>
  );
}

function Lancamentos({ employees, entries, empresaId, onChanged }) {
  const [selected, setSelected] = useState(employees[0]?.id || "");
  const [date, setDate] = useState(todayStr());
  const [value, setValue] = useState("");
  const myEntries = entries.filter((e) => e.employee_id === selected).slice(0, 10);

  async function save(e) {
    e.preventDefault();
    if (!selected || value === "") return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("sales_entries").upsert(
      {
        employee_id: selected,
        entry_date: date,
        cumulative_amount: Number(value),
        edited_by_manager: true,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
        empresa_id: empresaId,
      },
      { onConflict: "employee_id,entry_date" }
    );
    setValue("");
    onChanged();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label">Colaborador</label>
        <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
        </select>
      </div>

      <div className="card">
        <p className="label mb-3">📝 Corrigir / lançar valor vendido</p>
        <form onSubmit={save} className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Valor acumulado no mês (R$)</label>
            <input type="number" step="0.01" className="input" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <button className="btn w-full" type="submit">Salvar</button>
          </div>
        </form>
      </div>

      <div className="card">
        <p className="label mb-3">Histórico</p>
        <ul className="divide-y divide-line text-sm">
          {myEntries.map((en) => (
            <li key={en.id} className="flex justify-between py-2">
              <span className="text-muted">{en.entry_date}{en.edited_by_manager ? " (corrigido)" : ""}</span>
              <span>{formatBRL(en.cumulative_amount)}</span>
            </li>
          ))}
          {myEntries.length === 0 && <p className="text-xs text-muted py-2">Nenhum lançamento ainda.</p>}
        </ul>
      </div>
    </div>
  );
}

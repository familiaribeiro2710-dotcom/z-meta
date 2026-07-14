"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Home,
  Target,
  Wallet,
  Trophy,
  Users,
  CheckSquare,
  AlertTriangle,
  Gamepad2,
  FileText,
  Plus,
  Settings,
  PartyPopper,
  Frown,
  CheckCircle2,
  ThumbsUp,
  Loader2,
  Split,
  Coins,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import ProgressBar from "./ProgressBar";
import { calcIndividualPct, calcTeamPct, formatBRL } from "./scoring";
import { todayStr, firstDayOfMonth, monthLabel, stageRangeLabel, yesterdayStr } from "./date";
import { CurrencyInput } from "./MaskedInputs";

// Mesmas abas (Início/Metas) usadas na página do colaborador — exportado pra quem
// renderiza <EmpresaDashboard> passar pro AppShell e manter o mesmo layout/posição de abas.
export const EMPRESA_TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "metas", label: "Metas", Icon: Wallet },
];

const ATIV_SUBS = [
  { key: "placar", label: "Placar", Icon: Trophy },
  { key: "colaboradores", label: "Colaboradores", Icon: Users },
  { key: "tarefas", label: "Tarefas", Icon: CheckSquare },
  { key: "advertencias", label: "Advertências", Icon: AlertTriangle },
  { key: "estagios", label: "Estágios", Icon: Gamepad2 },
];

const META_SUBS = [
  { key: "metas", label: "Metas do mês", Icon: Target },
  { key: "lancamentos", label: "Lançamentos", Icon: FileText },
];

// Painel completo de uma loja (Atividades + Metas), escopado por loja_id.
// Usado tanto pelo gerente (com a própria loja) quanto pelo Master Admin
// (escolhendo qualquer loja de qualquer empresa).
export default function EmpresaDashboard({ lojaId, empresaId, viewerRole = "master_admin", tab = "atividades" }) {
  const [loading, setLoading] = useState(true);
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
  const [commissionSettings, setCommissionSettings] = useState({ non_achievement_colaborador_pct: 0, non_achievement_gerente_pct: 0 });

  const today = todayStr();
  const month = firstDayOfMonth(today);

  const loadAll = useCallback(async () => {
    if (!lojaId) return;
    const { data: emps } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "colaborador")
      .eq("loja_id", lojaId)
      .order("full_name");
    setEmployees(emps || []);

    const { data: settingsRow } = await supabase
      .from("app_settings")
      .select("*")
      .eq("loja_id", lojaId)
      .single();
    if (settingsRow) setSettings(settingsRow);
    const penalty = settingsRow?.warning_penalty_points ?? 10;

    const { data: allTasks } = await supabase.from("tasks").select("*").eq("loja_id", lojaId).order("created_at");
    setTasks(allTasks || []);

    const { data: allWarnings } = await supabase
      .from("warnings")
      .select("*")
      .eq("loja_id", lojaId)
      .gte("warning_date", month)
      .order("warning_date", { ascending: false });
    setWarnings(allWarnings || []);

    const { data: stageRows } = await supabase
      .from("stage_dynamics")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("month", month)
      .order("stage_number");
    setStages(stageRows || []);

    const { data: goalRows } = await supabase
      .from("sales_goals")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("month", month)
      .order("store_total", { ascending: true });
    setGoals(goalRows || []);
    const { data: allocRows } = await supabase.from("sales_goal_allocations").select("*").eq("loja_id", lojaId);
    setAllocations(allocRows || []);
    const { data: entryRows } = await supabase
      .from("sales_entries")
      .select("*")
      .eq("loja_id", lojaId)
      .order("entry_date", { ascending: false });
    setEntries(entryRows || []);
    const { data: commissionRow } = await supabase
      .from("commission_settings")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("month", month)
      .maybeSingle();
    setCommissionSettings(commissionRow || { non_achievement_colaborador_pct: 0, non_achievement_gerente_pct: 0 });

    const nextMonth = new Date(month + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    const { data: completions } = await supabase
      .from("task_completions")
      .select("task_id, completed, completion_date, tasks!inner(employee_id, loja_id)")
      .eq("tasks.loja_id", lojaId)
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
  }, [lojaId, month]);

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
    return (
      <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2">
        <Loader2 size={16} className="animate-spin" /> carregando…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {tab === "atividades" && (
        <div className="space-y-6">
          <SubNav subs={ATIV_SUBS} active={atSub} onChange={setAtSub} />
          {atSub === "placar" && (
            <Placar
              scoreboard={scoreboard}
              teamPct={teamPct}
              settings={settings}
              month={month}
              viewerRole={viewerRole}
              onSaveSettings={async (vals) => {
                await supabase.from("app_settings").update(vals).eq("loja_id", lojaId);
                await refresh();
              }}
            />
          )}
          {atSub === "colaboradores" && (
            <Colaboradores employees={employees} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
          )}
          {atSub === "tarefas" && (
            <Tarefas employees={employees} tasks={tasks} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
          )}
          {atSub === "advertencias" && (
            <Advertencias employees={employees} warnings={warnings} settings={settings} today={today} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
          )}
          {atSub === "estagios" && (
            <Estagios stages={stages} month={month} today={today} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
          )}
        </div>
      )}

      {tab === "metas" && (
        <div className="space-y-6">
          <SubNav subs={META_SUBS} active={metaSub} onChange={setMetaSub} />
          {metaSub === "metas" && (
            <Metas
              employees={employees}
              goals={goals}
              allocations={allocations}
              commissionSettings={commissionSettings}
              month={month}
              empresaId={empresaId}
              lojaId={lojaId}
              onChanged={refresh}
              viewerRole={viewerRole}
            />
          )}
          {metaSub === "lancamentos" && (
            <Lancamentos employees={employees} entries={entries} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
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
          className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-full border-2 transition-all ${
            active === s.key ? "bg-teal text-white border-teal shadow-soft scale-105" : "border-line text-muted hover:border-teal hover:text-teal"
          }`}
        >
          <s.Icon size={14} /> {s.label}
        </button>
      ))}
    </div>
  );
}

function Placar({ scoreboard, teamPct, settings, month, viewerRole = "master_admin", onSaveSettings }) {
  const canEditPrize = viewerRole !== "gerente";
  const [penalty, setPenalty] = useState(settings.warning_penalty_points);
  const [threshold, setThreshold] = useState(settings.team_threshold_pct);
  const [prize, setPrize] = useState(settings.monthly_prize);

  const willRelease = teamPct >= Number(settings.team_threshold_pct);

  return (
    <div className="space-y-6">
      <div className="card animate-pop">
        <p className="label flex items-center gap-1.5"><Trophy size={14} /> Barra geral da equipe — {monthLabel(month)}</p>
        <ProgressBar pct={teamPct} threshold={settings.team_threshold_pct} />
        <p className={`text-sm mt-3 font-semibold flex items-center gap-1.5 ${willRelease ? "text-success" : "text-danger"}`}>
          {willRelease ? <PartyPopper size={16} /> : <Frown size={16} />}
          {willRelease
            ? `Se o mês fechasse hoje: prêmio de ${formatBRL(settings.monthly_prize)} liberado!`
            : `Se o mês fechasse hoje: prêmio zerado (abaixo de ${settings.team_threshold_pct}%).`}
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
                <td className="py-2.5 text-muted">
                  {b.warnings > 0 ? <span className="flex items-center gap-1"><AlertTriangle size={13} className="text-warn" /> {b.warnings}</span> : "—"}
                </td>
                <td className="py-2.5"><ProgressBar pct={b.pct} showLabel={false} height="h-2.5" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><Settings size={14} /> Configurações</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const vals = {
              warning_penalty_points: Number(penalty),
              team_threshold_pct: Number(threshold),
            };
            if (canEditPrize) vals.monthly_prize = Number(prize);
            await onSaveSettings(vals);
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
            {canEditPrize ? (
              <CurrencyInput value={prize} onChange={setPrize} />
            ) : (
              <p className="input !flex !items-center bg-line/40 text-muted">{formatBRL(settings.monthly_prize)} · definida pelo sócio/supervisor</p>
            )}
          </div>
          <div className="sm:col-span-3">
            <button className="btn" type="submit">Salvar configurações</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Colaboradores({ employees, empresaId, lojaId, onChanged }) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  async function handleCreate(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ fullName, password, empresaId, lojaId }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setMsg(`Colaborador criado! Usuário: ${json.username} · peça para trocar a senha no primeiro acesso.`);
    setFullName(""); setPassword("");
    onChanged();
  }

  async function toggleActive(emp) {
    await supabase.from("profiles").update({ active: !emp.active }).eq("id", emp.id);
    onChanged();
  }

  function startEdit(emp) {
    setEditingId(emp.id);
    setEditName(emp.full_name);
  }

  async function saveEdit(emp) {
    if (!editName.trim()) return;
    await supabase.from("profiles").update({ full_name: editName.trim() }).eq("id", emp.id);
    setEditingId(null);
    onChanged();
  }

  async function removeEmployee(emp) {
    if (!window.confirm(`Excluir ${emp.full_name} definitivamente? Essa ação não pode ser desfeita.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/delete-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ employeeId: emp.id }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert("Erro ao excluir: " + (json.error || "não foi possível excluir."));
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><Plus size={14} /> Novo colaborador</p>
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
        {msg && (
          <p className="text-xs text-muted mt-2 flex items-center gap-1.5">
            {msg.startsWith("Erro") ? <AlertTriangle size={13} className="text-danger" /> : <CheckCircle2 size={13} className="text-success" />}
            {msg}
          </p>
        )}
      </div>

      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><Users size={14} /> Equipe ({employees.length})</p>
        <ul className="divide-y divide-line">
          {employees.map((emp) => (
            <li key={emp.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              {editingId === emp.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input className="input !py-1.5 !text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <button onClick={() => saveEdit(emp)} className="text-xs uppercase tracking-wider font-bold text-success">salvar</button>
                  <button onClick={() => setEditingId(null)} className="text-xs uppercase tracking-wider text-muted">cancelar</button>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-navy">{emp.full_name}</p>
                  <p className="text-xs text-muted">usuário: {emp.username}</p>
                </div>
              )}
              {editingId !== emp.id && (
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(emp)} className="text-xs uppercase tracking-wider text-muted hover:text-purple font-medium">
                    editar
                  </button>
                  <button onClick={() => toggleActive(emp)} className={`text-xs uppercase tracking-wider font-medium ${emp.active ? "text-muted hover:text-navy" : "text-danger"}`}>
                    {emp.active ? "desativar" : "ativar"}
                  </button>
                  <button onClick={() => removeEmployee(emp)} className="text-xs uppercase tracking-wider font-medium text-danger hover:text-red-700">
                    excluir
                  </button>
                </div>
              )}
            </li>
          ))}
          {employees.length === 0 && <p className="text-sm text-muted py-2">Nenhum colaborador cadastrado ainda.</p>}
        </ul>
      </div>
    </div>
  );
}

function Tarefas({ employees, tasks, empresaId, lojaId, onChanged }) {
  const [selected, setSelected] = useState(employees[0]?.id || "");
  const [title, setTitle] = useState("");
  const myTasks = tasks.filter((t) => t.employee_id === selected);

  async function addTask(e) {
    e.preventDefault();
    if (!selected || !title.trim()) return;
    await supabase.from("tasks").insert({ employee_id: selected, title: title.trim(), empresa_id: empresaId, loja_id: lojaId });
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
        <p className="label mb-3 flex items-center gap-1.5"><CheckSquare size={14} /> Tarefas diárias</p>
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

function Advertencias({ employees, warnings, settings, today, empresaId, lojaId, onChanged }) {
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
      loja_id: lojaId,
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
        <p className="label mb-3 flex items-center gap-1.5"><AlertTriangle size={14} /> Registrar advertência</p>
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
          {myWarnings.length === 0 && (
            <p className="text-sm text-muted py-2 flex items-center gap-1.5"><ThumbsUp size={14} className="text-success" /> Nenhuma advertência este mês.</p>
          )}
        </ul>
      </div>
    </div>
  );
}

function Estagios({ stages, month, today, empresaId, lojaId, onChanged }) {
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
      { month, stage_number: n, title: drafts[n].title, description: drafts[n].description, empresa_id: empresaId, loja_id: lojaId },
      { onConflict: "loja_id,month,stage_number" }
    );
    onChanged();
  }

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      {[1, 2, 3].map((n) => (
        <div key={n} className="card">
          <p className="label flex items-center gap-1.5"><Gamepad2 size={14} /> Estágio {n} · {stageRangeLabel(n, today)}</p>
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

function Metas({ employees, goals, allocations, commissionSettings, month, empresaId, lojaId, onChanged, viewerRole = "master_admin" }) {
  // Só sócio/supervisor/master_admin criam meta, distribuem entre colaboradores e definem comissão.
  // Gerente só visualiza.
  const canManage = viewerRole !== "gerente";

  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [commColab, setCommColab] = useState("");
  const [commGerente, setCommGerente] = useState("");

  const [editingGoal, setEditingGoal] = useState(null);
  const [distMode, setDistMode] = useState("equal");
  const [customVals, setCustomVals] = useState({});

  const [naoAtingColab, setNaoAtingColab] = useState(commissionSettings.non_achievement_colaborador_pct ?? 0);
  const [naoAtingGerente, setNaoAtingGerente] = useState(commissionSettings.non_achievement_gerente_pct ?? 0);
  const [savingNaoAting, setSavingNaoAting] = useState(false);

  async function createGoal(e) {
    e.preventDefault();
    if (!name.trim() || !total) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("sales_goals").insert({
      month,
      name: name.trim(),
      store_total: Number(total),
      commission_pct_colaborador: Number(commColab) || 0,
      commission_pct_gerente: Number(commGerente) || 0,
      created_by: session.user.id,
      empresa_id: empresaId,
      loja_id: lojaId,
    });
    setName(""); setTotal(""); setCommColab(""); setCommGerente("");
    onChanged();
  }

  async function saveNaoAtingimento(e) {
    e.preventDefault();
    setSavingNaoAting(true);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("commission_settings").upsert(
      {
        month,
        loja_id: lojaId,
        empresa_id: empresaId,
        non_achievement_colaborador_pct: Number(naoAtingColab) || 0,
        non_achievement_gerente_pct: Number(naoAtingGerente) || 0,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "loja_id,month" }
    );
    setSavingNaoAting(false);
    onChanged();
  }

  function openEditor(goal, goalAllocs) {
    const existing = {};
    employees.filter((e) => e.active).forEach((emp) => {
      const a = goalAllocs.find((al) => al.employee_id === emp.id);
      existing[emp.id] = a ? String(a.amount) : "";
    });
    setCustomVals(existing);
    setDistMode(goalAllocs.length ? "custom" : "equal");
    setEditingGoal(goal.id);
  }

  async function applyEqual(goal) {
    const activeEmps = employees.filter((e) => e.active);
    if (!activeEmps.length) return;
    const amount = Number(goal.store_total) / activeEmps.length;
    const rows = activeEmps.map((emp) => ({
      goal_id: goal.id,
      employee_id: emp.id,
      amount,
      percentage: 100 / activeEmps.length,
      empresa_id: empresaId,
      loja_id: lojaId,
    }));
    await supabase.from("sales_goal_allocations").upsert(rows, { onConflict: "goal_id,employee_id" });
    setEditingGoal(null);
    onChanged();
  }

  async function saveCustom(goalId) {
    const rows = Object.entries(customVals)
      .filter(([, v]) => v !== "")
      .map(([employee_id, v]) => ({
        goal_id: goalId,
        employee_id,
        amount: Number(v),
        empresa_id: empresaId,
        loja_id: lojaId,
      }));
    if (rows.length) {
      await supabase.from("sales_goal_allocations").upsert(rows, { onConflict: "goal_id,employee_id" });
    }
    setEditingGoal(null);
    onChanged();
  }

  function isEvenSplit(goalAllocs) {
    if (goalAllocs.length < 2) return true;
    const amounts = goalAllocs.map((a) => Number(a.amount));
    return Math.max(...amounts) - Math.min(...amounts) < 0.01;
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><Coins size={14} /> Comissão por não atingimento de meta — {monthLabel(month)}</p>
        <p className="text-xs text-muted mb-3">Taxa aplicada enquanto ninguém bateu a 1ª meta ainda. A partir daí, a comissão passa a usar a taxa da meta atingida (abaixo, em cada meta).</p>
        {canManage ? (
          <form onSubmit={saveNaoAtingimento} className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="label">% comissão colaborador</label>
              <input type="number" step="0.1" min="0" className="input" value={naoAtingColab} onChange={(e) => setNaoAtingColab(e.target.value)} />
            </div>
            <div>
              <label className="label">% comissão gerente</label>
              <input type="number" step="0.1" min="0" className="input" value={naoAtingGerente} onChange={(e) => setNaoAtingGerente(e.target.value)} />
            </div>
            <div>
              <button className="btn w-full" type="submit" disabled={savingNaoAting}>{savingNaoAting ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        ) : null}

        <ul className="mt-3 text-sm divide-y divide-line">
          <li className="flex justify-between py-1.5">
            <span className="text-muted">Não atingimento</span>
            <span>{Number(commissionSettings.non_achievement_colaborador_pct) || 0}% colaborador · {Number(commissionSettings.non_achievement_gerente_pct) || 0}% gerente</span>
          </li>
          {goals.map((g, idx) => (
            <li key={g.id} className="flex justify-between py-1.5">
              <span className="text-muted">Meta {idx + 1} — {g.name}</span>
              <span>{Number(g.commission_pct_colaborador) || 0}% colaborador · {Number(g.commission_pct_gerente) || 0}% gerente</span>
            </li>
          ))}
        </ul>
      </div>

      {canManage ? (
        <div className="card">
          <p className="label mb-3 flex items-center gap-1.5"><Plus size={14} /> Nova meta — {monthLabel(month)}</p>
          <form onSubmit={createGoal} className="grid sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="label">Nome</label>
              <input className="input" placeholder="Meta / Super Meta / Hiper Meta…" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Valor total da loja (R$)</label>
              <CurrencyInput value={total} onChange={setTotal} />
            </div>
            <div>
              <label className="label">% comissão colaborador</label>
              <input type="number" step="0.1" min="0" className="input" placeholder="0" value={commColab} onChange={(e) => setCommColab(e.target.value)} />
            </div>
            <div>
              <label className="label">% comissão gerente</label>
              <input type="number" step="0.1" min="0" className="input" placeholder="0" value={commGerente} onChange={(e) => setCommGerente(e.target.value)} />
            </div>
            <div>
              <button className="btn w-full" type="submit">Criar meta</button>
            </div>
          </form>
          <p className="text-[11px] text-muted mt-2">As metas do mês são ordenadas por valor: quem passa do valor de uma meta, passa a comissionar na taxa dela — assim sucessivamente.</p>
        </div>
      ) : null}

      <div className="space-y-4">
        {goals.map((g, idx) => {
          const goalAllocs = allocations.filter((a) => a.goal_id === g.id);
          const sum = goalAllocs.reduce((s, a) => s + Number(a.amount), 0);
          const isEditing = editingGoal === g.id;
          return (
            <div key={g.id} className="card">
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div>
                  <p className="font-semibold text-sm text-navy flex items-center gap-1.5"><Target size={14} className="text-purple" /> {g.name} <span className="badge bg-line text-muted">Meta {idx + 1}</span></p>
                  <p className="text-xs text-muted">
                    {formatBRL(g.store_total)} · {Number(g.commission_pct_colaborador) || 0}% comissão colaborador · {Number(g.commission_pct_gerente) || 0}% comissão gerente
                    {goalAllocs.length > 0 && ` · ${isEvenSplit(goalAllocs) ? "distribuição igual" : "distribuição custom"}`}
                  </p>
                </div>
                {canManage && !isEditing && (
                  <button className="text-xs uppercase tracking-wider text-muted hover:text-navy flex items-center gap-1" onClick={() => openEditor(g, goalAllocs)}>
                    <Split size={12} /> {goalAllocs.length === 0 ? "definir distribuição" : "editar distribuição"}
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDistMode("equal")}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 ${distMode === "equal" ? "border-purple text-purple" : "border-line text-muted"}`}
                    >
                      Igual para todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setDistMode("custom")}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 ${distMode === "custom" ? "border-purple text-purple" : "border-line text-muted"}`}
                    >
                      Percentual configurável
                    </button>
                  </div>

                  {distMode === "equal" ? (
                    <div>
                      <p className="text-xs text-muted">
                        {employees.filter((e) => e.active).length} colaborador(es) ativo(s) · {formatBRL(employees.filter((e) => e.active).length ? Number(g.store_total) / employees.filter((e) => e.active).length : 0)} cada.
                      </p>
                      <button className="btn mt-3" onClick={() => applyEqual(g)}>Distribuir igualmente</button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {employees.filter((e) => e.active).map((emp) => (
                        <div key={emp.id} className="flex items-center gap-3">
                          <span className="text-sm flex-1">{emp.full_name}</span>
                          <div className="w-36">
                            <CurrencyInput
                              value={customVals[emp.id] ?? ""}
                              onChange={(v) => setCustomVals((c) => ({ ...c, [emp.id]: v }))}
                            />
                          </div>
                        </div>
                      ))}
                      <button className="btn mt-2" onClick={() => saveCustom(g.id)}>Salvar distribuição</button>
                    </div>
                  )}
                  <button className="text-xs uppercase tracking-wider text-muted hover:text-navy" onClick={() => setEditingGoal(null)}>cancelar</button>
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
                <p className="text-xs text-warn mt-2 flex items-center gap-1.5"><AlertTriangle size={13} /> Soma distribuída ({formatBRL(sum)}) diferente do total da meta.</p>
              )}
            </div>
          );
        })}
        {goals.length === 0 && <p className="text-sm text-muted">Nenhuma meta cadastrada este mês.</p>}
      </div>
    </div>
  );
}

function Lancamentos({ employees, entries, empresaId, lojaId, onChanged }) {
  const [selected, setSelected] = useState(employees[0]?.id || "");
  const [date, setDate] = useState(yesterdayStr(todayStr()));
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
        daily_amount: Number(value),
        edited_by_manager: true,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
        empresa_id: empresaId,
        loja_id: lojaId,
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
        <p className="label mb-3 flex items-center gap-1.5"><FileText size={14} /> Corrigir / lançar valor vendido no dia</p>
        <form onSubmit={save} className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Valor vendido nesse dia (R$)</label>
            <CurrencyInput value={value} onChange={setValue} />
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
              <span>{formatBRL(en.daily_amount)}</span>
            </li>
          ))}
          {myEntries.length === 0 && <p className="text-xs text-muted py-2">Nenhum lançamento ainda.</p>}
        </ul>
      </div>
    </div>
  );
}

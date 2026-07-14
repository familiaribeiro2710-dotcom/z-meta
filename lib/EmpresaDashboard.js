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
  Gift,
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
  Check,
  X,
  Eye,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Trash2,
  Pencil,
  KeyRound,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import ProgressBar from "./ProgressBar";
import DateNav from "./DateNav";
import { calcIndividualPct, calcTeamPct, formatBRL, currentGoalTarget } from "./scoring";
import { todayStr, firstDayOfMonth, monthLabel, yesterdayStr, isTaskDueOn, WEEKDAY_LABELS } from "./date";
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
  { key: "premiacoes", label: "Premiações", Icon: Gift },
];

const META_SUBS = [
  { key: "metas", label: "Metas do mês", Icon: Target },
  { key: "lancamentos", label: "Lançamentos", Icon: FileText },
];

// Painel completo de uma loja (Atividades + Metas), escopado por loja_id.
// Usado tanto pelo gerente (com a própria loja) quanto pelo Master Admin
// (escolhendo qualquer loja de qualquer empresa).
export default function EmpresaDashboard({ lojaId, empresaId, viewerRole = "master_admin", viewerId, tab = "atividades", month: monthProp, onOpenEmployee, onOpenGerente }) {
  const [loading, setLoading] = useState(true);
  const [atSub, setAtSub] = useState("placar");
  const [metaSub, setMetaSub] = useState("metas");

  const [employees, setEmployees] = useState([]);
  const [gerentes, setGerentes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState({ warning_penalty_points: 10, team_threshold_pct: 95, monthly_prize: 1000 });
  const [prizes, setPrizes] = useState([]);
  const [scoreboard, setScoreboard] = useState([]);
  const [teamPct, setTeamPct] = useState(0);

  const [goals, setGoals] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [entries, setEntries] = useState([]);
  const [commissionSettings, setCommissionSettings] = useState({ non_achievement_colaborador_pct: 0, non_achievement_gerente_pct: 0 });

  const today = todayStr();
  const month = monthProp || firstDayOfMonth(today);

  const loadAll = useCallback(async () => {
    if (!lojaId) return;
    const nextMonth = new Date(month + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    let empsQuery = supabase
      .from("profiles")
      .select("*")
      .eq("role", "colaborador")
      .eq("loja_id", lojaId)
      .order("full_name");
    // gerente só vê/gerencia a própria equipe — não a loja inteira (pode ter outros gerentes com outras equipes)
    if (viewerRole === "gerente" && viewerId) empsQuery = empsQuery.eq("gerente_id", viewerId);
    const { data: emps } = await empsQuery;
    setEmployees(emps || []);

    // gerentes da loja — só relevante pra quem gerencia mais de uma equipe (supervisor/sócio/master admin)
    if (viewerRole !== "gerente") {
      const { data: gers } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "gerente")
        .eq("loja_id", lojaId)
        .order("full_name");
      setGerentes(gers || []);
    } else {
      setGerentes([]);
    }

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
      .lt("warning_date", nextMonthStr)
      .order("warning_date", { ascending: false });
    setWarnings(allWarnings || []);

    const { data: prizeRows } = await supabase
      .from("employee_prizes")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("month", month);
    setPrizes(prizeRows || []);

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

    const { data: completions } = await supabase
      .from("task_completions")
      .select("task_id, completed, completion_date, tasks!inner(employee_id, loja_id)")
      .eq("tasks.loja_id", lojaId)
      .gte("completion_date", month)
      .lt("completion_date", nextMonthStr);

    const soldThisMonth = (entryRows || []).filter((e) => e.entry_date >= month && e.entry_date < nextMonthStr);

    // placar/ranking só considera colaboradores ativos — a aba Colaboradores continua listando
    // todo mundo (inclusive inativos, pra dar pra reativar), mas não faz sentido um colaborador
    // desligado aparecer na barra da equipe ou no placar individual.
    const board = (emps || []).filter((emp) => emp.active).map((emp) => {
      const rows = (completions || []).filter((c) => c.tasks.employee_id === emp.id);
      const expected = rows.length;
      const completed = rows.filter((r) => r.completed).length;
      const wCount = (allWarnings || []).filter((w) => w.employee_id === emp.id).length;
      const pct = calcIndividualPct({ completed, expected, warningsCount: wCount, penaltyPerWarning: penalty });
      const sold = soldThisMonth.filter((e) => e.employee_id === emp.id).reduce((s, e) => s + Number(e.daily_amount || 0), 0);
      return { employee: emp, expected, completed, warnings: wCount, pct, sold };
    });
    setScoreboard(board);
    setTeamPct(calcTeamPct(board.map((b) => b.pct)));
  }, [lojaId, month, viewerRole, viewerId]);

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

  // Quando um colaborador é criado/ativado/desativado/excluído, as metas do mês que estão em
  // distribuição "igual" precisam recalcular automaticamente o valor de cada um (metas em
  // distribuição "custom" foram definidas manualmente pelo supervisor e não são mexidas).
  async function recalcEqualGoalAllocations() {
    // Sempre recalcula o mês real atual (nunca um mês passado que esteja sendo só visualizado
    // pelo seletor de mês) — metas de meses fechados não devem ser mexidas retroativamente.
    const currentMonth = firstDayOfMonth(todayStr());

    const { data: activeRows } = await supabase
      .from("profiles")
      .select("id")
      .eq("loja_id", lojaId)
      .eq("role", "colaborador")
      .eq("active", true);
    const activeEmps = activeRows || [];

    const { data: monthGoals } = await supabase
      .from("sales_goals")
      .select("id, store_total")
      .eq("loja_id", lojaId)
      .eq("month", currentMonth);

    for (const goal of monthGoals || []) {
      const { data: goalAllocs } = await supabase
        .from("sales_goal_allocations")
        .select("*")
        .eq("goal_id", goal.id);
      const allocs = goalAllocs || [];
      if (!allocs.length) continue; // meta ainda sem distribuição definida — nada a recalcular

      const amounts = allocs.map((a) => Number(a.amount));
      const isEven = allocs.length < 2 || Math.max(...amounts) - Math.min(...amounts) < 0.01;
      if (!isEven) continue; // distribuição custom — o supervisor definiu manualmente, não mexe

      const staleIds = allocs.filter((a) => !activeEmps.some((e) => e.id === a.employee_id)).map((a) => a.id);
      if (staleIds.length) {
        await supabase.from("sales_goal_allocations").delete().in("id", staleIds);
      }
      if (!activeEmps.length) continue;

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
    }
  }

  async function refreshTeam() {
    await recalcEqualGoalAllocations();
    await loadAll();
  }

  if (loading) {
    return (
      <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2">
        <Loader2 size={16} className="animate-spin" /> carregando…
      </p>
    );
  }

  // vendido/meta da loja toda no mês — usado pela barra de vendas do supervisor (Placar).
  // Metas são níveis (Meta, Super Meta, Hiper Meta…) — não somam. O alvo "em jogo" é sempre o
  // próximo nível ainda não batido; se todos já foram batidos, fica valendo o último deles.
  const storeSoldTotal = scoreboard.reduce((s, b) => s + Number(b.sold || 0), 0);
  const storeMetaTotal = currentGoalTarget(goals.map((g) => g.store_total), storeSoldTotal);

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
              goals={goals}
              storeMetaTotal={storeMetaTotal}
              storeSoldTotal={storeSoldTotal}
              viewerRole={viewerRole}
              onSaveSettings={async (vals) => {
                await supabase.from("app_settings").update(vals).eq("loja_id", lojaId);
                await refresh();
              }}
            />
          )}
          {atSub === "colaboradores" && (
            <Colaboradores
              employees={employees}
              gerentes={gerentes}
              viewerRole={viewerRole}
              empresaId={empresaId}
              lojaId={lojaId}
              onChanged={refreshTeam}
              onOpenEmployee={onOpenEmployee}
              onOpenGerente={onOpenGerente}
            />
          )}
          {atSub === "tarefas" && (
            <Tarefas employees={employees} gerentes={gerentes} viewerRole={viewerRole} tasks={tasks} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
          )}
          {atSub === "advertencias" && (
            <Advertencias employees={employees} gerentes={gerentes} viewerRole={viewerRole} warnings={warnings} settings={settings} today={today} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
          )}
          {atSub === "premiacoes" && (
            <Premiacoes employees={employees} gerentes={gerentes} viewerRole={viewerRole} prizes={prizes} month={month} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
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
              settings={settings}
              month={month}
              empresaId={empresaId}
              lojaId={lojaId}
              onChanged={refresh}
              viewerRole={viewerRole}
            />
          )}
          {metaSub === "lancamentos" && (
            <Lancamentos employees={employees} entries={entries} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} viewerRole={viewerRole} />
          )}
        </div>
      )}
    </div>
  );
}

function SubNav({ subs, active, onChange }) {
  return (
    <div className="flex gap-1 sm:gap-2">
      {subs.map((s) => (
        <button
          key={s.key}
          onClick={() => onChange(s.key)}
          className={`flex-1 sm:flex-none min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-[9px] sm:text-xs font-bold px-1 sm:px-3.5 py-1.5 sm:py-2 rounded-xl sm:rounded-full border-2 transition-all ${
            active === s.key ? "bg-teal text-white border-teal shadow-soft sm:scale-105" : "border-line text-muted hover:border-teal hover:text-teal"
          }`}
        >
          <s.Icon size={15} className="shrink-0" />
          <span className="truncate max-w-full leading-tight">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function Placar({ scoreboard, teamPct, settings, month, viewerRole = "master_admin", goals = [], storeMetaTotal = 0, storeSoldTotal = 0, onSaveSettings }) {
  const canEditPrize = viewerRole !== "gerente" && viewerRole !== "leitor";
  const canEditSettings = viewerRole !== "leitor";
  const isSupervisorView = viewerRole === "supervisor" || viewerRole === "socio";
  const [penalty, setPenalty] = useState(settings.warning_penalty_points);
  const [threshold, setThreshold] = useState(settings.team_threshold_pct);
  const [prize, setPrize] = useState(settings.monthly_prize);

  const willRelease = teamPct >= Number(settings.team_threshold_pct);
  const salesPct = storeMetaTotal > 0 ? Math.min(100, (storeSoldTotal / storeMetaTotal) * 100) : 0;
  const activeGoalId = goals.find((g) => storeSoldTotal < Number(g.store_total))?.id ?? goals[goals.length - 1]?.id;

  // ranqueado do maior pro menor valor vendido no mês
  const ranked = [...scoreboard].sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0));
  const leader = ranked.find((b) => Number(b.sold || 0) > 0);

  return (
    <div className="space-y-6">
      {isSupervisorView ? (
        <div className="card animate-pop">
          <p className="label flex items-center gap-1.5"><Trophy size={14} /> Barra de vendas — {monthLabel(month)}</p>
          <ProgressBar pct={salesPct} />
          <p className="text-xs text-muted mt-2">{formatBRL(storeSoldTotal)} vendido de {formatBRL(storeMetaTotal)} de meta.</p>
        </div>
      ) : (
        <div className="card animate-pop">
          <p className="label flex items-center gap-1.5"><Trophy size={14} /> Barra geral da equipe — {monthLabel(month)}</p>
          <ProgressBar pct={teamPct} threshold={settings.team_threshold_pct} />
          <p className={`text-sm mt-3 font-semibold flex items-center gap-1.5 ${willRelease ? "text-success" : "text-danger"}`}>
            {willRelease ? <PartyPopper size={16} /> : <Frown size={16} />}
            {willRelease
              ? `Se o mês fechasse hoje: premiação liberada!`
              : `Se o mês fechasse hoje: premiação zerada (abaixo de ${settings.team_threshold_pct}%).`}
          </p>
        </div>
      )}

      {viewerRole === "gerente" && goals.length > 0 && (
        <div className="card animate-pop border-teal/20">
          <p className="label mb-3 flex items-center gap-1.5"><Target size={14} /> Metas da loja — {monthLabel(month)}</p>
          <p className="text-[11px] text-muted mb-2">Vale a meta real até ela ser batida, depois passa a valer a próxima, e assim sucessivamente.</p>
          <ul className="divide-y divide-line">
            {goals.map((g) => {
              const target = Number(g.store_total);
              const goalPct = target > 0 ? Math.min(100, (storeSoldTotal / target) * 100) : 0;
              return (
                <li key={g.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                    <span className="font-medium text-navy flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{g.name}</span>
                      {activeGoalId === g.id && <span className="badge bg-purple/15 text-purple shrink-0">em jogo</span>}
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

      {/* redundante pra quem já tem o dashboard "Ranking de vendas" no Início (gerente, supervisor,
          sócio) — só o master admin (que não passa por HierarchyHome/GerenteView) ainda precisa
          desse resumo aqui. */}
      {viewerRole === "master_admin" && leader && (
        <div className="card animate-pop border-orange/25">
          <p className="label mb-2 flex items-center gap-1.5"><Trophy size={14} className="text-orange" /> Líder de vendas até agora — {monthLabel(month)}</p>
          <p className="text-lg font-extrabold text-navy">{leader.employee.full_name}</p>
          <p className="text-sm text-muted">{formatBRL(leader.sold)} vendido no mês</p>
        </div>
      )}

      {!isSupervisorView && (
      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><Settings size={14} /> Configurações</p>
        {canEditSettings ? (
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
                <p className="input !flex !items-center bg-line/40 text-muted">{formatBRL(settings.monthly_prize)}</p>
              )}
            </div>
            <div className="sm:col-span-3">
              <button className="btn" type="submit">Salvar configurações</button>
            </div>
          </form>
        ) : (
          // viewerRole "leitor" (acesso só de visualização) — sem formulário, só os valores atuais
          <ul className="text-xs sm:text-sm divide-y divide-line">
            <li className="flex justify-between py-1.5"><span className="text-muted">Desconto por advertência</span><span>{Number(settings.warning_penalty_points) || 0}%</span></li>
            <li className="flex justify-between py-1.5"><span className="text-muted">Meta da barra geral</span><span>{Number(settings.team_threshold_pct) || 0}%</span></li>
            <li className="flex justify-between py-1.5"><span className="text-muted">Premiação mensal</span><span>{formatBRL(settings.monthly_prize)}</span></li>
          </ul>
        )}
      </div>
      )}
    </div>
  );
}

function Colaboradores({ employees, gerentes = [], viewerRole = "master_admin", empresaId, lojaId, onChanged, onOpenEmployee, onOpenGerente }) {
  const canManageTeams = viewerRole !== "gerente" && viewerRole !== "leitor"; // só supervisor/sócio/master admin escolhem loja/gerente e cadastram gerentes
  const canEdit = viewerRole !== "leitor"; // "leitor" (acesso só de visualização) não cria/edita/desativa/exclui ninguém
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [gerenteId, setGerenteId] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editGerenteId, setEditGerenteId] = useState("");
  const [editMsg, setEditMsg] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [editingGerenteId, setEditingGerenteId] = useState(null);
  const [editGerenteName, setEditGerenteName] = useState("");
  const [editGerenteUsername, setEditGerenteUsername] = useState("");
  const [editGerenteMsg, setEditGerenteMsg] = useState("");
  const [savingGerenteEdit, setSavingGerenteEdit] = useState(false);

  // cadastro de gerente (só supervisor/sócio/master admin)
  const [gName, setGName] = useState("");
  const [gUsername, setGUsername] = useState("");
  const [gPassword, setGPassword] = useState("");
  const [gTeam, setGTeam] = useState([]);
  const [gTeamOpen, setGTeamOpen] = useState(false);
  const [gMsg, setGMsg] = useState("");
  const [gLoading, setGLoading] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ fullName, username: username.trim() || undefined, gerenteId: gerenteId || undefined, empresaId, lojaId }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setMsg(`Colaborador criado! Usuário: ${json.username} · senha padrão: ${json.defaultPassword} (o colaborador troca no primeiro acesso).`);
    setFullName(""); setUsername(""); setGerenteId("");
    onChanged();
  }

  async function handleCreateGerente(e) {
    e.preventDefault();
    setGLoading(true);
    setGMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-gerente", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ empresaId, lojaId, gerenteName: gName, username: gUsername.trim() || undefined, password: gPassword, teamEmployeeIds: gTeam }),
    });
    const json = await res.json();
    setGLoading(false);
    if (!res.ok) {
      setGMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setGMsg(`Gerente criado! Usuário: ${json.username}`);
    setGName(""); setGUsername(""); setGPassword(""); setGTeam([]); setGTeamOpen(false);
    onChanged();
  }

  async function toggleActive(emp) {
    await supabase.from("profiles").update({ active: !emp.active }).eq("id", emp.id);
    onChanged();
  }

  function startEdit(emp) {
    setEditingId(emp.id);
    setEditName(emp.full_name);
    setEditUsername(emp.username || "");
    setEditGerenteId(emp.gerente_id || "");
    setEditMsg("");
  }

  async function saveEdit(emp) {
    if (!editName.trim() || !editUsername.trim()) return;
    setSavingEdit(true);
    setEditMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const payload = { employeeId: emp.id, fullName: editName.trim() };
    if (editUsername.trim() !== emp.username) payload.newUsername = editUsername.trim();
    if (canManageTeams && editGerenteId !== (emp.gerente_id || "")) payload.newGerenteId = editGerenteId || null;
    const res = await fetch("/api/admin/update-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSavingEdit(false);
    if (!res.ok) {
      setEditMsg("Erro: " + (json.error || "não foi possível salvar."));
      return;
    }
    setEditingId(null);
    onChanged();
  }

  async function resetPassword(user) {
    if (!window.confirm(`Redefinir a senha de ${user.full_name} para 123456789?`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/update-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ employeeId: user.id, resetPassword: true }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert("Erro ao redefinir senha: " + (json.error || "não foi possível redefinir."));
      return;
    }
    alert(`Senha de ${user.full_name} redefinida para 123456789 — a pessoa deve trocar no próximo acesso.`);
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

  function gerenteName(id) {
    return gerentes.find((g) => g.id === id)?.full_name || "sem equipe";
  }

  function startEditGerente(g) {
    setEditingGerenteId(g.id);
    setEditGerenteName(g.full_name);
    setEditGerenteUsername(g.username || "");
    setEditGerenteMsg("");
  }

  async function saveEditGerente(g) {
    if (!editGerenteName.trim() || !editGerenteUsername.trim()) return;
    setSavingGerenteEdit(true);
    setEditGerenteMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const payload = { employeeId: g.id, fullName: editGerenteName.trim() };
    if (editGerenteUsername.trim() !== g.username) payload.newUsername = editGerenteUsername.trim();
    const res = await fetch("/api/admin/update-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSavingGerenteEdit(false);
    if (!res.ok) {
      setEditGerenteMsg("Erro: " + (json.error || "não foi possível salvar."));
      return;
    }
    setEditingGerenteId(null);
    onChanged();
  }

  return (
    <div className="space-y-6">
      {canManageTeams && (
        <div className="card">
          <p className="label mb-3 flex items-center gap-1.5"><ShieldCheck size={14} /> Novo gerente</p>
          <form onSubmit={handleCreateGerente} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nome completo</label>
              <input className="input" value={gName} onChange={(e) => setGName(e.target.value)} maxLength={18} required />
            </div>
            <div>
              <label className="label">Usuário (id de login)</label>
              <input className="input" placeholder="gerado automaticamente se vazio" value={gUsername} onChange={(e) => setGUsername(e.target.value)} maxLength={20} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Senha temporária</label>
              <input className="input" type="text" value={gPassword} onChange={(e) => setGPassword(e.target.value)} required />
            </div>
            {employees.length > 0 && (
              <div className="sm:col-span-2">
                <label className="label">Definir liderados</label>
                <button
                  type="button"
                  onClick={() => setGTeamOpen((v) => !v)}
                  className="input !flex !items-center !justify-between text-left text-sm text-navy"
                >
                  <span>{gTeam.length > 0 ? `${gTeam.length} colaborador(es) selecionado(s)` : "Nenhum colaborador selecionado"}</span>
                  {gTeamOpen ? <ChevronUp size={15} className="text-muted shrink-0" /> : <ChevronDown size={15} className="text-muted shrink-0" />}
                </button>
                {gTeamOpen && (
                  <div className="mt-2 border-2 border-line rounded-2xl divide-y divide-line max-h-56 overflow-y-auto">
                    {employees.map((emp) => (
                      <label key={emp.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-paper transition-colors ${gTeam.includes(emp.id) ? "text-purple font-medium" : "text-navy"}`}>
                        <input
                          type="checkbox"
                          checked={gTeam.includes(emp.id)}
                          onChange={(e) => setGTeam((t) => (e.target.checked ? [...t, emp.id] : t.filter((id) => id !== emp.id)))}
                        />
                        {emp.full_name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="sm:col-span-2">
              <button className="btn" type="submit" disabled={gLoading}>{gLoading ? "Criando…" : "Criar gerente"}</button>
            </div>
          </form>
          {gMsg && (
            <p className="text-xs text-muted mt-2 flex items-center gap-1.5">
              {gMsg.startsWith("Erro") ? <AlertTriangle size={13} className="text-danger" /> : <CheckCircle2 size={13} className="text-success" />}
              {gMsg}
            </p>
          )}
        </div>
      )}

      {canManageTeams && (
        <div className="card">
          <p className="label mb-3 flex items-center gap-1.5"><ShieldCheck size={14} /> Gerentes ({gerentes.length})</p>
          <ul className="divide-y divide-line">
            {gerentes.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2.5 text-sm flex-wrap">
                {editingGerenteId === g.id ? (
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <input className="input !py-1.5 !text-sm w-40" value={editGerenteName} onChange={(e) => setEditGerenteName(e.target.value)} placeholder="Nome completo" maxLength={18} autoFocus />
                    <input className="input !py-1.5 !text-sm w-32" value={editGerenteUsername} onChange={(e) => setEditGerenteUsername(e.target.value)} placeholder="Usuário" maxLength={20} />
                    <button onClick={() => saveEditGerente(g)} disabled={savingGerenteEdit} className="text-xs uppercase tracking-wider font-bold text-success">{savingGerenteEdit ? "salvando…" : "salvar"}</button>
                    <button onClick={() => { setEditingGerenteId(null); setEditGerenteMsg(""); }} className="text-xs uppercase tracking-wider text-muted">cancelar</button>
                    {editGerenteMsg && <p className="text-[11px] text-danger w-full">{editGerenteMsg}</p>}
                  </div>
                ) : onOpenGerente ? (
                  <button type="button" onClick={() => onOpenGerente(g)} className="text-left hover:opacity-75 transition-opacity" title="Ver como este gerente">
                    <p className="font-medium text-navy flex items-center gap-1.5">{g.full_name} <Eye size={12} className="text-muted" /></p>
                    <p className="text-xs text-muted">usuário: {g.username} · {employees.filter((e) => e.gerente_id === g.id).length} colaborador(es){!g.active ? " · inativo" : ""}</p>
                  </button>
                ) : (
                  <div>
                    <p className="font-medium text-navy">{g.full_name}</p>
                    <p className="text-xs text-muted">usuário: {g.username}{!g.active ? " · inativo" : ""}</p>
                  </div>
                )}
                {editingGerenteId !== g.id && (
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => startEditGerente(g)} className="text-xs uppercase tracking-wider text-muted hover:text-purple font-medium">
                      editar
                    </button>
                    <button
                      onClick={() => resetPassword(g)}
                      title="Redefinir senha para 123456789"
                      aria-label="Redefinir senha"
                      className="text-muted hover:text-warn transition-colors"
                    >
                      <KeyRound size={14} />
                    </button>
                    <button onClick={() => toggleActive(g)} className={`text-xs uppercase tracking-wider font-medium ${g.active ? "text-muted hover:text-navy" : "text-danger"}`}>
                      {g.active ? "desativar" : "ativar"}
                    </button>
                    <button onClick={() => removeEmployee(g)} className="text-xs uppercase tracking-wider font-medium text-danger hover:text-red-700">
                      excluir
                    </button>
                  </div>
                )}
              </li>
            ))}
            {gerentes.length === 0 && <p className="text-sm text-muted py-2">Nenhum gerente cadastrado ainda nessa loja.</p>}
          </ul>
        </div>
      )}

      {canEdit && (
      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><Plus size={14} /> Novo colaborador</p>
        <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Nome completo</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={18} required />
          </div>
          <div>
            <label className="label">Usuário (id de login)</label>
            <input className="input" placeholder="gerado automaticamente se vazio" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} />
          </div>
          {canManageTeams && (
            <div className="sm:col-span-2">
              <label className="label">Gerente (equipe)</label>
              <select className="input" value={gerenteId} onChange={(e) => setGerenteId(e.target.value)}>
                <option value="">— sem equipe por enquanto —</option>
                {gerentes.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
              </select>
            </div>
          )}
          <div className="sm:col-span-2">
            <button className="btn" type="submit" disabled={loading}>{loading ? "Criando…" : "Criar colaborador"}</button>
          </div>
        </form>
        <p className="text-[11px] text-muted mt-2">A senha padrão (123456789) é definida automaticamente pelo sistema. O colaborador troca a senha no primeiro acesso.</p>
        {msg && (
          <p className="text-xs text-muted mt-2 flex items-center gap-1.5">
            {msg.startsWith("Erro") ? <AlertTriangle size={13} className="text-danger" /> : <CheckCircle2 size={13} className="text-success" />}
            {msg}
          </p>
        )}
      </div>
      )}

      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><Users size={14} /> Equipe ({employees.length})</p>
        <ul className="divide-y divide-line">
          {employees.map((emp) => (
            <li key={emp.id} className="flex items-center justify-between gap-3 py-2.5 text-sm flex-wrap">
              {editingId === emp.id ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <input className="input !py-1.5 !text-sm w-40" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome completo" maxLength={18} autoFocus />
                  <input className="input !py-1.5 !text-sm w-32" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="Usuário" maxLength={20} />
                  {canManageTeams && (
                    <select className="input !py-1.5 !text-sm w-40" value={editGerenteId} onChange={(e) => setEditGerenteId(e.target.value)}>
                      <option value="">— sem equipe —</option>
                      {gerentes.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
                    </select>
                  )}
                  <button onClick={() => saveEdit(emp)} disabled={savingEdit} className="text-xs uppercase tracking-wider font-bold text-success">{savingEdit ? "salvando…" : "salvar"}</button>
                  <button onClick={() => { setEditingId(null); setEditMsg(""); }} className="text-xs uppercase tracking-wider text-muted">cancelar</button>
                  {editMsg && <p className="text-[11px] text-danger w-full">{editMsg}</p>}
                </div>
              ) : onOpenEmployee ? (
                <button type="button" onClick={() => onOpenEmployee(emp)} className="text-left hover:opacity-75 transition-opacity" title="Ver como este colaborador">
                  <p className="font-medium text-navy flex items-center gap-1.5">{emp.full_name} <Eye size={12} className="text-muted" /></p>
                  <p className="text-xs text-muted">usuário: {emp.username}{canManageTeams ? ` · equipe: ${gerenteName(emp.gerente_id)}` : ""}</p>
                </button>
              ) : (
                <div>
                  <p className="font-medium text-navy">{emp.full_name}</p>
                  <p className="text-xs text-muted">usuário: {emp.username}</p>
                </div>
              )}
              {editingId !== emp.id && canEdit && (
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(emp)} className="text-xs uppercase tracking-wider text-muted hover:text-purple font-medium">
                    editar
                  </button>
                  <button
                    onClick={() => resetPassword(emp)}
                    title="Redefinir senha para 123456789"
                    aria-label="Redefinir senha"
                    className="text-muted hover:text-warn transition-colors"
                  >
                    <KeyRound size={14} />
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

// legenda curta pra cada regra de recorrência, usada na lista de tarefas cadastradas
function recurrenceLabel(t) {
  if (t.recurrence_type === "weekly") return `toda ${WEEKDAY_LABELS[t.weekday]}`;
  if (t.recurrence_type === "once") return `só em ${t.once_date?.split("-").reverse().join("/")}`;
  return "todo dia";
}

function Tarefas({ employees, gerentes = [], viewerRole = "master_admin", tasks, empresaId, lojaId, onChanged }) {
  const canEdit = viewerRole !== "leitor";
  const canTargetGerentes = viewerRole !== "gerente" && gerentes.length > 0;
  const [selected, setSelected] = useState(employees[0]?.id || "");
  const [title, setTitle] = useState("");
  const [replicateAll, setReplicateAll] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState("daily");
  const [weekday, setWeekday] = useState(1);
  const [onceDate, setOnceDate] = useState(todayStr());
  const [viewDate, setViewDate] = useState(todayStr());
  const [dayCompletions, setDayCompletions] = useState({});
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [savingTaskEdit, setSavingTaskEdit] = useState(false);
  const myTasks = tasks.filter((t) => t.employee_id === selected);
  const myActiveTasks = myTasks.filter((t) => t.active);
  // só as tarefas que realmente valem no dia sendo visualizado (semanal só no seu dia da
  // semana, única só na sua data) — é o mesmo checklist que o colaborador vê.
  const dueTasks = myActiveTasks.filter((t) => isTaskDueOn(t, viewDate));

  useEffect(() => {
    let active = true;
    (async () => {
      const taskIds = dueTasks.map((t) => t.id);
      if (!taskIds.length) { if (active) setDayCompletions({}); return; }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, viewDate, tasks]);

  async function addTask(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const recurrenceFields = {
      recurrence_type: recurrenceType,
      weekday: recurrenceType === "weekly" ? weekday : null,
      once_date: recurrenceType === "once" ? onceDate : null,
      start_date: todayStr(),
    };
    if (replicateAll) {
      const activeEmps = employees.filter((e) => e.active);
      if (!activeEmps.length) return;
      const rows = activeEmps.map((emp) => ({
        employee_id: emp.id,
        title: title.trim(),
        empresa_id: empresaId,
        loja_id: lojaId,
        ...recurrenceFields,
      }));
      await supabase.from("tasks").insert(rows);
    } else {
      if (!selected) return;
      await supabase.from("tasks").insert({ employee_id: selected, title: title.trim(), empresa_id: empresaId, loja_id: lojaId, ...recurrenceFields });
    }
    setTitle("");
    setRecurrenceType("daily");
    onChanged();
  }

  // "Excluir" nunca pode apagar dias já registrados (feitos ou não) — isso reescreveria o
  // histórico de indicadores passados. Só remove pendências de hoje em diante (que ainda nem
  // deveriam ter acontecido) e desativa a tarefa (active=false) pra ela sumir da lista e parar
  // de valer daqui pra frente — os dias já concluídos ou perdidos permanecem intactos no
  // histórico, ligados à tarefa, mesmo ela não aparecendo mais aqui.
  async function removeTask(t) {
    if (!window.confirm(`Excluir "${t.title}"? Ela some da lista e para de valer a partir de hoje. Dias já registrados (feitos ou perdidos) continuam no histórico e não são apagados.`)) return;
    await supabase
      .from("task_completions")
      .delete()
      .eq("task_id", t.id)
      .eq("completed", false)
      .gte("completion_date", todayStr());
    await supabase.from("tasks").update({ active: false }).eq("id", t.id);
    onChanged();
  }

  function startEditTask(t) {
    setEditingTaskId(t.id);
    setEditTaskTitle(t.title);
  }

  async function saveTaskEdit(t) {
    if (!editTaskTitle.trim()) return;
    setSavingTaskEdit(true);
    await supabase.from("tasks").update({ title: editTaskTitle.trim() }).eq("id", t.id);
    setSavingTaskEdit(false);
    setEditingTaskId(null);
    onChanged();
  }

  // gerente pode corrigir/marcar o checklist de qualquer dia (inclusive dias anteriores) — diferente do
  // colaborador, que só marca o dia de hoje.
  async function toggleDayTask(taskId) {
    const current = !!dayCompletions[taskId]?.completed;
    const newVal = !current;
    await supabase.from("task_completions").upsert(
      { task_id: taskId, completion_date: viewDate, completed: newVal, completed_at: newVal ? new Date().toISOString() : null },
      { onConflict: "task_id,completion_date" }
    );
    setDayCompletions((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), completed: newVal } }));
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label">Colaborador{canTargetGerentes ? " ou gerente" : ""}</label>
        <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {canTargetGerentes ? (
            <>
              <optgroup label="Colaboradores">
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </optgroup>
              <optgroup label="Gerentes">
                {gerentes.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
              </optgroup>
            </>
          ) : (
            employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)
          )}
        </select>
      </div>

      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><CheckSquare size={14} /> Tarefas</p>
        {canEdit && (
        <form onSubmit={addTask} className="space-y-3 mb-4">
          <div className="flex gap-3">
            <input className="input" placeholder="nome da tarefa" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={18} />
            <button className="btn whitespace-nowrap" type="submit">Adicionar</button>
          </div>

          <div>
            <label className="label">Repetição</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: "daily", label: "Todos os dias" },
                { key: "weekly", label: "1 dia na semana" },
                { key: "once", label: "Só uma vez" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRecurrenceType(opt.key)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                    recurrenceType === opt.key ? "border-purple text-purple" : "border-line text-muted hover:border-purple/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {recurrenceType === "weekly" && (
            <div>
              <label className="label">Dia da semana</label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setWeekday(idx)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                      weekday === idx ? "border-purple text-purple" : "border-line text-muted hover:border-purple/50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {recurrenceType === "once" && (
            <div className="max-w-[220px]">
              <label className="label">Data</label>
              <input type="date" className="input date-input" value={onceDate} onChange={(e) => setOnceDate(e.target.value)} />
            </div>
          )}

          <label className="flex items-center gap-2 text-[11px] sm:text-xs text-muted font-medium">
            <input type="checkbox" checked={replicateAll} onChange={(e) => setReplicateAll(e.target.checked)} className="shrink-0" />
            Replicar essa tarefa para todos os colaboradores da loja
          </label>
        </form>
        )}
        <ul className="divide-y divide-line">
          {myActiveTasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 flex-wrap py-2.5 text-sm">
              {editingTaskId === t.id ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <input
                    className="input !py-1.5 !text-sm flex-1 min-w-[140px]"
                    value={editTaskTitle}
                    onChange={(e) => setEditTaskTitle(e.target.value)}
                    maxLength={18}
                    autoFocus
                  />
                  <button onClick={() => saveTaskEdit(t)} disabled={savingTaskEdit} className="text-xs uppercase tracking-wider font-bold text-success">
                    {savingTaskEdit ? "salvando…" : "salvar"}
                  </button>
                  <button onClick={() => setEditingTaskId(null)} className="text-xs uppercase tracking-wider text-muted">cancelar</button>
                </div>
              ) : (
                <>
                  <span className="text-navy min-w-0 truncate">
                    {t.title} <span className="text-[11px] text-muted font-normal">· {recurrenceLabel(t)}</span>
                  </span>
                  {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEditTask(t)} title="Editar tarefa" aria-label="Editar tarefa" className="p-1.5 rounded-lg text-muted hover:text-navy hover:bg-line/60 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => removeTask(t)} title="Excluir tarefa" aria-label="Excluir tarefa" className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-line/60 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  )}
                </>
              )}
            </li>
          ))}
          {myActiveTasks.length === 0 && <p className="text-sm text-muted py-2">Nenhuma tarefa para este colaborador.</p>}
        </ul>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="label mb-0 flex items-center gap-1.5"><CheckSquare size={14} /> Checklist do dia</p>
          <DateNav date={viewDate} onChange={setViewDate} maxDate={todayStr()} />
        </div>
        <ul className="divide-y divide-line">
          {dueTasks.map((t) => {
            const done = !!dayCompletions[t.id]?.completed;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                {canEdit ? (
                <button
                  onClick={() => toggleDayTask(t.id)}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-bold text-white transition-all ${done ? "" : "bg-line text-muted hover:bg-line/70"}`}
                  style={done ? { background: "linear-gradient(135deg, #84cc16, #0d9488)" } : undefined}
                >
                  {done ? <Check size={13} strokeWidth={3} /> : <X size={13} />}
                </button>
                ) : (
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-bold text-white transition-all ${done ? "" : "bg-line text-muted"}`}
                  style={done ? { background: "linear-gradient(135deg, #84cc16, #0d9488)" } : undefined}
                >
                  {done ? <Check size={13} strokeWidth={3} /> : <X size={13} />}
                </span>
                )}
                <span className={done ? "text-navy" : "text-muted"}>{t.title}</span>
              </li>
            );
          })}
          {dueTasks.length === 0 && <p className="text-sm text-muted py-2">Nenhuma tarefa valendo nesse dia para este colaborador.</p>}
        </ul>
      </div>
    </div>
  );
}

function Advertencias({ employees, gerentes = [], viewerRole = "master_admin", warnings, settings, today, empresaId, lojaId, onChanged }) {
  const canEdit = viewerRole !== "leitor";
  const canTargetGerentes = viewerRole !== "gerente" && gerentes.length > 0;
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
        <label className="label">Colaborador{canTargetGerentes ? " ou gerente" : ""}</label>
        <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {canTargetGerentes ? (
            <>
              <optgroup label="Colaboradores">
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </optgroup>
              <optgroup label="Gerentes">
                {gerentes.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
              </optgroup>
            </>
          ) : (
            employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)
          )}
        </select>
      </div>

      {canEdit && (
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
      )}

      <div className="card">
        <p className="label mb-3">Advertências do mês ({myWarnings.length})</p>
        <ul className="divide-y divide-line">
          {myWarnings.map((w) => (
            <li key={w.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p>{w.reason}</p>
                <p className="text-xs text-muted">{w.warning_date} · -{w.points}%</p>
              </div>
              {canEdit && (
              <button onClick={() => removeWarning(w)} className="text-xs uppercase tracking-wider text-danger">remover</button>
              )}
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

function Premiacoes({ employees, gerentes = [], viewerRole = "master_admin", prizes, month, empresaId, lojaId, onChanged }) {
  const canEdit = viewerRole !== "leitor";
  const canTargetGerentes = viewerRole !== "gerente" && gerentes.length > 0;
  const activeEmps = employees.filter((e) => e.active);
  const [empId, setEmpId] = useState(activeEmps[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!empId && activeEmps.length) setEmpId(activeEmps[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  async function addPrize(e) {
    e.preventDefault();
    if (!empId || !amount) return;
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("employee_prizes").insert({
      employee_id: empId,
      month,
      amount: Number(amount) || 0,
      description: description.trim() || null,
      empresa_id: empresaId,
      loja_id: lojaId,
      created_by: session.user.id,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    });
    setAmount("");
    setDescription("");
    setSaving(false);
    onChanged();
  }

  async function removePrize(id) {
    if (!window.confirm("Excluir essa premiação?")) return;
    await supabase.from("employee_prizes").delete().eq("id", id);
    onChanged();
  }

  return (
    <div className="space-y-6">
      {canEdit && (
      <div className="card">
        <p className="label mb-2 flex items-center gap-1.5"><Gift size={14} /> Nova premiação — {monthLabel(month)}</p>
        <p className="text-xs text-muted mb-4">Você pode lançar quantas premiações quiser por colaborador no mês — todas somam no herocard dele (e no seu, aqui no dashboard do gerente).</p>
        {activeEmps.length === 0 && !canTargetGerentes ? (
          <p className="text-sm text-muted">Nenhum colaborador ativo nesta loja.</p>
        ) : (
          <form onSubmit={addPrize} className="grid sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="label">Colaborador{canTargetGerentes ? " ou gerente" : ""}</label>
              <select className="input" value={empId} onChange={(e) => setEmpId(e.target.value)}>
                {canTargetGerentes ? (
                  <>
                    <optgroup label="Colaboradores">
                      {activeEmps.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                    </optgroup>
                    <optgroup label="Gerentes">
                      {gerentes.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
                    </optgroup>
                  </>
                ) : (
                  activeEmps.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)
                )}
              </select>
            </div>
            <div>
              <label className="label">Valor (R$)</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
            <div>
              <label className="label">Motivo (opcional)</label>
              <input className="input" placeholder="ex: campanha de vendas" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <button className="btn w-full" type="submit" disabled={saving}>{saving ? "Lançando…" : "Lançar"}</button>
            </div>
          </form>
        )}
      </div>
      )}

      <div className="card">
        <p className="label mb-3">Premiações lançadas — {monthLabel(month)}</p>
        {[...activeEmps, ...(canTargetGerentes ? gerentes : [])].map((emp) => {
          const empPrizes = prizes.filter((p) => p.employee_id === emp.id);
          if (!empPrizes.length) return null;
          const total = empPrizes.reduce((s, p) => s + Number(p.amount || 0), 0);
          return (
            <div key={emp.id} className="mb-4 last:mb-0">
              <p className="text-xs sm:text-sm font-semibold text-navy flex items-center justify-between gap-2">
                <span className="truncate">{emp.full_name}</span>
                <span className="text-purple shrink-0 whitespace-nowrap">{formatBRL(total)}</span>
              </p>
              <ul className="divide-y divide-line mt-1">
                {empPrizes.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-xs sm:text-sm">
                    <span className="text-muted truncate">{p.description || "sem descrição"}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="font-medium text-navy whitespace-nowrap">{formatBRL(p.amount)}</span>
                      {canEdit && (
                      <button onClick={() => removePrize(p.id)} className="text-xs uppercase tracking-wider text-danger">excluir</button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {prizes.length === 0 && <p className="text-sm text-muted">Nenhuma premiação lançada ainda.</p>}
      </div>
    </div>
  );
}

// cada meta ganha uma cor de ícone diferente, ciclando pela paleta conforme a ordem (Meta 1, Meta 2…)
const GOAL_ICON_COLORS = ["text-purple", "text-teal", "text-orange", "text-pink", "text-blue", "text-gold", "text-lime", "text-success"];

function Metas({ employees, goals, allocations, commissionSettings, settings, month, empresaId, lojaId, onChanged, viewerRole = "master_admin" }) {
  // Só sócio/supervisor/master_admin criam meta, distribuem entre colaboradores e definem comissão.
  // Gerente e supervisor/sócio "leitor" (só permissão de ver) só visualizam.
  const canManage = viewerRole !== "gerente" && viewerRole !== "leitor";

  const [prize, setPrize] = useState(settings?.monthly_prize ?? 0);
  const [savingPrize, setSavingPrize] = useState(false);

  async function savePrize(e) {
    e.preventDefault();
    setSavingPrize(true);
    await supabase.from("app_settings").update({ monthly_prize: Number(prize) || 0 }).eq("loja_id", lojaId);
    setSavingPrize(false);
    onChanged();
  }

  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [commColab, setCommColab] = useState("");
  const [commGerente, setCommGerente] = useState("");

  const [editingGoal, setEditingGoal] = useState(null);
  const [distMode, setDistMode] = useState("equal");
  const [customVals, setCustomVals] = useState({});

  const [editingValuesId, setEditingValuesId] = useState(null);
  const [evName, setEvName] = useState("");
  const [evTotal, setEvTotal] = useState("");
  const [evCommColab, setEvCommColab] = useState("");
  const [evCommGerente, setEvCommGerente] = useState("");
  const [savingValues, setSavingValues] = useState(false);

  const [naoAtingColab, setNaoAtingColab] = useState(commissionSettings.non_achievement_colaborador_pct ?? 0);
  const [naoAtingGerente, setNaoAtingGerente] = useState(commissionSettings.non_achievement_gerente_pct ?? 0);
  const [savingNaoAting, setSavingNaoAting] = useState(false);

  async function createGoal(e) {
    e.preventDefault();
    if (!name.trim() || !total) return;
    const { data: { session } } = await supabase.auth.getSession();
    const storeTotal = Number(total);
    const { data: inserted, error } = await supabase
      .from("sales_goals")
      .insert({
        month,
        name: name.trim(),
        store_total: storeTotal,
        commission_pct_colaborador: Number(commColab) || 0,
        commission_pct_gerente: Number(commGerente) || 0,
        created_by: session.user.id,
        empresa_id: empresaId,
        loja_id: lojaId,
      })
      .select()
      .single();

    // divide igual entre os colaboradores ativos automaticamente, sem precisar de passo manual
    if (!error && inserted) {
      const activeEmps = employees.filter((e) => e.active);
      if (activeEmps.length) {
        const amount = storeTotal / activeEmps.length;
        const rows = activeEmps.map((emp) => ({
          goal_id: inserted.id,
          employee_id: emp.id,
          amount,
          percentage: 100 / activeEmps.length,
          empresa_id: empresaId,
          loja_id: lojaId,
        }));
        await supabase.from("sales_goal_allocations").upsert(rows, { onConflict: "goal_id,employee_id" });
      }
    }

    setName(""); setTotal(""); setCommColab(""); setCommGerente(""); setNewGoalOpen(false);
    onChanged();
  }

  function startEditValues(goal) {
    setEditingValuesId(goal.id);
    setEvName(goal.name);
    setEvTotal(String(goal.store_total));
    setEvCommColab(String(goal.commission_pct_colaborador ?? 0));
    setEvCommGerente(String(goal.commission_pct_gerente ?? 0));
  }

  async function saveGoalValues(goalId) {
    if (!evName.trim() || !evTotal) return;
    setSavingValues(true);
    const newTotal = Number(evTotal);
    await supabase
      .from("sales_goals")
      .update({
        name: evName.trim(),
        store_total: newTotal,
        commission_pct_colaborador: Number(evCommColab) || 0,
        commission_pct_gerente: Number(evCommGerente) || 0,
      })
      .eq("id", goalId);

    // recalcula a distribuição automaticamente — só quando a meta está em distribuição igual
    // (ou ainda sem distribuição nenhuma); distribuição custom foi definida manualmente e não é mexida.
    const goalAllocs = allocations.filter((a) => a.goal_id === goalId);
    if (goalAllocs.length === 0 || isEvenSplit(goalAllocs)) {
      const activeEmps = employees.filter((e) => e.active);
      if (activeEmps.length) {
        const amount = newTotal / activeEmps.length;
        const rows = activeEmps.map((emp) => ({
          goal_id: goalId,
          employee_id: emp.id,
          amount,
          percentage: 100 / activeEmps.length,
          empresa_id: empresaId,
          loja_id: lojaId,
        }));
        await supabase.from("sales_goal_allocations").upsert(rows, { onConflict: "goal_id,employee_id" });
      }
    }

    setSavingValues(false);
    setEditingValuesId(null);
    onChanged();
  }

  async function removeGoal(goal) {
    if (!window.confirm(`Excluir a meta "${goal.name}"? Isso também remove a distribuição feita entre os colaboradores.`)) return;
    await supabase.from("sales_goal_allocations").delete().eq("goal_id", goal.id);
    await supabase.from("sales_goals").delete().eq("id", goal.id);
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
      {canManage && (
        <div className="card">
          <p className="label mb-3 flex items-center gap-1.5"><Gift size={14} /> Premiação mensal</p>
          <form onSubmit={savePrize} className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <label className="label">Valor (R$)</label>
              <CurrencyInput value={prize} onChange={setPrize} />
            </div>
            <button className="btn" type="submit" disabled={savingPrize}>{savingPrize ? "Salvando…" : "Salvar"}</button>
          </form>
          <p className="text-[11px] text-muted mt-2">Liberada quando a barra geral da equipe bate o percentual mínimo (configurado na aba Placar).</p>
        </div>
      )}

      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><Coins size={14} /> Comissionamentos</p>
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

        <ul className="mt-3 text-xs sm:text-sm divide-y divide-line">
          <li className="flex justify-between py-1.5 gap-2">
            <span className="text-muted">Não atingimento</span>
            <span className="text-right">{Number(commissionSettings.non_achievement_colaborador_pct) || 0}% colaborador · {Number(commissionSettings.non_achievement_gerente_pct) || 0}% gerente</span>
          </li>
          {goals.map((g, idx) => (
            <li key={g.id} className="flex justify-between py-1.5 gap-2">
              <span className="text-muted">Meta {idx + 1} — {g.name}</span>
              <span className="text-right">{Number(g.commission_pct_colaborador) || 0}% colaborador · {Number(g.commission_pct_gerente) || 0}% gerente</span>
            </li>
          ))}
        </ul>
      </div>

      {canManage ? (
        <div className="card">
          <button type="button" onClick={() => setNewGoalOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 whitespace-nowrap m-0 label mb-0">
              <Plus size={14} className="shrink-0" /> Nova meta — {monthLabel(month)}
            </p>
            {newGoalOpen ? <ChevronUp size={15} className="text-muted shrink-0" /> : <ChevronDown size={15} className="text-muted shrink-0" />}
          </button>
          {newGoalOpen && (
            <>
              <form onSubmit={createGoal} className="grid sm:grid-cols-5 gap-3 items-end mt-3">
                <div>
                  <label className="label">Nome</label>
                  <input className="input" placeholder="Meta / Super Meta / Hiper Meta…" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
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
            </>
          )}
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
                  <p className="font-semibold text-xs sm:text-sm text-navy flex items-center gap-1.5"><Target size={14} className={GOAL_ICON_COLORS[idx % GOAL_ICON_COLORS.length]} /> {g.name} <span className="badge bg-line text-muted">Meta {idx + 1}</span></p>
                  <p className="text-[11px] sm:text-xs text-muted">{formatBRL(g.store_total)}</p>
                </div>
                {canManage && !isEditing && editingValuesId !== g.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-2 rounded-lg text-muted hover:text-navy hover:bg-line/60 transition-colors"
                      onClick={() => startEditValues(g)}
                      title="Editar valores"
                      aria-label="Editar valores"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="p-2 rounded-lg text-muted hover:text-navy hover:bg-line/60 transition-colors"
                      onClick={() => openEditor(g, goalAllocs)}
                      title={goalAllocs.length === 0 ? "Definir distribuição" : "Editar distribuição"}
                      aria-label={goalAllocs.length === 0 ? "Definir distribuição" : "Editar distribuição"}
                    >
                      <Split size={15} />
                    </button>
                    <button
                      className="p-2 rounded-lg text-danger hover:bg-danger/10 transition-colors"
                      onClick={() => removeGoal(g)}
                      title="Excluir meta"
                      aria-label="Excluir meta"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>

              {editingValuesId === g.id ? (
                <div className="mt-4 grid sm:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="label">Nome</label>
                    <input className="input" value={evName} onChange={(e) => setEvName(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Valor total da loja (R$)</label>
                    <CurrencyInput value={evTotal} onChange={setEvTotal} />
                  </div>
                  <div>
                    <label className="label">% comissão colaborador</label>
                    <input type="number" step="0.1" min="0" className="input" value={evCommColab} onChange={(e) => setEvCommColab(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">% comissão gerente</label>
                    <input type="number" step="0.1" min="0" className="input" value={evCommGerente} onChange={(e) => setEvCommGerente(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => saveGoalValues(g.id)} disabled={savingValues}>{savingValues ? "Salvando…" : "Salvar"}</button>
                    <button className="btn-outline" onClick={() => setEditingValuesId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : isEditing ? (
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2 flex-wrap">
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
                          <span className="text-xs sm:text-sm flex-1">{emp.full_name}</span>
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
              ) : goalAllocs.length === 0 ? (
                <p className="text-[11px] text-muted mt-3">Sem distribuição definida ainda.</p>
              ) : isEvenSplit(goalAllocs) ? (
                // distribuição igual: uma linha resume tudo em vez de repetir o mesmo valor
                // pra cada colaborador — é onde a aba Metas fica poluída em lojas com muita gente.
                <p className="text-xs sm:text-sm text-muted mt-3">{goalAllocs.length} colaborador(es) · {formatBRL(goalAllocs[0].amount)} cada.</p>
              ) : (
                <ul className="mt-3 text-xs sm:text-sm divide-y divide-line">
                  {goalAllocs.map((a) => {
                    const emp = employees.find((e) => e.id === a.employee_id);
                    return (
                      <li key={a.id} className="flex justify-between py-1.5">
                        <span className="text-muted">{emp?.full_name || "—"}</span>
                        <span>{formatBRL(a.amount)}</span>
                      </li>
                    );
                  })}
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

function Lancamentos({ employees, entries, empresaId, lojaId, onChanged, viewerRole = "master_admin" }) {
  const canEdit = viewerRole !== "leitor";
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

      {canEdit && (
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
      )}

      <div className="card">
        <p className="label mb-3">Histórico</p>
        <ul className="divide-y divide-line text-xs sm:text-sm">
          {myEntries.map((en) => (
            <li key={en.id} className="flex justify-between py-2">
              <span className="text-muted">{en.entry_date}{en.edited_by_manager ? " (corrigido)" : ""}</span>
              <span>{formatBRL(en.daily_amount)}</span>
            </li>
          ))}
          {myEntries.length === 0 && <p className="text-[11px] text-muted py-2">Nenhum lançamento ainda.</p>}
        </ul>
      </div>
    </div>
  );
}

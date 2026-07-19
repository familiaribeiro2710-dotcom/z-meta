"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  PhoneCall,
  Phone,
  CalendarClock,
  CalendarPlus,
  ListTodo,
  Coins,
  ChevronDown,
  ChevronUp,
  XCircle,
  CheckCircle2,
  Clock,
  X,
  CheckSquare,
  Check,
  CalendarDays,
  PartyPopper,
  Eye,
  ArrowLeft,
  TrendingUp,
  Target,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import Confetti from "./Confetti";
import DateNav from "./DateNav";
import MonthNav from "./MonthNav";
import SelectField from "./SelectField";
import AutoFitText from "./AutoFitText";
import { CurrencyInput, PhoneInput } from "./MaskedInputs";
import { formatBRL, formatPct, currentGoalTarget } from "./scoring";
import { todayStr, firstDayOfMonth, monthLabel, greeting, isTaskDueOn, daysInMonth } from "./date";
import { useSavedNotice } from "./SavedNotice";

const STATUS_META = {
  novo: { label: "Novo", badgeClass: "bg-line text-muted", chipClass: "bg-line text-muted" },
  agendado: { label: "Agendado", badgeClass: "bg-blue/15 text-blue", chipClass: "bg-blue/15 text-blue" },
  follow_up: { label: "Follow-up", badgeClass: "bg-warn/15 text-warn", chipClass: "bg-warn/15 text-warn" },
  perdido: { label: "Perdido", badgeClass: "bg-danger/15 text-danger", chipClass: "bg-danger/15 text-danger" },
  vendido: { label: "Vendido", badgeClass: "bg-success/15 text-success", chipClass: "bg-success/15 text-success" },
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

// Linha reaproveitada em "Agenda do dia", "Minhas ligações" e no detalhe de dia do Calendário —
// mostra nome/telefone/status/hora e, se o lead ainda não foi resolvido, os botões de ação
// (agendar/reagendar +, quando showResolve, os 3 de resolver: perdido/follow-up/vendido).
// showResolve=false em "Minhas ligações" (pedido do Felipe) — resolver só faz sentido a partir da
// Agenda do dia/Calendário; a lista "Minhas ligações" é só consulta/histórico, mas ainda permite
// agendar/reagendar.
function LeadRow({ lead, onAgendar, onResolve, showResolve = true }) {
  const meta = STATUS_META[lead.status] || STATUS_META.novo;
  const terminal = lead.status === "vendido" || lead.status === "perdido";
  const hora = fmtHora(lead.agendamento_at);
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy flex items-center gap-1.5 flex-wrap">
            <span className="truncate">{lead.nome_completo}</span>
            <span className={`badge !text-[10px] shrink-0 ${meta.badgeClass}`}>{meta.label}</span>
          </p>
          <p className="text-xs text-muted mt-0.5 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1"><Phone size={11} className="shrink-0" /> {lead.telefone}</span>
            {hora && <span className="flex items-center gap-1"><CalendarClock size={11} className="shrink-0" /> {hora}</span>}
          </p>
          {lead.feedback && <p className="text-[11px] text-muted mt-1 italic truncate">&ldquo;{lead.feedback}&rdquo;</p>}
          {lead.status === "vendido" && <p className="text-xs font-bold text-success mt-1">{formatBRL(lead.valor)}</p>}
        </div>
        {!terminal && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => onAgendar(lead)} title="Agendar / reagendar" aria-label="Agendar" className="p-1.5 rounded-lg border border-line text-muted hover:border-blue hover:text-blue transition-colors">
              <CalendarPlus size={14} />
            </button>
            {showResolve && (
              <>
                <button type="button" onClick={() => onResolve(lead, "perdido")} title="Perdido" aria-label="Perdido" className="p-1.5 rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors">
                  <XCircle size={14} />
                </button>
                <button type="button" onClick={() => onResolve(lead, "follow_up")} title="Follow-up" aria-label="Follow-up" className="p-1.5 rounded-lg border border-warn/30 text-warn hover:bg-warn/10 transition-colors">
                  <Clock size={14} />
                </button>
                <button type="button" onClick={() => onResolve(lead, "vendido")} title="Vendido" aria-label="Vendido" className="p-1.5 rounded-lg border border-success/30 text-success hover:bg-success/10 transition-colors">
                  <CheckCircle2 size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// Experiência completa do colaborador no segmento CONSÓRCIO — equivalente a ColaboradorView.js,
// só que o "trabalho do dia" é o funil de ligações (cadastrar → agendar → resolver) em vez de meta
// de venda diária + checklist como único eixo. Tarefas/checklist continuam existindo (decisão do
// Felipe: consórcio mantém tasks/advertências/premiações, só o mecanismo de meta de venda muda —
// motor de metas de consórcio ainda não foi construído, isso é Fase 4).
export default function ColaboradorViewConsorcio({ profile, tab, viewedByManager = false, onBack }) {
  const notifySaved = useSavedNotice();
  const todayStrVal = todayStr();
  const greet = greeting();
  const didInit = useRef(false);

  // ---- funil (crm_leads) ----
  const [leads, setLeads] = useState([]);
  const [produtoCategorias, setProdutoCategorias] = useState([]);
  // meta individual do mês (consorcio_goals + própria alocação) — só pra alimentar o número grande
  // do herocard ("falta pra bater a meta"), não existe aba Metas própria pro colaborador de consórcio.
  const [goals, setGoals] = useState([]);
  const [viewDate, setViewDate] = useState(todayStrVal);
  const [listFilter, setListFilter] = useState("abertos");

  const [formOpen, setFormOpen] = useState(false);
  const [fNome, setFNome] = useState("");
  const [fTelefone, setFTelefone] = useState("");
  const [fEndereco, setFEndereco] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fDataLigacao, setFDataLigacao] = useState(todayStrVal);
  const [fAgendaData, setFAgendaData] = useState("");
  const [fAgendaHora, setFAgendaHora] = useState("");
  const [fFeedback, setFFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState("");

  const [resolveModal, setResolveModal] = useState(null); // { lead, type: 'perdido'|'follow_up'|'vendido' }
  const [resolveFeedback, setResolveFeedback] = useState("");
  const [resolveValor, setResolveValor] = useState("");
  const [resolveCategoriaId, setResolveCategoriaId] = useState("");
  const [resolveObs, setResolveObs] = useState("");
  const [resolveSaving, setResolveSaving] = useState(false);

  const [agendarModal, setAgendarModal] = useState(null); // lead
  const [agendarData, setAgendarData] = useState("");
  const [agendarHora, setAgendarHora] = useState("");
  const [agendarSaving, setAgendarSaving] = useState(false);

  // ---- calendário ----
  const [calMonth, setCalMonth] = useState(firstDayOfMonth(todayStrVal));
  const [calSelectedDay, setCalSelectedDay] = useState(todayStrVal);

  // ---- tarefas (checklist — mesma lógica de ColaboradorView.js) ----
  const [tasks, setTasks] = useState([]);
  const [todayTaskCompletions, setTodayTaskCompletions] = useState({});
  const [taskViewDate, setTaskViewDate] = useState(todayStrVal);
  const [taskDayCompletions, setTaskDayCompletions] = useState({});
  const [showCongrats, setShowCongrats] = useState(false);

  const loadCrm = useCallback(async (uid, empresaId, lojaId) => {
    const { data: leadRows } = await supabase.from("crm_leads").select("*").eq("employee_id", uid).order("created_at", { ascending: false });
    setLeads(leadRows || []);
    const { data: catRows } = await supabase
      .from("consorcio_produto_categorias")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("active", true)
      .order("nome");
    setProdutoCategorias(catRows || []);

    // meta individual — mesmo padrão de ColaboradorView.js (vestuário): goal + a própria alocação,
    // só entra na lista se houver alocação (sem distribuição definida, não há meta "em jogo").
    const monthArg = firstDayOfMonth(todayStr());
    const { data: goalRows } = await supabase.from("consorcio_goals").select("*").eq("loja_id", lojaId).eq("month", monthArg).order("store_total");
    const { data: allocRows } = await supabase.from("consorcio_goal_allocations").select("*").eq("employee_id", uid);
    const combined = (goalRows || [])
      .map((g) => ({ goal: g, allocation: (allocRows || []).find((a) => a.goal_id === g.id) }))
      .filter((x) => x.allocation);
    setGoals(combined);
  }, []);

  const loadTasks = useCallback(async (uid) => {
    const { data: myTasks } = await supabase.from("tasks").select("*").eq("employee_id", uid).eq("active", true).order("created_at");
    setTasks(myTasks || []);
    const todayTasks = (myTasks || []).filter((t) => isTaskDueOn(t, todayStrVal));
    if (todayTasks.length) {
      const rows = todayTasks.map((t) => ({ task_id: t.id, completion_date: todayStrVal }));
      await supabase.from("task_completions").upsert(rows, { onConflict: "task_id,completion_date", ignoreDuplicates: true });
      const { data: todayRows } = await supabase
        .from("task_completions")
        .select("*")
        .in("task_id", todayTasks.map((t) => t.id))
        .eq("completion_date", todayStrVal);
      const map = {};
      (todayRows || []).forEach((r) => (map[r.task_id] = r));
      setTodayTaskCompletions(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStrVal]);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.all([loadCrm(profile.id, profile.empresa_id, profile.loja_id), loadTasks(profile.id)]);
      if (!active) return;
      didInit.current = true;
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  useEffect(() => {
    if (!didInit.current) return;
    if (taskViewDate === todayStrVal) { setTaskDayCompletions(todayTaskCompletions); return; }
    const dueThatDay = tasks.filter((t) => isTaskDueOn(t, taskViewDate));
    if (!dueThatDay.length) { setTaskDayCompletions({}); return; }
    let active = true;
    (async () => {
      const { data } = await supabase.from("task_completions").select("*").in("task_id", dueThatDay.map((t) => t.id)).eq("completion_date", taskViewDate);
      if (!active) return;
      const map = {};
      (data || []).forEach((r) => (map[r.task_id] = r));
      setTaskDayCompletions(map);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskViewDate, tasks, todayTaskCompletions]);

  async function toggleTask(taskId) {
    const current = todayTaskCompletions[taskId];
    const newVal = !current?.completed;
    await supabase
      .from("task_completions")
      .update({ completed: newVal, completed_at: newVal ? new Date().toISOString() : null })
      .eq("task_id", taskId)
      .eq("completion_date", todayStrVal);
    await loadTasks(profile.id);

    if (newVal && !viewedByManager) {
      const dueToday = tasks.filter((t) => isTaskDueOn(t, todayStrVal));
      const willAllBeDone = dueToday.length > 0 && dueToday.every((t) => (t.id === taskId ? true : todayTaskCompletions[t.id]?.completed));
      if (willAllBeDone) {
        const flagKey = `zmeta_congrats_consorcio_${profile.id}_${todayStrVal}`;
        if (typeof window !== "undefined" && !window.localStorage.getItem(flagKey)) {
          window.localStorage.setItem(flagKey, "1");
          setShowCongrats(true);
        }
      }
    }
  }

  function resetForm() {
    setFNome(""); setFTelefone(""); setFEndereco(""); setFEmail("");
    setFDataLigacao(todayStrVal); setFAgendaData(""); setFAgendaHora(""); setFFeedback("");
  }

  async function submitLead(e) {
    e.preventDefault();
    setFormMsg("");
    if (!fNome.trim() || !fTelefone.trim()) { setFormMsg("Nome completo e telefone são obrigatórios."); return; }
    if ((fAgendaData && !fAgendaHora) || (!fAgendaData && fAgendaHora)) {
      setFormMsg("Preencha data e hora do agendamento, ou deixe os dois em branco.");
      return;
    }
    setSaving(true);
    const hasAgenda = !!(fAgendaData && fAgendaHora);
    const payload = {
      empresa_id: profile.empresa_id,
      loja_id: profile.loja_id,
      employee_id: profile.id,
      nome_completo: fNome.trim(),
      telefone: fTelefone.trim(),
      endereco: fEndereco.trim() || null,
      email: fEmail.trim() || null,
      data_ligacao: fDataLigacao || todayStrVal,
      agendamento_at: hasAgenda ? new Date(`${fAgendaData}T${fAgendaHora}:00`).toISOString() : null,
      status: hasAgenda ? "agendado" : "novo",
      feedback: fFeedback.trim() || null,
      created_by: profile.id,
    };
    const { error } = await supabase.from("crm_leads").insert(payload);
    setSaving(false);
    if (error) {
      setFormMsg("Erro ao salvar: " + error.message);
      return;
    }
    resetForm();
    setFormOpen(false);
    notifySaved("Ligação cadastrada com sucesso.");
    await loadCrm(profile.id, profile.empresa_id, profile.loja_id);
  }

  function openResolve(lead, type) {
    setResolveModal({ lead, type });
    setResolveFeedback(lead.feedback || "");
    setResolveValor("");
    setResolveCategoriaId("");
    setResolveObs(lead.observacoes || "");
  }

  async function confirmResolve() {
    if (!resolveModal) return;
    const { lead, type } = resolveModal;
    setResolveSaving(true);
    let error;
    if (type === "vendido") {
      if (resolveValor === "" || Number(resolveValor) <= 0 || !resolveCategoriaId) {
        setResolveSaving(false);
        return;
      }
      ({ error } = await supabase
        .from("crm_leads")
        .update({
          status: "vendido",
          valor: Number(resolveValor),
          categoria_produto_id: resolveCategoriaId,
          observacoes: resolveObs.trim() || null,
          vendido_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id));
    } else {
      ({ error } = await supabase
        .from("crm_leads")
        .update({ status: type, feedback: resolveFeedback.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", lead.id));
    }
    setResolveSaving(false);
    if (!error) {
      setResolveModal(null);
      notifySaved("Lead atualizado com sucesso.");
      await loadCrm(profile.id, profile.empresa_id, profile.loja_id);
    }
  }

  function openAgendar(lead) {
    setAgendarModal(lead);
    if (lead.agendamento_at) {
      const d = new Date(lead.agendamento_at);
      setAgendarData(todayStr(d));
      setAgendarHora(d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }));
    } else {
      setAgendarData(""); setAgendarHora("");
    }
  }

  async function confirmAgendar() {
    if (!agendarModal || !agendarData || !agendarHora) return;
    setAgendarSaving(true);
    const { error } = await supabase
      .from("crm_leads")
      .update({
        agendamento_at: new Date(`${agendarData}T${agendarHora}:00`).toISOString(),
        status: "agendado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", agendarModal.id);
    setAgendarSaving(false);
    if (!error) {
      setAgendarModal(null);
      notifySaved("Agendamento salvo com sucesso.");
      await loadCrm(profile.id, profile.empresa_id, profile.loja_id);
    }
  }

  // ---- derivados do funil ----
  const leadsToday = leads.filter((l) => l.data_ligacao === todayStrVal);
  const agendamentosHojeCount = leads.filter((l) => l.agendamento_at && l.agendamento_at.slice(0, 10) === todayStrVal).length;
  const abertosCount = leads.filter((l) => l.status !== "vendido" && l.status !== "perdido").length;
  const vendasMes = leads
    .filter((l) => l.status === "vendido" && l.vendido_at && l.vendido_at.slice(0, 7) === todayStrVal.slice(0, 7))
    .reduce((s, l) => s + Number(l.valor || 0), 0);

  // Meta individual do mês — igual ColaboradorView.js (vestuário), mas diferente do vestuário
  // (que mostra a meta DIÁRIA, dividindo o resto pelos dias restantes do mês), aqui o número grande
  // do herocard é direto "quanto falta pra bater a meta" — consórcio não é venda diária, não faz
  // sentido fatiar por dia (pedido explícito do Felipe).
  const metaAtual = currentGoalTarget(goals.map(({ allocation }) => allocation.amount), vendasMes);
  const restoDaMeta = Math.max(0, metaAtual - vendasMes);

  // Conversão do mês — mesmo cohort de ConsorcioDashboard.js/GerenteViewConsorcio.js: agrupa por
  // data_ligacao, agendados em aberto contam no denominador de agendamento→venda.
  const cohortMesLeads = leads.filter((l) => l.data_ligacao && l.data_ligacao.slice(0, 7) === todayStrVal.slice(0, 7));
  const ligacoesMesCount = cohortMesLeads.length;
  const agendadosMesCount = cohortMesLeads.filter((l) => !!l.agendamento_at).length;
  const vendidosMesCount = cohortMesLeads.filter((l) => l.status === "vendido").length;
  const pctLigacaoAgendamento = ligacoesMesCount > 0 ? (agendadosMesCount / ligacoesMesCount) * 100 : 0;
  const pctAgendamentoVenda = agendadosMesCount > 0 ? (vendidosMesCount / agendadosMesCount) * 100 : 0;
  const pctLigacaoVenda = ligacoesMesCount > 0 ? (vendidosMesCount / ligacoesMesCount) * 100 : 0;

  const agendaDoDia = leads
    .filter((l) => l.agendamento_at && l.agendamento_at.slice(0, 10) === viewDate)
    .sort((a, b) => (a.agendamento_at < b.agendamento_at ? -1 : 1));

  const listaFiltrada = (listFilter === "todos" ? leads : leads.filter((l) => l.status !== "vendido" && l.status !== "perdido"));

  const leadsByDay = {};
  leads.forEach((l) => {
    if (!l.agendamento_at) return;
    const day = l.agendamento_at.slice(0, 10);
    if (!day.startsWith(calMonth.slice(0, 7))) return;
    (leadsByDay[day] = leadsByDay[day] || []).push(l);
  });
  const calWeeks = buildCalendarGrid(calMonth);

  // ---- derivados de tarefas ----
  const todayTasksList = tasks.filter((t) => isTaskDueOn(t, todayStrVal));
  const viewTasksList = tasks.filter((t) => isTaskDueOn(t, taskViewDate || todayStrVal));

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
            <p className="text-sm text-muted mt-2">Você concluiu 100% das suas tarefas de hoje.</p>
            <button className="btn mt-5 w-full" onClick={() => setShowCongrats(false)}>Show de bola!</button>
          </div>
        </div>
      )}

      {resolveModal && resolveModal.type !== "vendido" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full animate-bounce-in border-purple/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2">
              {resolveModal.type === "perdido" ? <XCircle className="text-danger" size={20} /> : <Clock className="text-warn" size={20} />}
              Marcar como {resolveModal.type === "perdido" ? "perdido" : "follow-up"}
            </h2>
            <p className="text-xs text-muted mt-1">{resolveModal.lead.nome_completo}</p>
            <div className="mt-4">
              <label className="label">Feedback</label>
              <textarea className="input" rows={3} value={resolveFeedback} onChange={(e) => setResolveFeedback(e.target.value)} placeholder="O que aconteceu?" />
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setResolveModal(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={resolveSaving} onClick={confirmResolve}>{resolveSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {resolveModal && resolveModal.type === "vendido" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full max-h-[85vh] overflow-y-auto animate-bounce-in border-success/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><CheckCircle2 className="text-success" size={20} /> Marcar como vendido</h2>
            <p className="text-xs text-muted mt-1">{resolveModal.lead.nome_completo}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="label">Valor da venda</label>
                <CurrencyInput value={resolveValor} onChange={setResolveValor} />
              </div>
              <div>
                <label className="label">Categoria</label>
                <SelectField className="w-full" value={resolveCategoriaId} onChange={(e) => setResolveCategoriaId(e.target.value)}>
                  <option value="">— selecione —</option>
                  {produtoCategorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </SelectField>
                {produtoCategorias.length === 0 && <p className="text-[11px] text-warn mt-1">Nenhuma categoria cadastrada ainda — peça pro sócio cadastrar.</p>}
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input" rows={2} value={resolveObs} onChange={(e) => setResolveObs(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setResolveModal(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={resolveSaving} onClick={confirmResolve}>{resolveSaving ? "Salvando…" : "Confirmar venda"}</button>
            </div>
          </div>
        </div>
      )}

      {agendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full animate-bounce-in border-blue/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><CalendarPlus className="text-blue" size={20} /> Agendar</h2>
            <p className="text-xs text-muted mt-1">{agendarModal.nome_completo}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Data</label>
                <input type="date" className="input date-input" value={agendarData} onChange={(e) => setAgendarData(e.target.value)} />
              </div>
              <div>
                <label className="label">Hora</label>
                <input type="time" className="input" value={agendarHora} onChange={(e) => setAgendarHora(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setAgendarModal(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={agendarSaving} onClick={confirmAgendar}>{agendarSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {tab === "atividades" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-navy flex items-center gap-2">
              <greet.Icon size={22} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
            </h1>
          </div>

          <div
            className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
            style={{ background: "linear-gradient(135deg, #60a5fa 0%, #bfdbfe 100%)", boxShadow: "0 10px 28px rgba(37,99,235,0.3)" }}
          >
            <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/15" />
            <div className="relative flex items-center gap-2 mb-3">
              <Target size={18} className="text-navy" />
              <span className="text-xs font-bold uppercase tracking-wider text-navy">Falta pra bater a meta</span>
            </div>
            <AutoFitText className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(restoDaMeta)}</AutoFitText>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">
              {goals.length > 0 ? "meta do mês em jogo" : "nenhuma meta cadastrada ainda"}
            </p>
            <p className="relative text-xs font-semibold text-navy/70 mt-1">Vendido no mês — {formatBRL(vendasMes)}</p>

            <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-5 mt-6 pt-5 border-t border-navy/15">
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{leadsToday.length}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Phone size={11} className="shrink-0" /> Ligações hoje</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{agendamentosHojeCount}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><CalendarClock size={11} className="shrink-0" /> Reuniões hoje</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{abertosCount}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><ListTodo size={11} className="shrink-0" /> Em aberto</p>
              </div>
              <div className="min-w-0">
                <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{formatBRL(vendasMes)}</AutoFitText>
                <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Coins size={11} className="shrink-0" /> Vendido no mês</p>
              </div>
            </div>
          </div>

          <div className="card animate-pop border-purple/20">
            <p className="label mb-3 flex items-center gap-1.5"><TrendingUp size={14} /> Minha conversão — {todayStrVal.slice(0, 7)}</p>
            {ligacoesMesCount === 0 ? (
              <p className="text-sm text-muted">Nenhuma ligação registrada nesse mês ainda.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                  <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(pctLigacaoAgendamento)}</AutoFitText>
                  <p className="text-[11px] text-muted mt-0.5">Ligação → Agendamento</p>
                  <p className="text-[10px] text-muted/80 mt-0.5">{agendadosMesCount} de {ligacoesMesCount} ligações</p>
                </div>
                <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                  <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(pctAgendamentoVenda)}</AutoFitText>
                  <p className="text-[11px] text-muted mt-0.5">Agendamento → Venda</p>
                  <p className="text-[10px] text-muted/80 mt-0.5">{vendidosMesCount} de {agendadosMesCount} agendados</p>
                </div>
                <div className="rounded-2xl bg-purple/5 border border-purple/20 p-3 min-w-0">
                  <AutoFitText className="text-2xl font-extrabold text-purple">{formatPct(pctLigacaoVenda)}</AutoFitText>
                  <p className="text-[11px] text-muted mt-0.5">Funil completo</p>
                  <p className="text-[10px] text-muted/80 mt-0.5">{vendidosMesCount} de {ligacoesMesCount} ligações</p>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <button type="button" onClick={() => setFormOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
              <p className="label mb-0 flex items-center gap-1.5"><PhoneCall size={14} /> Cadastrar ligação</p>
              {formOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
            </button>
            {formOpen && (
              <form onSubmit={submitLead} className="grid sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="label">Nome completo</label>
                  <input className="input" value={fNome} onChange={(e) => setFNome(e.target.value)} maxLength={60} required />
                </div>
                <div>
                  <label className="label">Telefone</label>
                  <PhoneInput value={fTelefone} onChange={setFTelefone} required />
                </div>
                <div>
                  <label className="label">Endereço</label>
                  <input className="input" value={fEndereco} onChange={(e) => setFEndereco(e.target.value)} maxLength={120} />
                </div>
                <div>
                  <label className="label">E-mail</label>
                  <input type="email" className="input" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
                </div>
                <div>
                  <label className="label">Data da ligação</label>
                  <input type="date" className="input date-input" value={fDataLigacao} max={todayStrVal} onChange={(e) => setFDataLigacao(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Agendar — data</label>
                    <input type="date" className="input date-input" value={fAgendaData} onChange={(e) => setFAgendaData(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Hora</label>
                    <input type="time" className="input" value={fAgendaHora} onChange={(e) => setFAgendaHora(e.target.value)} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Feedback (opcional)</label>
                  <textarea className="input" rows={2} value={fFeedback} onChange={(e) => setFFeedback(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <button className="btn" type="submit" disabled={saving}>{saving ? "Salvando…" : "Registrar ligação"}</button>
                </div>
                {formMsg && <p className="sm:col-span-2 text-xs text-muted">{formMsg}</p>}
              </form>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="label mb-0 flex items-center gap-1.5"><CalendarClock size={14} /> Agenda {viewDate === todayStrVal ? "de hoje" : ""}</p>
              <DateNav date={viewDate} onChange={setViewDate} />
            </div>
            {agendaDoDia.length === 0 ? (
              <p className="text-sm text-muted">Nenhum agendamento nesse dia.</p>
            ) : (
              <ul className="divide-y divide-line">
                {agendaDoDia.map((l) => <LeadRow key={l.id} lead={l} onAgendar={openAgendar} onResolve={openResolve} />)}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="label mb-0 flex items-center gap-1.5"><ListTodo size={14} /> Minhas ligações</p>
              <div className="flex items-center gap-1 bg-paper rounded-full p-0.5 border border-line shrink-0">
                <button type="button" onClick={() => setListFilter("abertos")} className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-all ${listFilter === "abertos" ? "bg-white text-navy shadow-soft" : "text-muted"}`}>Em aberto</button>
                <button type="button" onClick={() => setListFilter("todos")} className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-all ${listFilter === "todos" ? "bg-white text-navy shadow-soft" : "text-muted"}`}>Todos</button>
              </div>
            </div>
            {listaFiltrada.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma ligação {listFilter === "abertos" ? "em aberto" : "registrada"} ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {listaFiltrada.map((l) => <LeadRow key={l.id} lead={l} onAgendar={openAgendar} onResolve={openResolve} showResolve={false} />)}
              </ul>
            )}
          </div>
        </div>
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
                onClick={() => { setCalMonth(firstDayOfMonth(todayStrVal)); setCalSelectedDay(todayStrVal); }}
              >
                Hoje
              </button>
              <MonthNav month={calMonth} onChange={setCalMonth} />
            </div>
          </div>

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
                const isToday = dateStr === todayStrVal;
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
                      isSelected ? "border-purple bg-purple/5" : "border-transparent hover:border-line"
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
                        <div key={l.id} className={`text-[9px] sm:text-[10px] font-semibold truncate px-1 py-0.5 rounded ${STATUS_META[l.status]?.chipClass || ""}`}>
                          {l.nome_completo}
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
                  {(leadsByDay[calSelectedDay] || []).map((l) => <LeadRow key={l.id} lead={l} onAgendar={openAgendar} onResolve={openResolve} />)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "tarefas" && (
        <div className="space-y-6">
          <h1 className="text-lg sm:text-xl font-bold text-navy flex items-center gap-2"><CheckSquare size={20} className="text-purple" /> Tarefas</h1>
          <div className="card">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="label mb-0 flex items-center gap-1.5"><CheckSquare size={14} /> Tarefas {taskViewDate === todayStrVal ? "de hoje" : ""}</p>
              <div className="flex items-center gap-3">
                <DateNav date={taskViewDate || todayStrVal} onChange={setTaskViewDate} maxDate={todayStrVal} />
                {viewTasksList.length > 0 && (
                  <span className="text-xs text-muted">{viewTasksList.filter((t) => taskDayCompletions[t.id]?.completed).length}/{viewTasksList.length}</span>
                )}
              </div>
            </div>
            {viewTasksList.length === 0 && <p className="text-sm text-muted">Nenhuma tarefa valendo nesse dia.</p>}
            {taskViewDate !== todayStrVal && <p className="text-[11px] text-muted mb-2">Visualização de um dia anterior — só é possível marcar tarefas no dia de hoje.</p>}
            <ul className="divide-y divide-line">
              {viewTasksList.map((t) => {
                const done = !!taskDayCompletions[t.id]?.completed;
                const editable = taskViewDate === todayStrVal;
                return (
                  <li className="flex items-center gap-3 py-3" key={t.id}>
                    <button
                      type="button"
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
        </div>
      )}
    </div>
  );
}

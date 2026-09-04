"use client";
// Painel de histórico/rastreabilidade de um lead — linha do tempo completa (crm_lead_events:
// cadastro, agendamento, mudança de status, transferência, edição, cancelamento, venda) + campo
// pra adicionar observações novas (2026-09-04, pedido do Felipe). Componente COMPARTILHADO entre
// a aba Leads (LeadsTab, ver ConsorcioDashboard.js) e o Pipeline (Kanban, ver Pipeline.js) — um
// painel só, não duas versões divergentes. Top-level/standalone de propósito (não aninhado dentro
// de outro componente): função-componente redefinida a cada render do pai perde a identidade pro
// React e remonta tudo por dentro — mesmo bug já corrigido em DistributionFields/PeriodoFilterField.
import { useState, useEffect } from "react";
import { Phone, X, Loader2, PhoneCall, CalendarPlus, ArrowLeftRight, Trash2, Pencil, CheckCircle2, XCircle, Handshake, Clock, MessageSquare, PhoneOff } from "lucide-react";
import { supabase } from "./supabaseClient";
import { formatBRL } from "./scoring";
import { useSavedNotice } from "./SavedNotice";
import SelectField from "./SelectField";
import { CurrencyInput, ClearableDateInput } from "./MaskedInputs";

const STATUS_LABEL = { novo: "Novo", agendado: "Agendado", follow_up: "Follow-up", perdido: "Perdido", sem_contato: "Sem contato", vendido: "Vendido", vendido_pendente: "Aguardando confirmação", cancelado: "Cancelado", em_negociacao: "Em negociação" };

const STATUS_CHIP = {
  novo: "bg-line text-muted",
  agendado: "bg-blue/15 text-blue",
  follow_up: "bg-warn/15 text-warn",
  perdido: "bg-danger/15 text-danger",
  vendido: "bg-success/15 text-success",
  vendido_pendente: "bg-orange/15 text-orange",
  cancelado: "bg-line text-muted line-through",
  em_negociacao: "bg-teal/15 text-teal",
  sem_contato: "bg-[rgba(100,116,139,0.14)] text-[#475569]",
};

function fmtAgendamento(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function leadEventIcon(ev) {
  if (ev.event_type === "nota") return MessageSquare;
  if (ev.event_type === "cadastro") return PhoneCall;
  if (ev.event_type === "agendamento") return CalendarPlus;
  if (ev.event_type === "transferencia") return ArrowLeftRight;
  if (ev.event_type === "cancelamento") return Trash2;
  if (ev.event_type === "edicao") return Pencil;
  if (ev.to_status === "vendido") return CheckCircle2;
  if (ev.from_status === "vendido_pendente" && ev.to_status !== "vendido") return XCircle;
  if (ev.to_status === "em_negociacao") return Handshake;
  if (ev.to_status === "perdido" || ev.to_status === "sem_contato") return XCircle;
  return Clock;
}

function leadEventTitle(ev, namesById) {
  if (ev.event_type === "nota") return "Observação adicionada";
  if (ev.event_type === "cadastro") return "Cliente cadastrado";
  if (ev.event_type === "agendamento") return `Agendado${ev.agendamento_at ? ` para ${fmtAgendamento(ev.agendamento_at)}` : ""}`;
  if (ev.event_type === "transferencia") return `Transferido de ${namesById[ev.from_employee_id] || "—"} para ${namesById[ev.to_employee_id] || "—"}`;
  if (ev.event_type === "cancelamento") return "Lead cancelado";
  if (ev.event_type === "edicao") return `Dados editados${ev.changed_fields ? ` (${ev.changed_fields})` : ""}`;
  if (ev.event_type === "status_change") {
    if (ev.to_status === "vendido") return "Venda confirmada";
    if (ev.from_status === "vendido_pendente" && ev.to_status !== "vendido") return "Venda recusada";
    return `Marcado como ${STATUS_LABEL[ev.to_status] || ev.to_status}`;
  }
  return "Atualização";
}

export default function LeadHistoryPanel({ lead, onClose, canManage = false, produtoCategorias = [], onChanged }) {
  const notifySaved = useSavedNotice();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState({});
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");

  // Mudar etapa direto do painel (2026-09, pedido do Felipe: "ao clicar no ícone de histórico,
  // também precisa dar pra mudar a etapa do lead"). Mesma lógica/regras de sempre (agendar pede
  // data/hora, vendido pede valor+categoria, perdido a partir de "novo" pergunta se teve contato)
  // — copiada de Pipeline.js de propósito, mesmo padrão de duplicação já usado no resto do app pra
  // não arriscar acoplar componentes que precisam continuar funcionando isolados. `currentLead`
  // existe pra badge/botões refletirem a mudança na hora, sem esperar o pai recarregar a lista.
  // Sincroniza durante o render (não num useEffect) de propósito: um efeito só roda DEPOIS do
  // commit, então no primeiro render logo depois de abrir um lead `currentLead` ainda estaria
  // com o valor antigo (ou null, se o painel tivesse acabado de montar) enquanto `lead` já é o
  // novo — `currentLead.status` explodiria com "Cannot read properties of null" nesse frame.
  // Padrão oficial do React pra "ajustar estado quando uma prop muda" evita esse flash/crash.
  const [currentLead, setCurrentLead] = useState(lead);
  const [syncedLeadId, setSyncedLeadId] = useState(lead?.id ?? null);
  if ((lead?.id ?? null) !== syncedLeadId) {
    setSyncedLeadId(lead?.id ?? null);
    setCurrentLead(lead);
  }

  const [agendarOpen, setAgendarOpen] = useState(false);
  const [agendarData, setAgendarData] = useState("");
  const [agendarHora, setAgendarHora] = useState("");
  const [agendarSaving, setAgendarSaving] = useState(false);
  const [agendarError, setAgendarError] = useState("");

  const [resolveType, setResolveType] = useState(null); // "em_negociacao" | "follow_up" | "vendido" | "perdido"
  const [resolveFeedback, setResolveFeedback] = useState("");
  const [resolveValor, setResolveValor] = useState("");
  const [resolveCategoriaId, setResolveCategoriaId] = useState("");
  const [resolveObs, setResolveObs] = useState("");
  const [resolveSaving, setResolveSaving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [resolveContatoFeito, setResolveContatoFeito] = useState(false);

  function openAgendar() {
    setAgendarOpen(true);
    setAgendarData("");
    setAgendarHora("");
    setAgendarError("");
  }

  async function confirmAgendar() {
    if (!agendarData || !agendarHora) return;
    setAgendarSaving(true);
    setAgendarError("");
    const agendamentoAt = new Date(`${agendarData}T${agendarHora}:00`).toISOString();
    const { error } = await supabase
      .from("crm_leads")
      .update({ agendamento_at: agendamentoAt, status: "agendado", valor: null, updated_at: new Date().toISOString() })
      .eq("id", currentLead.id);
    setAgendarSaving(false);
    if (!error) {
      setAgendarOpen(false);
      setCurrentLead((c) => ({ ...c, status: "agendado", agendamento_at: agendamentoAt, valor: null }));
      notifySaved("Agendamento salvo com sucesso.");
      onChanged && onChanged();
      load();
    } else {
      setAgendarError("Não foi possível salvar. Tente novamente em alguns instantes.");
    }
  }

  function openResolve(type) {
    setResolveType(type);
    setResolveFeedback(currentLead.feedback || "");
    setResolveValor(type === "vendido" || type === "em_negociacao" ? (currentLead.valor != null ? String(currentLead.valor) : "") : "");
    setResolveCategoriaId("");
    setResolveObs(currentLead.observacoes || "");
    setResolveError("");
    setResolveContatoFeito(false);
  }

  async function confirmResolve() {
    if (!resolveType) return;
    setResolveSaving(true);
    setResolveError("");
    let patch;
    if (resolveType === "vendido") {
      if (resolveValor === "" || Number(resolveValor) <= 0 || !resolveCategoriaId) {
        setResolveSaving(false);
        return;
      }
      patch = {
        status: "vendido_pendente",
        valor: Number(resolveValor),
        categoria_produto_id: resolveCategoriaId,
        observacoes: resolveObs.trim() || null,
        venda_revisada_por: null,
        venda_revisada_em: null,
        venda_motivo_recusa: null,
        updated_at: new Date().toISOString(),
      };
    } else if (resolveType === "em_negociacao") {
      patch = {
        status: "em_negociacao",
        valor: resolveValor === "" ? null : Number(resolveValor),
        feedback: resolveFeedback.trim() || null,
        updated_at: new Date().toISOString(),
      };
    } else {
      const finalStatus = resolveType === "perdido" && currentLead.status === "novo" ? (resolveContatoFeito ? "perdido" : "sem_contato") : resolveType;
      patch = { status: finalStatus, valor: null, feedback: resolveFeedback.trim() || null, updated_at: new Date().toISOString() };
    }
    const { error } = await supabase.from("crm_leads").update(patch).eq("id", currentLead.id);
    setResolveSaving(false);
    if (!error) {
      setResolveType(null);
      setCurrentLead((c) => ({ ...c, ...patch }));
      notifySaved("Lead atualizado com sucesso.");
      onChanged && onChanged();
      load();
    } else {
      setResolveError("Não foi possível salvar. Tente novamente em alguns instantes.");
    }
  }

  async function load() {
    if (!lead) return;
    setLoading(true);
    setNoteError("");
    const { data: rows } = await supabase
      .from("crm_lead_events")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false });
    const list = rows || [];
    const ids = new Set();
    list.forEach((e) => {
      if (e.actor_id) ids.add(e.actor_id);
      if (e.from_employee_id) ids.add(e.from_employee_id);
      if (e.to_employee_id) ids.add(e.to_employee_id);
    });
    let namesMap = {};
    if (ids.size) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(ids));
      (profs || []).forEach((p) => { namesMap[p.id] = p.full_name; });
    }
    setNames(namesMap);
    setEvents(list);
    setLoading(false);
  }

  useEffect(() => {
    setNoteText("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  async function addNote(e) {
    e.preventDefault();
    if (!noteText.trim() || !lead) return;
    setSavingNote(true);
    setNoteError("");
    // Identidade sempre resolvida pela sessão real (auth.uid()), nunca por um id vindo de prop —
    // mesmo padrão de app/api/account/update-username/route.js. Necessário porque a RLS de INSERT
    // exige actor_id = auth.uid(): num "ver como" (Master Admin visualizando como outra pessoa),
    // um viewerId vindo de props seria o ID de quem está sendo visto, não de quem está de fato
    // logado — a gravação seria rejeitada (bug real reportado pelo Felipe, print do Pipeline).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSavingNote(false);
      setNoteError("Sessão expirada — recarregue a página e tente de novo.");
      return;
    }
    const { error } = await supabase.from("crm_lead_events").insert({
      lead_id: lead.id,
      empresa_id: lead.empresa_id,
      loja_id: lead.loja_id,
      event_type: "nota",
      observacoes: noteText.trim(),
      actor_id: session.user.id,
    });
    setSavingNote(false);
    if (error) {
      setNoteError("Não foi possível salvar: " + error.message);
      return;
    }
    setNoteText("");
    notifySaved("Observação adicionada.");
    load();
  }

  if (!lead) return null;

  // Mesma trava de sempre (ManagerLeadRow/Pipeline.js): vendido/vendido_pendente/cancelado não
  // aceitam nova ação; perdido só pode ser revivido via "Agendar" (reagendar), não tem "resolver".
  const canAgendarLead = currentLead.status !== "vendido" && currentLead.status !== "vendido_pendente" && currentLead.status !== "cancelado";
  const canResolveLead = canAgendarLead && currentLead.status !== "perdido";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navyfixed/70 p-6">
      <div className="card max-w-lg w-full max-h-[85vh] overflow-y-auto animate-bounce-in">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-navy truncate">{lead.nome_completo}</h2>
            <p className="text-xs text-muted mt-1 flex items-center gap-1"><Phone size={12} /> {lead.telefone}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-navy shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <span className={`badge !text-[10px] mt-2 inline-block ${STATUS_CHIP[currentLead.status] || STATUS_CHIP.novo}`}>
          {STATUS_LABEL[currentLead.status] || currentLead.status}
        </span>

        {canManage && (canAgendarLead || canResolveLead) && (
          <div className="mt-4">
            <p className="label mb-2">Mudar etapa</p>
            <div className="flex flex-wrap gap-1.5">
              {canAgendarLead && (
                <button type="button" onClick={openAgendar} className="btn-outline !py-1.5 !px-3 !text-[11px] !border-blue !text-blue hover:!bg-blue hover:!text-white">
                  <CalendarPlus size={13} /> Agendar
                </button>
              )}
              {canResolveLead && (
                <>
                  <button type="button" onClick={() => openResolve("em_negociacao")} className="btn-outline !py-1.5 !px-3 !text-[11px] !border-teal !text-teal hover:!bg-teal hover:!text-white">
                    <Handshake size={13} /> Em negociação
                  </button>
                  <button type="button" onClick={() => openResolve("follow_up")} className="btn-outline !py-1.5 !px-3 !text-[11px] !border-warn !text-warn hover:!bg-warn hover:!text-white">
                    <Clock size={13} /> Follow-up
                  </button>
                  <button type="button" onClick={() => openResolve("vendido")} className="btn-outline !py-1.5 !px-3 !text-[11px] !border-success !text-success hover:!bg-success hover:!text-white">
                    <CheckCircle2 size={13} /> Vendido
                  </button>
                  <button type="button" onClick={() => openResolve("perdido")} className="btn-outline !py-1.5 !px-3 !text-[11px] !border-danger !text-danger hover:!bg-danger hover:!text-white">
                    <XCircle size={13} /> Perdido
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <form onSubmit={addNote} className="mt-5">
          <label className="label">Adicionar observação</label>
          <textarea
            className="input"
            rows={2}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Ex: cliente pediu pra retornar semana que vem…"
          />
          {noteError && <p className="text-xs font-bold text-danger mt-1.5">{noteError}</p>}
          <button type="submit" className="btn-outline !py-1.5 !text-xs mt-2" disabled={savingNote || !noteText.trim()}>
            {savingNote ? "Salvando…" : "Adicionar observação"}
          </button>
        </form>

        <p className="label mt-5 mb-3">Histórico</p>
        {loading ? (
          <p className="text-xs text-muted py-6 text-center flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</p>
        ) : events.length === 0 ? (
          <p className="text-xs text-muted py-4">Sem histórico registrado ainda — esse lead foi cadastrado ou editado antes desse recurso existir, ou ainda não teve nenhuma movimentação.</p>
        ) : (
          <div>
            {events.map((ev, i) => {
              const Icon = leadEventIcon(ev);
              const isLast = i === events.length - 1;
              return (
                <div key={ev.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-paper border border-line flex items-center justify-center shrink-0">
                      <Icon size={13} className="text-navy" />
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-line" />}
                  </div>
                  <div className={`min-w-0 ${isLast ? "pb-1" : "pb-4"}`}>
                    <p className="text-xs font-bold text-navy">{leadEventTitle(ev, names)}</p>
                    {ev.event_type === "nota" ? (
                      <p className="text-[11px] text-navy mt-0.5">{ev.observacoes}</p>
                    ) : (
                      (ev.feedback || ev.observacoes) && (
                        <p className="text-[11px] text-muted mt-0.5">&ldquo;{ev.feedback || ev.observacoes}&rdquo;</p>
                      )
                    )}
                    {ev.motivo && <p className="text-[11px] text-danger mt-0.5">Motivo: {ev.motivo}</p>}
                    {ev.valor != null && <p className="text-[11px] font-bold text-gold mt-0.5">{formatBRL(ev.valor)}</p>}
                    <p className="text-[10px] text-muted/80 mt-1">{names[ev.actor_id] || "—"} · {fmtAgendamento(ev.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {agendarOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navyfixed/70 p-6">
          <div className="card max-w-sm w-full animate-bounce-in border-blue/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><CalendarPlus className="text-blue" size={20} /> Agendar</h2>
            <p className="text-xs text-muted mt-1">{currentLead.nome_completo}</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Data</label>
                <ClearableDateInput value={agendarData} onChange={(v) => { setAgendarData(v); if (!v) setAgendarHora(""); }} />
              </div>
              <div>
                <label className="label">Hora</label>
                <input type="time" className="input date-input" value={agendarHora} onChange={(e) => setAgendarHora(e.target.value)} />
              </div>
            </div>
            {agendarError && <p className="text-xs font-bold text-danger mt-3">{agendarError}</p>}
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setAgendarOpen(false)}>Cancelar</button>
              <button className="btn flex-1" disabled={agendarSaving || !agendarData || !agendarHora} onClick={confirmAgendar}>{agendarSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {resolveType && resolveType !== "vendido" && resolveType !== "em_negociacao" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navyfixed/70 p-6">
          <div className="card max-w-sm w-full animate-bounce-in border-gold/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2">
              {resolveType === "perdido" ? <XCircle className="text-danger" size={20} /> : <Clock className="text-warn" size={20} />}
              Marcar como {STATUS_LABEL[resolveType].toLowerCase()}
            </h2>
            <p className="text-xs text-muted mt-1">{currentLead.nome_completo}</p>
            {resolveType === "perdido" && currentLead.status === "novo" && (
              <div className="mt-4 rounded-xl bg-paper border border-line p-3">
                <p className="text-xs font-bold text-navy mb-2">Conseguiu falar com o cliente?</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-navy cursor-pointer">
                    <input type="radio" name="historyContatoFeito" checked={!resolveContatoFeito} onChange={() => setResolveContatoFeito(false)} />
                    Não, nunca consegui contato
                  </label>
                  <label className="flex items-center gap-2 text-xs text-navy cursor-pointer">
                    <input type="radio" name="historyContatoFeito" checked={resolveContatoFeito} onChange={() => setResolveContatoFeito(true)} />
                    Sim, falei mas não teve interesse
                  </label>
                </div>
              </div>
            )}
            <div className="mt-4">
              <label className="label">Feedback</label>
              <textarea className="input" rows={3} value={resolveFeedback} onChange={(e) => setResolveFeedback(e.target.value)} placeholder="O que aconteceu?" />
            </div>
            {resolveError && <p className="text-xs font-bold text-danger mt-3">{resolveError}</p>}
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setResolveType(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={resolveSaving} onClick={confirmResolve}>{resolveSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {resolveType === "em_negociacao" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navyfixed/70 p-6">
          <div className="card max-w-sm w-full animate-bounce-in border-teal/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><Handshake className="text-teal" size={20} /> Marcar como em negociação</h2>
            <p className="text-xs text-muted mt-1">{currentLead.nome_completo}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="label">Valor sendo negociado (opcional)</label>
                <CurrencyInput value={resolveValor} onChange={setResolveValor} />
              </div>
              <div>
                <label className="label">Feedback</label>
                <textarea className="input" rows={2} value={resolveFeedback} onChange={(e) => setResolveFeedback(e.target.value)} placeholder="Como está andando a negociação?" />
              </div>
            </div>
            {resolveError && <p className="text-xs font-bold text-danger mt-3">{resolveError}</p>}
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setResolveType(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={resolveSaving} onClick={confirmResolve}>{resolveSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {resolveType === "vendido" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navyfixed/70 p-6">
          <div className="card max-w-sm w-full max-h-[85vh] overflow-y-auto animate-bounce-in border-success/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><CheckCircle2 className="text-success" size={20} /> Marcar como vendido</h2>
            <p className="text-xs text-muted mt-1">{currentLead.nome_completo}</p>
            <p className="text-[11px] text-muted mt-1">Fica aguardando o Administrativo aprovar — não vira venda de verdade ainda.</p>
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
                <textarea className="input" rows={3} value={resolveObs} onChange={(e) => setResolveObs(e.target.value)} placeholder="Detalhes da venda (opcional)" />
              </div>
            </div>
            {resolveError && <p className="text-xs font-bold text-danger mt-3">{resolveError}</p>}
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setResolveType(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={resolveSaving} onClick={confirmResolve}>{resolveSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

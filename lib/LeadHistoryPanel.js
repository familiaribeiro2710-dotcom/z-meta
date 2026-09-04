"use client";
// Painel de histórico/rastreabilidade de um lead — linha do tempo completa (crm_lead_events:
// cadastro, agendamento, mudança de status, transferência, edição, cancelamento, venda) + campo
// pra adicionar observações novas (2026-09-04, pedido do Felipe). Componente COMPARTILHADO entre
// a aba Leads (LeadsTab, ver ConsorcioDashboard.js) e o Pipeline (Kanban, ver Pipeline.js) — um
// painel só, não duas versões divergentes. Top-level/standalone de propósito (não aninhado dentro
// de outro componente): função-componente redefinida a cada render do pai perde a identidade pro
// React e remonta tudo por dentro — mesmo bug já corrigido em DistributionFields/PeriodoFilterField.
import { useState, useEffect } from "react";
import { Phone, X, Loader2, PhoneCall, CalendarPlus, ArrowLeftRight, Trash2, Pencil, CheckCircle2, XCircle, Handshake, Clock, MessageSquare } from "lucide-react";
import { supabase } from "./supabaseClient";
import { formatBRL } from "./scoring";
import { useSavedNotice } from "./SavedNotice";

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

export default function LeadHistoryPanel({ lead, onClose }) {
  const notifySaved = useSavedNotice();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState({});
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");

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
        <span className={`badge !text-[10px] mt-2 inline-block ${STATUS_CHIP[lead.status] || STATUS_CHIP.novo}`}>
          {STATUS_LABEL[lead.status] || lead.status}
        </span>

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
    </div>
  );
}

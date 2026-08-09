"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, CalendarPlus, XCircle, Clock, Handshake, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { supabase } from "./supabaseClient";
import Avatar from "./Avatar";
import SelectField from "./SelectField";
import { CurrencyInput } from "./MaskedInputs";
import { formatBRL } from "./scoring";
import { useSavedNotice } from "./SavedNotice";

// 2026-08-08 — aba Pipeline (pedido do Felipe): visão em quadro (Kanban) do funil de leads,
// arrastar o card entre colunas em vez de clicar em botão. Só existe em telas desktop (a própria
// aba já vem escondida no mobile via `hideOnMobile` em AppShell.js — este componente nem monta lá).
//
// Componente 100% autocontido de propósito (mesmo padrão de LeadsTab/VendasTab em
// GerenteViewConsorcio.js e AdministrativoView.js): busca os próprios leads via employeeIds OU
// lojaId, sem depender do estado interno de quem o usa. Isso permite plugar o Pipeline em 5 telas
// diferentes (gerente, supervisor/sócio/master, administrativo, colaborador) só variando o escopo
// da query, sem duplicar a lógica de quadro/drag em cada uma.
//
// Regras de arraste (mesmas guardas que já existem no Funil de ConsorcioDashboard.js/
// ColaboradorViewConsorcio.js — não são reinventadas aqui, só viram destino de "soltar o card" em
// vez de clique de botão):
// - Nunca dá pra arrastar PARA "Vendido" — ninguém faz esse pulo. O card só chega lá sozinho quando
//   o Administrativo aprova em outro lugar (aba Vendas) e o quadro atualiza na atualização automática.
// - Soltar em "Aguardando confirmação" abre o mesmo modal de valor+categoria que o botão "Vendido"
//   já abria — e por baixo continua gravando status 'vendido_pendente', nunca 'vendido' direto.
// - Soltar em "Agendado" abre o mesmo modal de data/hora de sempre.
// - Card em "Aguardando confirmação"/"Vendido"/"Cancelado" não é arrastável (mesma trava de
//   canAgendar/canResolve do ManagerLeadRow).
// - Card em "Perdido" só pode ser arrastado de volta pra "Agendado" (reviver o lead).
//
// Atualização automática: por foco de aba + intervalo (não é tempo real via realtime/websocket —
// decisão explícita do Felipe, mais simples de manter). Cobre tanto mudança feita aqui quanto em
// qualquer outro lugar do sistema (funil, tela do colaborador, aprovação do administrativo).
const AUTO_REFRESH_MS = 25000;

const STATUS_LABEL = {
  novo: "Novo",
  agendado: "Agendado",
  follow_up: "Follow-up",
  perdido: "Perdido",
  vendido_pendente: "Aguardando confirmação",
  vendido: "Vendido",
  em_negociacao: "Em negociação",
};

// 2026-08-08 (pedido do Felipe, aprovado por mockup): cor de destaque por etapa — mesma paleta que
// já existe hoje nos chips de status do Funil (STATUS_CHIP_DARK em ConsorcioDashboard.js/
// GerenteViewConsorcio.js/AdministrativoView.js), só reaplicada aqui como acento de coluna em vez
// de chip de linha. "Novo" fica neutro de propósito (não é bom nem ruim, só ainda não trabalhado).
const COLUMN_COLOR = {
  novo: "#7d7a6f",
  agendado: "#2563eb",
  follow_up: "#d97706",
  em_negociacao: "#0d9488",
  vendido_pendente: "#f97316",
  vendido: "#16a34a",
  perdido: "#dc2626",
};

function baseColumns() {
  return [
    { key: "novo", label: "Novo" },
    { key: "agendado", label: "Agendado" },
    { key: "follow_up", label: "Follow-up" },
    { key: "em_negociacao", label: "Em negociação" },
    { key: "vendido_pendente", label: "Aguardando confirmação" },
    { key: "vendido", label: "Vendido" },
  ];
}

function isDraggable(lead) {
  return lead.status !== "vendido" && lead.status !== "vendido_pendente" && lead.status !== "cancelado";
}

function validDropTargets(lead) {
  if (!lead) return [];
  if (lead.status === "perdido") return ["agendado"];
  return ["agendado", "follow_up", "em_negociacao", "vendido_pendente", "perdido"];
}

function fmtAgendamento(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function Pipeline({ employeeIds, lojaId, employees = [], empresaId, canManage = false, showResponsavel = true }) {
  const notifySaved = useSavedNotice();
  const [leads, setLeads] = useState([]);
  const [produtoCategorias, setProdutoCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPerdido, setShowPerdido] = useState(false);
  const empScopeKey = (employeeIds || []).join(",");

  const employeeNameById = {};
  employees.forEach((e) => { employeeNameById[e.id] = e.full_name; });

  const loadLeads = useCallback(async () => {
    let query = supabase.from("crm_leads").select("*").order("created_at", { ascending: false });
    if (employeeIds && employeeIds.length) query = query.in("employee_id", employeeIds);
    else if (lojaId) query = query.eq("loja_id", lojaId);
    else { setLeads([]); setLoading(false); return; }
    const { data } = await query;
    setLeads(data || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empScopeKey, lojaId]);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      const { data } = await supabase.from("consorcio_produto_categorias").select("*").eq("empresa_id", empresaId).eq("active", true).order("nome");
      setProdutoCategorias(data || []);
    })();
  }, [empresaId]);

  // Atualização automática (não realtime): recarrega ao montar, a cada AUTO_REFRESH_MS, e toda vez
  // que a aba do navegador ganha foco de novo — cobre "mudou em qualquer outro lugar do sistema".
  useEffect(() => {
    setLoading(true);
    loadLeads();
    const interval = setInterval(loadLeads, AUTO_REFRESH_MS);
    function onFocus() { loadLeads(); }
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [loadLeads]);

  // ---- agendar / resolver (mesma lógica/modais do Funil em ConsorcioDashboard.js, copiada de
  // propósito em vez de importada — Pipeline precisa ficar isolado, mesmo padrão de duplicação já
  // usado entre ColaboradorViewConsorcio.js/GerenteViewConsorcio.js/ConsorcioDashboard.js pra não
  // arriscar quebrar o Funil, que já funciona, ao mexer aqui) ----
  const [agendarModal, setAgendarModal] = useState(null);
  const [agendarData, setAgendarData] = useState("");
  const [agendarHora, setAgendarHora] = useState("");
  const [agendarSaving, setAgendarSaving] = useState(false);

  const [resolveModal, setResolveModal] = useState(null); // { lead, type }
  const [resolveFeedback, setResolveFeedback] = useState("");
  const [resolveValor, setResolveValor] = useState("");
  const [resolveCategoriaId, setResolveCategoriaId] = useState("");
  const [resolveObs, setResolveObs] = useState("");
  const [resolveSaving, setResolveSaving] = useState(false);

  function openAgendar(lead) {
    setAgendarModal(lead);
    setAgendarData("");
    setAgendarHora("");
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
      await loadLeads();
    }
  }

  function openResolve(lead, type) {
    setResolveModal({ lead, type });
    setResolveFeedback(lead.feedback || "");
    setResolveValor(type === "vendido" || type === "em_negociacao" ? (lead.valor != null ? String(lead.valor) : "") : "");
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
      // Nenhuma venda fecha direto daqui — vira 'vendido_pendente' até o Administrativo confirmar
      // na aba Vendas. É esse mesmo evento (aprovar lá) que faz o card "pular" pra Vendido aqui.
      ({ error } = await supabase
        .from("crm_leads")
        .update({
          status: "vendido_pendente",
          valor: Number(resolveValor),
          categoria_produto_id: resolveCategoriaId,
          observacoes: resolveObs.trim() || null,
          venda_revisada_por: null,
          venda_revisada_em: null,
          venda_motivo_recusa: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id));
    } else if (type === "em_negociacao") {
      ({ error } = await supabase
        .from("crm_leads")
        .update({
          status: "em_negociacao",
          valor: resolveValor === "" ? null : Number(resolveValor),
          feedback: resolveFeedback.trim() || null,
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
      await loadLeads();
    }
  }

  // ---- drag and drop nativo (desktop only, sem lib nova) ----
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const draggingLead = leads.find((l) => l.id === draggingId) || null;

  function handleDrop(colKey) {
    const lead = draggingLead;
    setDraggingId(null);
    setDragOverCol(null);
    if (!lead || !validDropTargets(lead).includes(colKey) || colKey === lead.status) return;
    if (colKey === "agendado") openAgendar(lead);
    else if (colKey === "vendido_pendente") openResolve(lead, "vendido");
    else openResolve(lead, colKey);
  }

  if (loading) {
    return <p className="text-xs text-muted py-10 text-center">carregando…</p>;
  }

  const columns = [...baseColumns()];
  if (showPerdido) columns.splice(4, 0, { key: "perdido", label: "Perdido" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowPerdido((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted hover:text-navy border border-line rounded-full px-3 py-1.5 bg-white transition-colors"
        >
          {showPerdido ? <EyeOff size={12} /> : <Eye size={12} />}
          {showPerdido ? "Ocultar Perdido" : "Mostrar Perdido"}
        </button>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-muted">
          <RefreshCw size={11} /> atualiza sozinho
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {columns.map((col) => {
          const cards = leads.filter((l) => l.status === col.key);
          const isValidTarget = draggingLead && validDropTargets(draggingLead).includes(col.key) && col.key !== draggingLead.status;
          const isHover = dragOverCol === col.key && isValidTarget;
          const color = COLUMN_COLOR[col.key] || "#7d7a6f";
          return (
            <div key={col.key} className="min-w-[220px] flex-1">
              <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg" style={{ background: `${color}1f` }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-[11px] font-extrabold text-navy uppercase tracking-wide truncate">{col.label}</span>
                <span className="ml-auto text-[10px] font-bold shrink-0" style={{ color }}>{cards.length}</span>
              </div>
              <div
                onDragOver={(e) => { if (isValidTarget) { e.preventDefault(); setDragOverCol(col.key); } }}
                onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                onDrop={(e) => { e.preventDefault(); handleDrop(col.key); }}
                className={`rounded-2xl p-2 min-h-[80px] space-y-2 transition-colors ${isHover ? "bg-gold/15 border-2 border-dashed border-gold" : "bg-paper border-2 border-dashed border-transparent"}`}
              >
                {cards.length === 0 && <p className="text-[11px] text-muted text-center py-4">Nenhum lead aqui</p>}
                {cards.map((lead) => {
                  const draggable = canManage && isDraggable(lead);
                  return (
                    <div
                      key={lead.id}
                      draggable={draggable}
                      onDragStart={() => setDraggingId(lead.id)}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                      className={`card-dark !p-2.5 !rounded-xl ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
                      style={{ borderLeft: `3px solid ${color}` }}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={lead.nome_completo} size={24} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{lead.nome_completo}</p>
                          {showResponsavel && <p className="text-[10px] text-goldlight truncate">{employeeNameById[lead.employee_id] || "—"}</p>}
                        </div>
                      </div>
                      {col.key === "agendado" && lead.agendamento_at && (
                        <p className="text-[10px] text-bluelight mt-1.5">{fmtAgendamento(lead.agendamento_at)}</p>
                      )}
                      {(col.key === "em_negociacao" || col.key === "vendido_pendente" || col.key === "vendido") && lead.valor != null && (
                        <p className="text-[10px] font-bold text-goldlight mt-1.5">{formatBRL(lead.valor)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {agendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full animate-bounce-in border-blue/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><CalendarPlus className="text-blue" size={20} /> Agendar</h2>
            <p className="text-xs text-muted mt-1">{agendarModal.nome_completo}</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {resolveModal && resolveModal.type !== "vendido" && resolveModal.type !== "em_negociacao" && (
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

      {resolveModal && resolveModal.type === "em_negociacao" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full animate-bounce-in border-teal/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><Handshake className="text-teal" size={20} /> Marcar como em negociação</h2>
            <p className="text-xs text-muted mt-1">{resolveModal.lead.nome_completo}</p>
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
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setResolveModal(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={resolveSaving} onClick={confirmResolve}>{resolveSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

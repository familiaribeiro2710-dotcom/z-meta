"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, CalendarPlus, XCircle, Clock, Handshake, CheckCircle2, RotateCcw, PhoneOff } from "lucide-react";
import { supabase } from "./supabaseClient";
import Avatar from "./Avatar";
import SelectField from "./SelectField";
import { CurrencyInput } from "./MaskedInputs";
import { formatBRL } from "./scoring";
import { useSavedNotice } from "./SavedNotice";

// 2026-08-08 — aba Pipeline (pedido do Felipe): visão em quadro (Kanban) do funil de leads,
// arrastar o card entre colunas em vez de clicar em botão. Escondida em telas pequenas
// (hideOnMobile em AppShell.js) — este componente nem monta lá. 2026-08-09: passou a aparecer
// também em tablet (iPad) na horizontal, não só desktop de verdade (ver AppShell.js — regra agora
// é largura≥1024px E orientação paisagem, não só largura).
//
// 2026-08-09 (pedido do Felipe, iPad): o Safari do iPad (iPadOS 15+) só dispara o evento NATIVO de
// arrastar (`draggable`/`dragstart`/`onDrop`) com mouse, trackpad ou Apple Pencil — dedo não
// funciona, limitação do WebKit, não dá pra contornar com o HTML5 DnD puro. Por isso o card
// arrastável também escuta `onTouchStart/onTouchMove/onTouchEnd` e reimplementa o arraste na mão:
// segue o dedo com `transform: translate3d` e usa `document.elementFromPoint` (mirado no atributo
// `data-col-key` de cada coluna) pra descobrir em qual coluna o dedo está solto. As duas vias
// (mouse/trackpad via DnD nativo, dedo via touch simulado) convergem pra mesma função `moveLeadTo`,
// que abre o mesmo modal de confirmação de sempre (data/hora, feedback, valor) — nada muda de
// status sem esse passo. Primeira tentativa tinha um botão "Mover para" (toque abria uma lista de
// destinos) como alternativa ao arraste — removido a pedido do Felipe ("ficou poluído"), ele queria
// arrastar de verdade, não um menu de botões.
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
// 2026-08-10 (pedido do Felipe): novo status "Sem contato", separado de "Perdido" — quando um
// lead ainda em "Novo" (nunca teve nenhuma movimentação) é marcado como perdido, o sistema grava
// 'sem_contato' em vez de 'perdido' automaticamente, sem pedir nada extra pro colaborador (a
// decisão de "de onde ele estava" já basta). Isso acontece dentro de `openResolve` — todo o resto
// do fluxo (botão, modal, drag) continua igual, só o status final gravado muda. Se o lead já tinha
// saído de "Novo" (agendado, follow-up, em negociação) antes de ser marcado perdido, vai pro
// "Perdido" de sempre — a régua olha só o status NO MOMENTO do clique, não o histórico completo.
// "Sem contato" não é um destino de arraste manual (não aparece em `validDropTargets` como opção
// direta) — só é alcançado por essa rota automática a partir de "Novo", igual "Perdido" só pode
// voltar pra "Agendado" (reviver).
//
// 2026-08-11 (pedido do Felipe): cada coluna rola por dentro dela mesma (`max-h-[65vh]
// overflow-y-auto` no container dos cards) em vez de empurrar a página inteira pra baixo conforme
// os leads acumulam — mesmo padrão de qualquer quadro Kanban (Trello, Jira). O quadro continua
// "de relance" mesmo com uma coluna cheia; só ela ganha barra de rolagem própria.
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
  sem_contato: "Sem contato",
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
  sem_contato: "#64748b",
};

function baseColumns() {
  // 2026-08-12 (pedido do Felipe): "Sem contato" e "Perdido" deixaram de ficar atrás do toggle
  // "Mostrar perdidos" (removido) — agora são colunas fixas, sempre visíveis, no fim da sequência
  // (são desfechos terminais negativos, não etapas de progresso do funil; "Sem contato" antes de
  // "Perdido" porque é logicamente mais leve — nunca houve contato — que um lead que chegou a
  // avançar e foi perdido depois).
  return [
    { key: "novo", label: "Novo" },
    { key: "agendado", label: "Agendado" },
    { key: "follow_up", label: "Follow-up" },
    { key: "em_negociacao", label: "Em negociação" },
    { key: "vendido_pendente", label: "Aguardando confirmação" },
    { key: "vendido", label: "Vendido" },
    { key: "sem_contato", label: "Sem contato" },
    { key: "perdido", label: "Perdido" },
  ];
}

function isDraggable(lead) {
  return lead.status !== "vendido" && lead.status !== "vendido_pendente" && lead.status !== "cancelado";
}

function validDropTargets(lead) {
  if (!lead) return [];
  if (lead.status === "perdido" || lead.status === "sem_contato") return ["agendado"];
  return ["novo", "agendado", "follow_up", "em_negociacao", "vendido_pendente", "perdido"];
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
  const [filterEmployeeId, setFilterEmployeeId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const refreshFlashRef = useRef(null);
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

  // 2026-08-09 (pedido do Felipe): botão de atualizar manual, além do automático acima — mesma
  // função `loadLeads`, com spin no ícone durante a busca e, ao terminar, um check verde piscando
  // por 1,2s (`justRefreshed`) como confirmação visual de que atualizou.
  async function handleManualRefresh() {
    setRefreshing(true);
    await loadLeads();
    setRefreshing(false);
    setJustRefreshed(true);
    if (refreshFlashRef.current) clearTimeout(refreshFlashRef.current);
    refreshFlashRef.current = setTimeout(() => setJustRefreshed(false), 1200);
  }

  useEffect(() => {
    return () => { if (refreshFlashRef.current) clearTimeout(refreshFlashRef.current); };
  }, []);

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
  const [agendarError, setAgendarError] = useState("");
  const [resolveError, setResolveError] = useState("");
  // 2026-08-12 (pedido do Felipe): a conversão automática "novo -> perdido vira sem_contato" tinha
  // um furo — um colaborador pode ligar, CONSEGUIR contato, o cliente não demonstrar interesse, e o
  // lead nunca ter saído de "novo" (não existe etapa intermediária pra "contato feito, ainda
  // decidindo"). Isso cairia errado em "sem contato" mesmo tendo havido contato de verdade. Fix:
  // só perguntar quando é realmente ambíguo (lead ainda em "novo" no momento de marcar perdido) —
  // se já tinha saído de "novo" (agendado/negociação/follow-up), contato já é certeza, continua 100%
  // automático sem perguntar nada. `resolveContatoFeito` default false = "não consegui contato"
  // (mesmo comportamento de antes se o colaborador não mexer no campo).
  const [resolveContatoFeito, setResolveContatoFeito] = useState(false);

  function openAgendar(lead) {
    setAgendarModal(lead);
    setAgendarData("");
    setAgendarHora("");
    setAgendarError("");
  }

  async function confirmAgendar() {
    if (!agendarModal || !agendarData || !agendarHora) return;
    setAgendarSaving(true);
    setAgendarError("");
    // `valor` só pode ficar preenchido em em_negociacao/vendido/vendido_pendente (CHECK
    // crm_leads_vendido_shape_chk) — reagendar a partir de "em negociação" tem que limpar, senão
    // o banco recusa o update (foi exatamente o bug do Fernando Santos de Souza/Canaã: o mesmo
    // problema acontecia ao marcar como perdido a partir de em_negociacao, ver confirmResolve).
    const { error } = await supabase
      .from("crm_leads")
      .update({
        agendamento_at: new Date(`${agendarData}T${agendarHora}:00`).toISOString(),
        status: "agendado",
        valor: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agendarModal.id);
    setAgendarSaving(false);
    if (!error) {
      setAgendarModal(null);
      notifySaved("Agendamento salvo com sucesso.");
      await loadLeads();
    } else {
      setAgendarError("Não foi possível salvar. Tente novamente em alguns instantes.");
    }
  }

  function openResolve(lead, type) {
    setResolveModal({ lead, type });
    setResolveFeedback(lead.feedback || "");
    setResolveValor(type === "vendido" || type === "em_negociacao" ? (lead.valor != null ? String(lead.valor) : "") : "");
    setResolveCategoriaId("");
    setResolveObs(lead.observacoes || "");
    setResolveError("");
    setResolveContatoFeito(false);
  }

  async function confirmResolve() {
    if (!resolveModal) return;
    const { lead, type } = resolveModal;
    setResolveSaving(true);
    setResolveError("");
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
      // status novo/follow_up/perdido: `valor` tem que ir null junto (CHECK crm_leads_vendido_shape_chk
      // só permite valor preenchido em vendido/vendido_pendente/em_negociacao/cancelado) — sem isso o
      // update quebra silenciosamente sempre que o lead vem de "em negociação" com um valor digitado
      // (foi exatamente o bug do Fernando Santos de Souza/Canaã: marcar como perdido a partir de
      // em_negociacao violava a constraint e o "Salvando…" nunca terminava certo).
      // "novo" -> "perdido" só vira "sem_contato" se o colaborador confirmar que NUNCA conseguiu
      // contato (resolveContatoFeito=false, default) — se ele diz que conseguiu falar mas não teve
      // interesse, fica "perdido" mesmo (ver pergunta no modal abaixo).
      const finalStatus = type === "perdido" && lead.status === "novo" ? (resolveContatoFeito ? "perdido" : "sem_contato") : type;
      ({ error } = await supabase
        .from("crm_leads")
        .update({ status: finalStatus, valor: null, feedback: resolveFeedback.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", lead.id));
    }
    setResolveSaving(false);
    if (!error) {
      setResolveModal(null);
      notifySaved("Lead atualizado com sucesso.");
      await loadLeads();
    } else {
      setResolveError("Não foi possível salvar. Tente novamente em alguns instantes.");
    }
  }

  // ---- arraste: DnD nativo (mouse/trackpad/Pencil) + touch simulado (dedo — ver comentário no
  // topo do arquivo). `draggingId`/`dragOverCol` são compartilhados pelas duas vias. ----
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [touchDelta, setTouchDelta] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef(null);
  const draggingLead = leads.find((l) => l.id === draggingId) || null;

  function moveLeadTo(lead, colKey) {
    if (!lead || !validDropTargets(lead).includes(colKey) || colKey === lead.status) return;
    if (colKey === "agendado") openAgendar(lead);
    else if (colKey === "vendido_pendente") openResolve(lead, "vendido");
    else openResolve(lead, colKey);
  }

  function handleDrop(colKey) {
    const lead = draggingLead;
    setDraggingId(null);
    setDragOverCol(null);
    moveLeadTo(lead, colKey);
  }

  function handleTouchStart(e, lead, draggable) {
    if (!draggable) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    setTouchDelta({ x: 0, y: 0 });
    setDraggingId(lead.id);
  }

  function handleTouchMove(e) {
    if (!draggingId || !touchStartRef.current) return;
    const t = e.touches[0];
    setTouchDelta({ x: t.clientX - touchStartRef.current.x, y: t.clientY - touchStartRef.current.y });
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const colEl = el && el.closest("[data-col-key]");
    setDragOverCol(colEl ? colEl.getAttribute("data-col-key") : null);
  }

  function handleTouchEnd() {
    if (!draggingId) return;
    const lead = draggingLead;
    const colKey = dragOverCol;
    setDraggingId(null);
    setDragOverCol(null);
    setTouchDelta({ x: 0, y: 0 });
    touchStartRef.current = null;
    if (colKey) moveLeadTo(lead, colKey);
  }

  if (loading) {
    return <p className="text-xs text-muted py-10 text-center">carregando…</p>;
  }

  const columns = baseColumns();

  const visibleLeads = filterEmployeeId ? leads.filter((l) => l.employee_id === filterEmployeeId) : leads;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {showResponsavel && employees.length > 1 && (
            <SelectField value={filterEmployeeId} onChange={(e) => setFilterEmployeeId(e.target.value)} selectClassName="!text-[11px]">
              <option value="">Todos os colaboradores</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </SelectField>
          )}
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshing}
          title="Atualizar"
          aria-label="Atualizar"
          className={`inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all duration-200 disabled:opacity-70 shrink-0 hover:scale-110 active:scale-90 ${
            justRefreshed ? "border-success/40 bg-success/10 text-success" : "border-line bg-surface text-muted hover:text-navy hover:border-gold/50 hover:bg-paper"
          }`}
        >
          {justRefreshed ? <CheckCircle2 size={13} /> : <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />}
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {columns.map((col) => {
          const cards = visibleLeads.filter((l) => l.status === col.key);
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
                data-col-key={col.key}
                onDragOver={(e) => { if (isValidTarget) { e.preventDefault(); setDragOverCol(col.key); } }}
                onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                onDrop={(e) => { e.preventDefault(); handleDrop(col.key); }}
                className={`rounded-2xl p-2 min-h-[80px] max-h-[65vh] overflow-y-auto space-y-2 transition-colors ${isHover ? "bg-gold/15 border-2 border-dashed border-gold" : "bg-paper border-2 border-dashed border-transparent"}`}
              >
                {cards.length === 0 && <p className="text-[11px] text-muted text-center py-4">Nenhum lead aqui</p>}
                {cards.map((lead) => {
                  const draggable = canManage && isDraggable(lead);
                  const isBeingDragged = draggingId === lead.id;
                  return (
                    <div
                      key={lead.id}
                      draggable={draggable}
                      onDragStart={() => setDraggingId(lead.id)}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                      onTouchStart={(e) => handleTouchStart(e, lead, draggable)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      className={`card-dark !p-2.5 !rounded-xl transition-shadow ${draggable ? "cursor-grab active:cursor-grabbing touch-none" : ""} ${isBeingDragged ? "opacity-90 shadow-xl scale-[1.03]" : ""}`}
                      style={{
                        borderLeft: `3px solid ${color}`,
                        ...(isBeingDragged
                          ? { transform: `translate3d(${touchDelta.x}px, ${touchDelta.y}px, 0)`, position: "relative", zIndex: 50 }
                          : {}),
                      }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navyfixed/70 p-6">
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
                <input type="time" className="input date-input" value={agendarHora} onChange={(e) => setAgendarHora(e.target.value)} />
              </div>
            </div>
            {agendarError && <p className="text-xs font-bold text-danger mt-3">{agendarError}</p>}
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setAgendarModal(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={agendarSaving} onClick={confirmAgendar}>{agendarSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {resolveModal && resolveModal.type !== "vendido" && resolveModal.type !== "em_negociacao" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navyfixed/70 p-6">
          <div className="card max-w-sm w-full animate-bounce-in border-gold/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2">
              {resolveModal.type === "perdido" ? <XCircle className="text-danger" size={20} />
                : resolveModal.type === "sem_contato" ? <PhoneOff className="text-muted" size={20} />
                : resolveModal.type === "novo" ? <RotateCcw className="text-muted" size={20} />
                : <Clock className="text-warn" size={20} />}
              Marcar como {STATUS_LABEL[resolveModal.type].toLowerCase()}
            </h2>
            <p className="text-xs text-muted mt-1">{resolveModal.lead.nome_completo}</p>
            {resolveModal.type === "perdido" && resolveModal.lead.status === "novo" && (
              <div className="mt-4 rounded-xl bg-paper border border-line p-3">
                <p className="text-xs font-bold text-navy mb-2">Conseguiu falar com o cliente?</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-navy cursor-pointer">
                    <input type="radio" name="pipelineContatoFeito" checked={!resolveContatoFeito} onChange={() => setResolveContatoFeito(false)} />
                    Não, nunca consegui contato
                  </label>
                  <label className="flex items-center gap-2 text-xs text-navy cursor-pointer">
                    <input type="radio" name="pipelineContatoFeito" checked={resolveContatoFeito} onChange={() => setResolveContatoFeito(true)} />
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
              <button className="btn-outline flex-1" onClick={() => setResolveModal(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={resolveSaving} onClick={confirmResolve}>{resolveSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {resolveModal && resolveModal.type === "em_negociacao" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navyfixed/70 p-6">
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
            {resolveError && <p className="text-xs font-bold text-danger mt-3">{resolveError}</p>}
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setResolveModal(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={resolveSaving} onClick={confirmResolve}>{resolveSaving ? "Salvando…" : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {resolveModal && resolveModal.type === "vendido" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navyfixed/70 p-6">
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
            {resolveError && <p className="text-xs font-bold text-danger mt-3">{resolveError}</p>}
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

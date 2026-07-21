"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Home,
  Coins,
  Store,
  PhoneCall,
  CalendarClock,
  ListTodo,
  Trophy,
  TrendingUp,
  Target,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Edit3,
  Loader2,
  Clock,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import ConfirmModal from "./ConfirmModal";
import MonthNav from "./MonthNav";
import SelectField from "./SelectField";
import AutoFitText from "./AutoFitText";
import Avatar from "./Avatar";
import ProgressBar from "./ProgressBar";
import { CurrencyInput } from "./MaskedInputs";
import { formatBRL, formatPct, currentGoalTarget } from "./scoring";
import { greeting, todayStr, firstDayOfMonth, monthLabel } from "./date";
import { useSavedNotice } from "./SavedNotice";

// Só 2 abas, pedido explícito do Felipe: Início (dashboards de leitura — ranking, vendas,
// agendamentos, metas) e Vendas (fila de confirmação — aprovar/recusar/editar). Nada de
// tarefas/advertências/premiações/colaboradores aqui — esse papel é só confirmação + leitura.
export const ADMINISTRATIVO_TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "vendas", label: "Vendas", Icon: Coins },
];

const STATUS_LABEL = {
  novo: "Novo",
  agendado: "Agendado",
  follow_up: "Follow-up",
  perdido: "Perdido",
  vendido_pendente: "Aguardando confirmação",
  vendido: "Vendido",
};

const STATUS_CHIP = {
  novo: "bg-line text-muted",
  agendado: "bg-blue/15 text-blue",
  follow_up: "bg-warn/15 text-warn",
  perdido: "bg-danger/15 text-danger",
  vendido_pendente: "bg-orange/15 text-orange",
  vendido: "bg-success/15 text-success",
};

const VENDAS_PAGE_SIZE = 20;

function rankPosClass(idx) {
  if (idx === 0) return "rank-pos-1";
  if (idx === 1) return "rank-pos-2";
  if (idx === 2) return "rank-pos-3";
  return "rank-pos-plain";
}

export default function AdministrativoView({ profile, tab }) {
  const notifySaved = useSavedNotice();
  const greet = greeting();
  const today = todayStr();
  const [selectedMonth, setSelectedMonth] = useState(firstDayOfMonth(today));
  const month = selectedMonth || firstDayOfMonth(today);
  const isCurrentMonth = month === firstDayOfMonth(today);

  const [lojas, setLojas] = useState([]); // {loja_id, loja_name}
  const [selectedLojaId, setSelectedLojaId] = useState("");
  const selectedLoja = lojas.find((l) => l.loja_id === selectedLojaId);

  // ---- Início (por loja selecionada + mês) ----
  const [inicioLoading, setInicioLoading] = useState(false);
  const [empregados, setEmpregados] = useState([]); // {id, full_name}
  const [leadsLoja, setLeadsLoja] = useState([]);
  const [goals, setGoals] = useState([]);
  const [allocations, setAllocations] = useState([]);

  // ---- Vendas (todas as lojas do administrativo, com filtro) ----
  const [vendasLoading, setVendasLoading] = useState(true);
  const [todosLeads, setTodosLeads] = useState([]);
  const [empNameById, setEmpNameById] = useState({});
  const [produtoCategorias, setProdutoCategorias] = useState([]);
  // Rascunho do filtro (draft*) só passa a valer quando o usuário clica em "Aplicar filtros"
  // (pedido do Felipe: nenhum filtro do app pode recalcular a cada tecla digitada/campo
  // alterado — mesmo padrão já usado em ConsorcioDashboard.js).
  const [draftFiltroLoja, setDraftFiltroLoja] = useState("todas");
  const [draftFiltroStatus, setDraftFiltroStatus] = useState("vendido_pendente");
  const [draftFiltroEmp, setDraftFiltroEmp] = useState("todos");
  const [draftBusca, setDraftBusca] = useState("");
  const [filtroLoja, setFiltroLoja] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("vendido_pendente");
  const [filtroEmp, setFiltroEmp] = useState("todos");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);

  const [editModal, setEditModal] = useState(null); // lead sendo editado
  const [eValor, setEValor] = useState("");
  const [eCategoriaId, setECategoriaId] = useState("");
  const [eObs, setEObs] = useState("");
  const [eSaving, setESaving] = useState(false);

  const [confirmAprovar, setConfirmAprovar] = useState(null); // lead
  const [aprovando, setAprovando] = useState(false);

  const [recusarModal, setRecusarModal] = useState(null); // lead
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [recusando, setRecusando] = useState(false);

  const loadLojas = useCallback(async () => {
    const { data: access } = await supabase.from("loja_access").select("loja_id").eq("profile_id", profile.id);
    const lojaIds = (access || []).map((a) => a.loja_id);
    if (!lojaIds.length) { setLojas([]); return []; }
    const { data: lojaRows } = await supabase.from("lojas").select("id, name").in("id", lojaIds);
    const enriched = (lojaRows || []).map((l) => ({ loja_id: l.id, loja_name: l.name }));
    enriched.sort((a, b) => a.loja_name.localeCompare(b.loja_name));
    setLojas(enriched);
    return enriched;
  }, [profile.id]);

  const loadInicio = useCallback(async (lojaId, monthArg) => {
    if (!lojaId) { setEmpregados([]); setLeadsLoja([]); setGoals([]); setAllocations([]); return; }
    setInicioLoading(true);
    const { data: emps } = await supabase.from("profiles").select("id, full_name").eq("loja_id", lojaId).eq("role", "colaborador").eq("active", true);
    setEmpregados(emps || []);

    const { data: leadRows } = await supabase.from("crm_leads").select("*").eq("loja_id", lojaId);
    setLeadsLoja(leadRows || []);

    const { data: goalRows } = await supabase.from("consorcio_goals").select("*").eq("loja_id", lojaId).eq("month", monthArg).order("store_total");
    setGoals(goalRows || []);
    const { data: allocRows } = await supabase.from("consorcio_goal_allocations").select("*").in("goal_id", (goalRows || []).map((g) => g.id).length ? (goalRows || []).map((g) => g.id) : ["00000000-0000-0000-0000-000000000000"]);
    setAllocations(allocRows || []);
    setInicioLoading(false);
  }, []);

  const loadVendas = useCallback(async (lojaIds) => {
    if (!lojaIds.length) { setTodosLeads([]); setEmpNameById({}); setVendasLoading(false); return; }
    setVendasLoading(true);
    const { data: leadRows } = await supabase.from("crm_leads").select("*").in("loja_id", lojaIds).order("created_at", { ascending: false });
    setTodosLeads(leadRows || []);
    const { data: emps } = await supabase.from("profiles").select("id, full_name").in("loja_id", lojaIds).eq("role", "colaborador");
    const map = {};
    (emps || []).forEach((e) => { map[e.id] = e.full_name; });
    setEmpNameById(map);
    setVendasLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const lj = await loadLojas();
      if (!active) return;
      if (lj.length) setSelectedLojaId(lj[0].loja_id);
      await loadVendas(lj.map((l) => l.loja_id));
      const { data: catRows } = await supabase.from("consorcio_produto_categorias").select("*").eq("empresa_id", profile.empresa_id).eq("active", true).order("nome");
      if (active) setProdutoCategorias(catRows || []);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  useEffect(() => {
    if (selectedLojaId) loadInicio(selectedLojaId, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLojaId, month]);

  async function refreshVendas() {
    await loadVendas(lojas.map((l) => l.loja_id));
  }

  // ---- derivados do Início ----
  const monthPrefix = month.slice(0, 7);
  const vendidoMes = leadsLoja.filter((l) => l.status === "vendido" && l.vendido_at && l.vendido_at.slice(0, 7) === monthPrefix).reduce((s, l) => s + Number(l.valor || 0), 0);
  const pendentesLoja = leadsLoja.filter((l) => l.status === "vendido_pendente").length;
  const ligacoesHoje = leadsLoja.filter((l) => l.data_ligacao === today).length;
  const agendamentosHoje = leadsLoja.filter((l) => l.agendamento_at && l.agendamento_at.slice(0, 10) === today).length;
  const leadsMes = leadsLoja.filter((l) => l.data_ligacao && l.data_ligacao.slice(0, 7) === monthPrefix);
  const ligacoesMes = leadsMes.length;
  const agendadosMes = leadsMes.filter((l) => !!l.agendamento_at).length;
  const vendidosMesCohort = leadsMes.filter((l) => l.status === "vendido").length;
  const pctLigacaoAgendamento = ligacoesMes > 0 ? (agendadosMes / ligacoesMes) * 100 : 0;
  const pctAgendamentoVenda = agendadosMes > 0 ? (vendidosMesCohort / agendadosMes) * 100 : 0;
  const pctLigacaoVenda = ligacoesMes > 0 ? (vendidosMesCohort / ligacoesMes) * 100 : 0;

  const storeMetaTotal = goals.reduce((s, g) => Math.max(s, Number(g.store_total || 0)), 0);
  const activeGoal = (() => {
    const sortedTotals = goals.map((g) => Number(g.store_total)).sort((a, b) => a - b);
    const target = currentGoalTarget(sortedTotals, vendidoMes);
    return goals.find((g) => Number(g.store_total) === target) || null;
  })();

  const storeRanking = (() => {
    const byEmp = {};
    leadsLoja
      .filter((l) => l.status === "vendido" && l.vendido_at && l.vendido_at.slice(0, 7) === monthPrefix)
      .forEach((l) => { byEmp[l.employee_id] = (byEmp[l.employee_id] || 0) + Number(l.valor || 0); });
    return empregados
      .map((e) => ({ id: e.id, name: e.full_name, sold: byEmp[e.id] || 0 }))
      .filter((r) => r.sold > 0)
      .sort((a, b) => b.sold - a.sold);
  })();

  // ---- derivados de Vendas (cross-loja) ----
  const lojaNameById = {};
  lojas.forEach((l) => { lojaNameById[l.loja_id] = l.loja_name; });
  const empsDisponiveis = Object.entries(empNameById).map(([id, full_name]) => ({ id, full_name }));

  const vendasFiltradas = todosLeads.filter((l) => {
    if (filtroLoja !== "todas" && l.loja_id !== filtroLoja) return false;
    if (filtroStatus !== "todos" && l.status !== filtroStatus) return false;
    if (filtroEmp !== "todos" && l.employee_id !== filtroEmp) return false;
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      if (!l.nome_completo?.toLowerCase().includes(q) && !l.telefone?.includes(q)) return false;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(vendasFiltradas.length / VENDAS_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const vendasPage = vendasFiltradas.slice(pageClamped * VENDAS_PAGE_SIZE, pageClamped * VENDAS_PAGE_SIZE + VENDAS_PAGE_SIZE);

  const filtrosPendentes =
    draftFiltroLoja !== filtroLoja || draftFiltroStatus !== filtroStatus || draftFiltroEmp !== filtroEmp || draftBusca !== busca;
  const filtroAtivo = filtroLoja !== "todas" || filtroStatus !== "vendido_pendente" || filtroEmp !== "todos" || !!busca.trim();

  function aplicarFiltros(e) {
    if (e) e.preventDefault();
    setFiltroLoja(draftFiltroLoja);
    setFiltroStatus(draftFiltroStatus);
    setFiltroEmp(draftFiltroEmp);
    setBusca(draftBusca);
    setPage(0);
  }

  function limparFiltros() {
    setDraftFiltroLoja("todas"); setDraftFiltroStatus("vendido_pendente"); setDraftFiltroEmp("todos"); setDraftBusca("");
    setFiltroLoja("todas"); setFiltroStatus("vendido_pendente"); setFiltroEmp("todos"); setBusca("");
    setPage(0);
  }

  function openEdit(lead) {
    setEditModal(lead);
    setEValor(lead.valor != null ? String(lead.valor) : "");
    setECategoriaId(lead.categoria_produto_id || "");
    setEObs(lead.observacoes || "");
  }

  async function saveEdit() {
    if (!editModal) return;
    setESaving(true);
    const payload = { observacoes: eObs.trim() || null, updated_at: new Date().toISOString() };
    // valor/categoria só fazem sentido pra leads que já são venda (pendente ou confirmada)
    if (editModal.status === "vendido_pendente" || editModal.status === "vendido") {
      payload.valor = eValor === "" ? null : Number(eValor);
      payload.categoria_produto_id = eCategoriaId || null;
    }
    const { error } = await supabase.from("crm_leads").update(payload).eq("id", editModal.id);
    setESaving(false);
    if (!error) {
      setEditModal(null);
      notifySaved("Venda atualizada com sucesso.");
      await refreshVendas();
      if (selectedLojaId) await loadInicio(selectedLojaId, month);
    }
  }

  async function aprovarVenda() {
    if (!confirmAprovar) return;
    setAprovando(true);
    const { error } = await supabase
      .from("crm_leads")
      .update({
        status: "vendido",
        vendido_at: new Date().toISOString(),
        venda_revisada_por: profile.id,
        venda_revisada_em: new Date().toISOString(),
        venda_motivo_recusa: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", confirmAprovar.id);
    setAprovando(false);
    if (!error) {
      setConfirmAprovar(null);
      notifySaved("Venda confirmada com sucesso.");
      await refreshVendas();
      if (selectedLojaId) await loadInicio(selectedLojaId, month);
    }
  }

  async function recusarVenda() {
    if (!recusarModal || !motivoRecusa.trim()) return;
    setRecusando(true);
    const { error } = await supabase
      .from("crm_leads")
      .update({
        status: "follow_up",
        valor: null,
        categoria_produto_id: null,
        venda_revisada_por: profile.id,
        venda_revisada_em: new Date().toISOString(),
        venda_motivo_recusa: motivoRecusa.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", recusarModal.id);
    setRecusando(false);
    if (!error) {
      setRecusarModal(null);
      setMotivoRecusa("");
      notifySaved("Venda recusada — o colaborador foi avisado.");
      await refreshVendas();
      if (selectedLojaId) await loadInicio(selectedLojaId, month);
    }
  }

  return (
    <div className="space-y-6">
      {tab === "atividades" && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-extrabold text-navy flex items-center gap-2">
              <greet.Icon size={22} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
            </h1>
            <div className="flex items-center gap-2">
              {lojas.length > 0 && (
                <SelectField icon={Store} className="flex-1" value={selectedLojaId} onChange={(e) => setSelectedLojaId(e.target.value)}>
                  {lojas.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.loja_name}</option>)}
                </SelectField>
              )}
              <MonthNav month={month} onChange={setSelectedMonth} maxMonth={firstDayOfMonth(today)} />
            </div>
          </div>

          {lojas.length === 0 ? (
            <div className="card"><p className="text-sm text-muted">Nenhuma loja atribuída a você ainda. Fale com o sócio ou Master Admin.</p></div>
          ) : inicioLoading ? (
            <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando…</p>
          ) : (
            <>
              <div
                className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
                style={{ background: "linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)", boxShadow: "0 10px 28px rgba(100,116,139,0.35)" }}
              >
                <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-navy/10" />
                <div className="relative flex items-center gap-2 mb-3">
                  <Store size={18} className="text-navy" />
                  <span className="text-xs font-bold uppercase tracking-wider text-navy">Vendido no mês · {selectedLoja?.loja_name || "loja"}</span>
                </div>
                <AutoFitText className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(vendidoMes)}</AutoFitText>
                <p className="relative text-xs font-semibold text-navy/70 mt-1">{monthLabel(month)}</p>

                <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-5 mt-6 pt-5 border-t border-navy/15">
                  <div className="min-w-0">
                    <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{pendentesLoja}</AutoFitText>
                    <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Clock size={11} className="shrink-0" /> Aguardando confirmação</p>
                  </div>
                  <div className="min-w-0">
                    <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{ligacoesHoje}</AutoFitText>
                    <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><PhoneCall size={11} className="shrink-0" /> Ligações hoje</p>
                  </div>
                  <div className="min-w-0">
                    <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{agendamentosHoje}</AutoFitText>
                    <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><CalendarClock size={11} className="shrink-0" /> Agendamentos hoje</p>
                  </div>
                  <div className="min-w-0">
                    <AutoFitText className="text-lg sm:text-xl font-extrabold text-navy">{empregados.length}</AutoFitText>
                    <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><ListTodo size={11} className="shrink-0" /> Colaboradores ativos</p>
                  </div>
                </div>
              </div>

              {activeGoal && (
                <div className="card animate-pop border-blue/20">
                  <p className="label mb-3 flex items-center gap-1.5"><Target size={14} /> Meta em jogo — {activeGoal.name}</p>
                  <ProgressBar pct={storeMetaTotal > 0 ? Math.min(100, (vendidoMes / Number(activeGoal.store_total)) * 100) : 0} />
                  <p className="text-xs text-muted mt-2">{formatBRL(vendidoMes)} de {formatBRL(Number(activeGoal.store_total))}</p>
                </div>
              )}

              <div className="card animate-pop border-purple/20">
                <p className="label mb-3 flex items-center gap-1.5"><TrendingUp size={14} /> Conversão — {monthLabel(month)}</p>
                {ligacoesMes === 0 ? (
                  <p className="text-sm text-muted">Nenhuma ligação registrada nesse mês ainda.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                      <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(pctLigacaoAgendamento)}</AutoFitText>
                      <p className="text-[11px] text-muted mt-0.5">Ligação → Agendamento</p>
                      <p className="text-[10px] text-muted/80 mt-0.5">{agendadosMes} de {ligacoesMes} ligações</p>
                    </div>
                    <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                      <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(pctAgendamentoVenda)}</AutoFitText>
                      <p className="text-[11px] text-muted mt-0.5">Agendamento → Venda</p>
                      <p className="text-[10px] text-muted/80 mt-0.5">{vendidosMesCohort} de {agendadosMes} agendados</p>
                    </div>
                    <div className="rounded-2xl bg-purple/5 border border-purple/20 p-3 min-w-0">
                      <AutoFitText className="text-2xl font-extrabold text-purple">{formatPct(pctLigacaoVenda)}</AutoFitText>
                      <p className="text-[11px] text-muted mt-0.5">Funil completo</p>
                      <p className="text-[10px] text-muted/80 mt-0.5">{vendidosMesCohort} de {ligacoesMes} ligações</p>
                    </div>
                  </div>
                )}
              </div>

              {storeRanking.length > 0 && (
                <div className="card-dark animate-pop">
                  <p className="label-dark mb-3 flex items-center gap-1.5"><Trophy size={14} className="text-goldlight" /> Ranking de vendas — {monthLabel(month)}</p>
                  <ul>
                    {storeRanking.map((r, idx) => (
                      <li key={r.id} className="row-card">
                        <span className={`rank-pos ${rankPosClass(idx)}`}>{idx + 1}</span>
                        <Avatar name={r.name} size={32} />
                        <span className="font-medium text-white text-xs sm:text-sm truncate flex-1 min-w-0">{r.name}</span>
                        <span className="font-bold text-goldlight text-xs sm:text-sm shrink-0 whitespace-nowrap">{formatBRL(r.sold)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "vendas" && (
        <div className="space-y-4">
          <h1 className="text-xl sm:text-2xl font-extrabold text-navy flex items-center gap-2">
            <Coins size={22} className="text-orange" /> Vendas
          </h1>

          <div className="card">
            <form onSubmit={aplicarFiltros} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="label">Buscar</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input className="input !pl-9" placeholder="nome ou telefone" value={draftBusca} onChange={(e) => setDraftBusca(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Loja</label>
                <SelectField className="w-full" value={draftFiltroLoja} onChange={(e) => setDraftFiltroLoja(e.target.value)}>
                  <option value="todas">Todas as lojas</option>
                  {lojas.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.loja_name}</option>)}
                </SelectField>
              </div>
              <div>
                <label className="label">Colaborador</label>
                <SelectField className="w-full" value={draftFiltroEmp} onChange={(e) => setDraftFiltroEmp(e.target.value)}>
                  <option value="todos">Todos</option>
                  {empsDisponiveis.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </SelectField>
              </div>
              <div>
                <label className="label">Status</label>
                <SelectField className="w-full" value={draftFiltroStatus} onChange={(e) => setDraftFiltroStatus(e.target.value)}>
                  <option value="vendido_pendente">Aguardando confirmação</option>
                  <option value="vendido">Vendido</option>
                  <option value="todos">Todos</option>
                  <option value="novo">Novo</option>
                  <option value="agendado">Agendado</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="perdido">Perdido</option>
                </SelectField>
              </div>
              <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
                <button type="submit" className="btn !py-1.5 !text-xs whitespace-nowrap">Aplicar filtros</button>
                {(filtroAtivo || filtrosPendentes) && (
                  <button type="button" onClick={limparFiltros} className="text-[11px] font-bold uppercase tracking-wider text-muted hover:text-orange whitespace-nowrap">
                    Limpar
                  </button>
                )}
                {filtrosPendentes && <span className="text-[11px] text-warn">alterações pendentes — clique em Aplicar</span>}
              </div>
            </form>
          </div>

          <div className="card overflow-x-auto">
            <p className="label mb-3">{vendasFiltradas.length} venda(s)</p>
            {vendasLoading ? (
              <p className="text-xs text-muted py-10 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando…</p>
            ) : vendasFiltradas.length === 0 ? (
              <p className="text-sm text-muted py-4">Nenhuma venda encontrada com esse filtro.</p>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {vendasPage.map((l) => (
                    <li key={l.id} className="py-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-navy flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{l.nome_completo}</span>
                            <span className={`badge !text-[10px] shrink-0 ${STATUS_CHIP[l.status] || STATUS_CHIP.novo}`}>{STATUS_LABEL[l.status] || l.status}</span>
                          </p>
                          <p className="text-xs text-muted mt-0.5 flex items-center gap-3 flex-wrap">
                            <span>{empNameById[l.employee_id] || "—"}</span>
                            <span>{lojaNameById[l.loja_id] || "—"}</span>
                            <span>{l.telefone}</span>
                          </p>
                          {(l.status === "vendido" || l.status === "vendido_pendente") && (
                            <p className={`text-sm font-bold mt-1 ${l.status === "vendido" ? "text-success" : "text-orange"}`}>{formatBRL(l.valor)}</p>
                          )}
                          {l.venda_motivo_recusa && <p className="text-[11px] text-danger mt-1">Recusada antes: {l.venda_motivo_recusa}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" onClick={() => openEdit(l)} title="Editar" aria-label="Editar" className="p-1.5 rounded-lg border border-line text-muted hover:border-blue hover:text-blue transition-colors">
                            <Edit3 size={14} />
                          </button>
                          {l.status === "vendido_pendente" && (
                            <>
                              <button type="button" onClick={() => setConfirmAprovar(l)} title="Aprovar" aria-label="Aprovar" className="p-1.5 rounded-lg border border-success/30 text-success hover:bg-success/10 transition-colors">
                                <CheckCircle2 size={14} />
                              </button>
                              <button type="button" onClick={() => { setRecusarModal(l); setMotivoRecusa(""); }} title="Recusar" aria-label="Recusar" className="p-1.5 rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors">
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-2 mt-4">
                    <button type="button" className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1" disabled={pageClamped === 0} onClick={() => setPage(pageClamped - 1)}>
                      <ChevronLeft size={14} /> Anterior
                    </button>
                    <span className="text-xs text-muted">Página {pageClamped + 1} de {totalPages}</span>
                    <button type="button" className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1" disabled={pageClamped >= totalPages - 1} onClick={() => setPage(pageClamped + 1)}>
                      Próxima <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* editar venda (valor/categoria/observações) */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full max-h-[85vh] overflow-y-auto animate-bounce-in border-blue/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><Edit3 className="text-blue" size={20} /> Editar venda</h2>
            <p className="text-xs text-muted mt-1">{editModal.nome_completo}</p>
            <div className="mt-4 space-y-3">
              {(editModal.status === "vendido_pendente" || editModal.status === "vendido") && (
                <>
                  <div>
                    <label className="label">Valor da venda</label>
                    <CurrencyInput value={eValor} onChange={setEValor} />
                  </div>
                  <div>
                    <label className="label">Categoria</label>
                    <SelectField className="w-full" value={eCategoriaId} onChange={(e) => setECategoriaId(e.target.value)}>
                      <option value="">— selecione —</option>
                      {produtoCategorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </SelectField>
                  </div>
                </>
              )}
              <div>
                <label className="label">Observações</label>
                <textarea className="input" rows={2} value={eObs} onChange={(e) => setEObs(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="btn flex-1" disabled={eSaving} onClick={saveEdit}>{eSaving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmAprovar}
        title="Confirmar venda"
        message={confirmAprovar ? `Confirmar a venda de ${formatBRL(confirmAprovar.valor)} para ${confirmAprovar.nome_completo}? Ela passa a contar pra meta e comissão do colaborador.` : ""}
        confirmLabel="Confirmar venda"
        onConfirm={aprovarVenda}
        onCancel={() => setConfirmAprovar(null)}
      />

      {/* recusar precisa de motivo — ConfirmModal não tem campo de texto livre, por isso um modal
          próprio aqui, mesmo espírito do resolveModal de perdido/follow-up do colaborador. */}
      {recusarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full animate-bounce-in border-danger/30">
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2"><XCircle className="text-danger" size={20} /> Recusar venda</h2>
            <p className="text-xs text-muted mt-1">{recusarModal.nome_completo} — {formatBRL(recusarModal.valor)}</p>
            <div className="mt-4">
              <label className="label">Motivo da recusa</label>
              <textarea className="input" rows={3} value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} placeholder="O que precisa ser corrigido?" autoFocus />
            </div>
            <p className="text-[11px] text-muted mt-2">O colaborador (e o gerente dele) serão avisados com esse motivo. A venda volta pra fila do colaborador como follow-up.</p>
            <div className="flex gap-2 mt-5">
              <button className="btn-outline flex-1" onClick={() => setRecusarModal(null)}>Cancelar</button>
              <button className="btn-danger flex-1" disabled={recusando || !motivoRecusa.trim()} onClick={recusarVenda}>{recusando ? "Enviando…" : "Recusar venda"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

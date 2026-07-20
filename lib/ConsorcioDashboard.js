"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Home,
  Wallet,
  PhoneCall,
  Users,
  CheckSquare,
  AlertTriangle,
  Gift,
  Target,
  Trophy,
  Loader2,
  ChevronDown,
  ChevronUp,
  Tag,
  Trash2,
  Coins,
  ListTodo,
  CalendarClock,
  Download,
  TrendingUp,
  Pencil,
  Check,
  X,
  Filter,
  CalendarPlus,
  XCircle,
  Clock,
  CheckCircle2,
  Search,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import AutoFitText from "./AutoFitText";
import ProgressBar from "./ProgressBar";
import Avatar from "./Avatar";
import SelectField from "./SelectField";
import { CurrencyInput } from "./MaskedInputs";
import { formatBRL, formatPct, currentGoalTarget } from "./scoring";
import { todayStr, firstDayOfMonth, monthLabel } from "./date";
import { SubNav, Colaboradores, Tarefas, Advertencias, Premiacoes } from "./EmpresaDashboard";
import { useSavedNotice } from "./SavedNotice";

// Mesmas chaves/posição de EMPRESA_TABS (vestuário) — Início/Metas — pra manter o AppShell
// idêntico entre os dois segmentos, só o conteúdo interno muda.
export const CONSORCIO_TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "metas", label: "Metas", Icon: Wallet },
];

const ATIV_SUBS = [
  { key: "funil", label: "Funil", Icon: PhoneCall },
  { key: "colaboradores", label: "Colaboradores", Icon: Users },
  { key: "tarefas", label: "Tarefas", Icon: CheckSquare },
  { key: "advertencias", label: "Advertências", Icon: AlertTriangle },
  { key: "premiacoes", label: "Premiações", Icon: Gift },
];

// Painel completo de uma loja de CONSÓRCIO (Atividades + Metas), equivalente a EmpresaDashboard.js
// pro segmento vestuário — usado por gerente/supervisor/sócio/master admin. Reaproveita direto os
// componentes de Colaboradores/Tarefas/Advertências/Premiações (exportados de EmpresaDashboard.js),
// que são 100% agnósticos de categoria — só Funil (no lugar de Placar) e Metas (motor de consórcio,
// tabelas separadas) são construídos aqui.
export default function ConsorcioDashboard({ lojaId, empresaId, viewerRole = "master_admin", viewerId, tab = "atividades", month: monthProp, onOpenEmployee, onOpenGerente, atSub: atSubProp, onAtSubChange }) {
  const [loading, setLoading] = useState(true);
  const [atSubInternal, setAtSubInternal] = useState("funil");
  const atSub = atSubProp !== undefined ? atSubProp : atSubInternal;
  const setAtSub = onAtSubChange || setAtSubInternal;

  const [employees, setEmployees] = useState([]);
  const [gerentes, setGerentes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState({ warning_penalty_points: 10, team_threshold_pct: 95, monthly_prize: 1000 });
  const [prizes, setPrizes] = useState([]);
  const [leads, setLeads] = useState([]);
  const [produtoCategorias, setProdutoCategorias] = useState([]);
  const [goals, setGoals] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [commissionSettings, setCommissionSettings] = useState({ non_achievement_colaborador_pct: 0, non_achievement_gerente_pct: 0 });

  const today = todayStr();
  const month = monthProp || firstDayOfMonth(today);
  // Metas/comissão: qualquer papel de gestão de loja (master/sócio/supervisor) pode mexer — espelha a
  // RLS de consorcio_goals/consorcio_goal_allocations/consorcio_commission_settings (can_manage_loja).
  // "leitor" é o valor que HierarchyHome passa pra supervisor com permissão só de "ver" numa loja
  // (não "gerenciar") — precisa ficar de fora igual gerente, senão um supervisor read-only conseguiria
  // criar/editar metas de uma loja que só devia poder consultar.
  const canManage = viewerRole !== "gerente" && viewerRole !== "leitor";
  // Categorias de produto são configuração da EMPRESA (não da loja) — só master_admin/sócio têm
  // permissão de escrita em consorcio_produto_categorias (supervisor é escopado por loja, não por
  // empresa). Um supervisor não deve nem ver o botão de adicionar, porque a escrita falharia por RLS.
  const canManageProdutoCategorias = viewerRole === "master_admin" || viewerRole === "socio";

  const loadAll = useCallback(async () => {
    if (!lojaId) return;
    const nextMonth = new Date(month + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    let empsQuery = supabase.from("profiles").select("*").eq("role", "colaborador").eq("loja_id", lojaId).order("full_name");
    if (viewerRole === "gerente" && viewerId) empsQuery = empsQuery.eq("gerente_id", viewerId);
    const { data: emps } = await empsQuery;
    setEmployees(emps || []);

    if (viewerRole !== "gerente") {
      const { data: gers } = await supabase.from("profiles").select("*").eq("role", "gerente").eq("loja_id", lojaId).order("full_name");
      setGerentes(gers || []);
    } else {
      setGerentes([]);
    }

    const { data: settingsRow } = await supabase.from("app_settings").select("*").eq("loja_id", lojaId).single();
    if (settingsRow) setSettings(settingsRow);

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

    const { data: prizeRows } = await supabase.from("employee_prizes").select("*").eq("loja_id", lojaId).eq("month", month);
    setPrizes(prizeRows || []);

    const { data: leadRows } = await supabase.from("crm_leads").select("*").eq("loja_id", lojaId).order("created_at", { ascending: false });
    setLeads(leadRows || []);

    if (empresaId) {
      const { data: catRows } = await supabase
        .from("consorcio_produto_categorias")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("nome");
      setProdutoCategorias(catRows || []);
    }

    const { data: goalRows } = await supabase.from("consorcio_goals").select("*").eq("loja_id", lojaId).eq("month", month).order("store_total", { ascending: true });
    setGoals(goalRows || []);
    const { data: allocRows } = await supabase.from("consorcio_goal_allocations").select("*").eq("loja_id", lojaId);
    setAllocations(allocRows || []);
    const { data: commissionRow } = await supabase
      .from("consorcio_commission_settings")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("month", month)
      .maybeSingle();
    setCommissionSettings(commissionRow || { non_achievement_colaborador_pct: 0, non_achievement_gerente_pct: 0 });
  }, [lojaId, empresaId, month, viewerRole, viewerId]);

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

  const activeEmpIds = employees.filter((e) => e.active).map((e) => e.id);
  // employees já vem escopado por viewerRole (gerente só vê a própria equipe — ver loadAll acima).
  // Os leads do banco são buscados por loja inteira, então precisam ser filtrados pelos mesmos
  // employees aqui antes de qualquer agregação, senão um gerente veria números da loja toda nos
  // cards/relatório em vez de só da equipe dele.
  const empIdSet = new Set(employees.map((e) => e.id));
  const scopedLeads = leads.filter((l) => empIdSet.has(l.employee_id));
  const monthPrefix = month.slice(0, 7);
  const leadsThisMonth = scopedLeads.filter((l) => l.data_ligacao && l.data_ligacao.slice(0, 7) === monthPrefix);
  const vendasMes = scopedLeads.filter((l) => l.status === "vendido" && l.vendido_at && l.vendido_at.slice(0, 7) === monthPrefix);
  const soldLoja = vendasMes.reduce((s, l) => s + Number(l.valor || 0), 0);

  const funilBoard = employees.filter((e) => e.active).map((emp) => {
    const empLeads = scopedLeads.filter((l) => l.employee_id === emp.id);
    const total = empLeads.length;
    const agendados = empLeads.filter((l) => !!l.agendamento_at).length;
    const perdidos = empLeads.filter((l) => l.status === "perdido").length;
    const followUp = empLeads.filter((l) => l.status === "follow_up").length;
    const vendidos = empLeads.filter((l) => l.status === "vendido");
    const agendadosPerdidos = empLeads.filter((l) => l.agendamento_at && l.status === "perdido").length;
    const agendadosVendidos = empLeads.filter((l) => l.agendamento_at && l.status === "vendido").length;
    const valorVendido = vendidos.reduce((s, l) => s + Number(l.valor || 0), 0);
    return { employee: emp, total, agendados, perdidos, followUp, vendidosCount: vendidos.length, agendadosPerdidos, agendadosVendidos, valorVendido };
  });

  const storeMetaTotal = currentGoalTarget(goals.map((g) => g.store_total), soldLoja);

  return (
    <div className="space-y-6">
      {tab === "atividades" && (
        <div className="space-y-6">
          <SubNav subs={ATIV_SUBS} active={atSub} onChange={setAtSub} />
          {atSub === "funil" && (
            <Funil
              leads={scopedLeads}
              leadsThisMonth={leadsThisMonth}
              funilBoard={funilBoard}
              employees={employees}
              viewerRole={viewerRole}
              month={month}
              produtoCategorias={produtoCategorias}
              empresaId={empresaId}
              canManageCategorias={canManageProdutoCategorias}
              onChanged={refresh}
            />
          )}
          {atSub === "colaboradores" && (
            <Colaboradores
              employees={employees}
              gerentes={gerentes}
              viewerRole={viewerRole}
              empresaId={empresaId}
              lojaId={lojaId}
              onChanged={refresh}
              onOpenEmployee={onOpenEmployee}
              onOpenGerente={onOpenGerente}
            />
          )}
          {atSub === "tarefas" && (
            <Tarefas employees={employees} gerentes={gerentes} viewerRole={viewerRole} tasks={tasks} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
          )}
          {atSub === "advertencias" && (
            <Advertencias
              employees={employees}
              gerentes={gerentes}
              viewerRole={viewerRole}
              warnings={warnings}
              settings={settings}
              today={today}
              empresaId={empresaId}
              lojaId={lojaId}
              onChanged={refresh}
              onSaveSettings={async (vals) => {
                await supabase.from("app_settings").update(vals).eq("loja_id", lojaId);
                await refresh();
              }}
            />
          )}
          {atSub === "premiacoes" && (
            <Premiacoes employees={employees} gerentes={gerentes} viewerRole={viewerRole} prizes={prizes} month={month} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} />
          )}
        </div>
      )}

      {tab === "metas" && (
        <Metas
          goals={goals}
          allocations={allocations}
          commissionSettings={commissionSettings}
          activeEmpIds={activeEmpIds}
          employees={employees}
          soldLoja={soldLoja}
          storeMetaTotal={storeMetaTotal}
          vendasMes={vendasMes}
          produtoCategorias={produtoCategorias}
          month={month}
          empresaId={empresaId}
          lojaId={lojaId}
          canManage={canManage}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function isEvenSplit(allocs) {
  if (allocs.length < 2) return true;
  const amounts = allocs.map((a) => Number(a.amount));
  return Math.max(...amounts) - Math.min(...amounts) < 0.01;
}

const STATUS_LABEL = { novo: "Novo", agendado: "Agendado", follow_up: "Follow-up", perdido: "Perdido", vendido: "Vendido" };

// Classes de chip por status, pensadas pra fundo escuro (.card-dark) — mesma paleta semântica
// já usada em .chip-ok/warn/danger, com duas variantes extra (novo/agendado) que não têm chip
// pronto porque não são "bons nem ruins", só estados neutros do funil.
const STATUS_CHIP_DARK = {
  novo: "bg-white/10 text-white/65",
  agendado: "bg-blue/25 text-bluelight",
  follow_up: "chip-warn",
  perdido: "chip-danger",
  vendido: "chip-ok",
};

const EXPORT_STATUS_OPTIONS = [
  { key: "novo", label: "Novo" },
  { key: "agendado", label: "Agendado" },
  { key: "follow_up", label: "Follow-up" },
  { key: "perdido", label: "Perdido" },
  { key: "vendido", label: "Vendido" },
];

function Funil({ leads, leadsThisMonth, funilBoard, employees, viewerRole, month, produtoCategorias, empresaId, canManageCategorias, onChanged }) {
  const notifySaved = useSavedNotice();
  const today = todayStr();
  const [catOpen, setCatOpen] = useState(false);
  const [catNome, setCatNome] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatNome, setEditCatNome] = useState("");
  const [savingCatEdit, setSavingCatEdit] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Exportação é uma ferramenta de gestão — só quem administra a equipe (gerente/supervisor/sócio)
  // tem o botão. Master Admin, quando entra direto numa loja, não vê essa ação (pedido do Felipe).
  const canExport = viewerRole === "gerente" || viewerRole === "supervisor" || viewerRole === "socio" || viewerRole === "leitor";
  // Editar/resolver lead na lista individual é ação operacional do dia a dia (igual o colaborador
  // já faz) — liberado pra quem gerencia a loja de fato (master/sócio/supervisor com permissão de
  // gerenciar/gerente). Só "leitor" (supervisor só com acesso de visualização) fica de fora, mesmo
  // padrão de somente-leitura já usado no resto do app.
  const canManageLeads = viewerRole !== "leitor";

  // ---- agendar / resolver lead (mesma lógica de ColaboradorViewConsorcio.js — pedido do Felipe:
  // o gestor também pode agir sobre o lead direto dessa lista, não só consultar) ----
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
      await onChanged();
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
      await onChanged();
    }
  }

  function allStatusesOn() {
    const all = {};
    EXPORT_STATUS_OPTIONS.forEach((s) => { all[s.key] = true; });
    return all;
  }

  // Filtros de período/status/categoria/busca — visíveis na própria tela (não só dentro do modal de
  // exportar, pedido do Felipe: "o usuário pode filtrar pra visualizar no próprio app mesmo").
  // Os campos abaixo (draft*) são o "rascunho" do formulário — só passam a valer de fato quando o
  // usuário clica em "Aplicar filtros" (pedido do Felipe: filtro não pode recalcular a cada tecla
  // digitada / cada campo alterado). O segundo bloco (filtro*/busca) é o que está REALMENTE aplicado
  // e alimenta a lista de leads, o "Funil por colaborador" e a exportação em Excel.
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [draftDataIni, setDraftDataIni] = useState("");
  const [draftDataFim, setDraftDataFim] = useState("");
  const [draftStatuses, setDraftStatuses] = useState(allStatusesOn);
  const [draftCategoriaId, setDraftCategoriaId] = useState("");
  const [draftBusca, setDraftBusca] = useState("");

  const [filtroDataIni, setFiltroDataIni] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroStatuses, setFiltroStatuses] = useState(allStatusesOn);
  const [filtroCategoriaId, setFiltroCategoriaId] = useState("");
  const [busca, setBusca] = useState("");
  const filtroAtivo = !!(filtroDataIni || filtroDataFim || filtroCategoriaId || busca.trim() || EXPORT_STATUS_OPTIONS.some((s) => !filtroStatuses[s.key]));
  // Há edição no formulário ainda não aplicada — usado pra avisar o usuário e habilitar "Limpar"
  // mesmo quando ele mexeu nos campos mas não clicou em Aplicar ainda.
  const filtrosPendentes =
    draftDataIni !== filtroDataIni ||
    draftDataFim !== filtroDataFim ||
    draftCategoriaId !== filtroCategoriaId ||
    draftBusca !== busca ||
    EXPORT_STATUS_OPTIONS.some((s) => !!draftStatuses[s.key] !== !!filtroStatuses[s.key]);

  // Filtro de colaborador (via chip clicável na lista, não um select) — pedido do Felipe: "o usuário
  // tem que conseguir filtrar os leads e todas as informações dele". Fica fora do formulário acima
  // de propósito: é uma seleção única e explícita (clicou, já filtrou), não um conjunto de campos
  // sendo preenchidos aos poucos, então não precisa de botão "Aplicar".
  const [filtroColaboradorId, setFiltroColaboradorId] = useState("");

  // Paginação da lista de leads — evita rolagem infinita conforme o volume de leads cresce (pedido
  // do Felipe). Reseta pra página 1 sempre que um filtro é aplicado/limpo ou o chip de colaborador muda.
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const buscaNorm = busca.trim().toLowerCase();
  const filteredLeads = leads.filter((l) => {
    if (filtroDataIni && (!l.data_ligacao || l.data_ligacao < filtroDataIni)) return false;
    if (filtroDataFim && (!l.data_ligacao || l.data_ligacao > filtroDataFim)) return false;
    if (!filtroStatuses[l.status]) return false;
    if (filtroCategoriaId && l.categoria_produto_id !== filtroCategoriaId) return false;
    if (buscaNorm) {
      const nomeMatch = (l.nome_completo || "").toLowerCase().includes(buscaNorm);
      const telMatch = (l.telefone || "").toLowerCase().includes(buscaNorm);
      if (!nomeMatch && !telMatch) return false;
    }
    return true;
  });
  const filteredBoard = employees.filter((e) => e.active).map((emp) => {
    const empLeads = filteredLeads.filter((l) => l.employee_id === emp.id);
    const total = empLeads.length;
    const agendados = empLeads.filter((l) => !!l.agendamento_at).length;
    const perdidos = empLeads.filter((l) => l.status === "perdido").length;
    const followUp = empLeads.filter((l) => l.status === "follow_up").length;
    const vendidos = empLeads.filter((l) => l.status === "vendido");
    const agendadosPerdidos = empLeads.filter((l) => l.agendamento_at && l.status === "perdido").length;
    const agendadosVendidos = empLeads.filter((l) => l.agendamento_at && l.status === "vendido").length;
    const valorVendido = vendidos.reduce((s, l) => s + Number(l.valor || 0), 0);
    return { employee: emp, total, agendados, perdidos, followUp, vendidosCount: vendidos.length, agendadosPerdidos, agendadosVendidos, valorVendido };
  });
  // leads efetivamente exibidos na lista abaixo — todos os filtros da aba + o chip de colaborador
  // selecionado (se houver), mais recentes primeiro.
  const leadsToShow = (filtroColaboradorId ? filteredLeads.filter((l) => l.employee_id === filtroColaboradorId) : filteredLeads)
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const totalLeads = leadsToShow.length;
  const totalPages = Math.max(1, Math.ceil(totalLeads / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedLeads = leadsToShow.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const empNameById = {};
  employees.forEach((e) => { empNameById[e.id] = e.full_name; });
  const catNameById = {};
  produtoCategorias.forEach((c) => { catNameById[c.id] = c.nome; });

  const ligacoesHoje = leads.filter((l) => l.data_ligacao === today).length;
  const agendamentosHoje = leads.filter((l) => l.agendamento_at && l.agendamento_at.slice(0, 10) === today).length;
  const abertos = leads.filter((l) => l.status !== "vendido" && l.status !== "perdido").length;
  const vendidoMes = leadsThisMonth.filter((l) => l.status === "vendido").reduce((s, l) => s + Number(l.valor || 0), 0);

  // Conversão do mês — cohort por data_ligacao (mesma safra do início ao fim do funil, não mistura
  // ligação de um mês com agendamento resolvido em outro). Agendados "em aberto" (agendado/follow_up
  // ainda sem resolver) contam no denominador de agendamento→venda — decisão confirmada com o Felipe:
  // taxa mais realista, com o card ainda mostrando quantos estão em aberto pra dar contexto (evita
  // que um mês recente pareça artificialmente ruim só por lead ainda não ter fechado).
  const ligacoesMes = leadsThisMonth.length;
  const agendadosMes = leadsThisMonth.filter((l) => !!l.agendamento_at).length;
  const vendidosMes = leadsThisMonth.filter((l) => l.status === "vendido").length;
  const agendadosEmAberto = leadsThisMonth.filter((l) => l.agendamento_at && l.status !== "vendido" && l.status !== "perdido").length;
  const pctLigacaoAgendamento = ligacoesMes > 0 ? (agendadosMes / ligacoesMes) * 100 : 0;
  const pctAgendamentoVenda = agendadosMes > 0 ? (vendidosMes / agendadosMes) * 100 : 0;
  const pctLigacaoVenda = ligacoesMes > 0 ? (vendidosMes / ligacoesMes) * 100 : 0;

  async function addCategoria(e) {
    e.preventDefault();
    if (!catNome.trim()) return;
    setSavingCat(true);
    await supabase.from("consorcio_produto_categorias").insert({ empresa_id: empresaId, nome: catNome.trim() });
    setSavingCat(false);
    setCatNome("");
    notifySaved();
    await onChanged();
  }

  async function toggleCategoria(cat) {
    await supabase.from("consorcio_produto_categorias").update({ active: !cat.active }).eq("id", cat.id);
    await onChanged();
  }

  function startEditCategoria(cat) {
    setEditingCatId(cat.id);
    setEditCatNome(cat.nome);
  }

  async function saveCategoriaEdit(cat) {
    if (!editCatNome.trim()) return;
    setSavingCatEdit(true);
    await supabase.from("consorcio_produto_categorias").update({ nome: editCatNome.trim() }).eq("id", cat.id);
    setSavingCatEdit(false);
    setEditingCatId(null);
    notifySaved("Categoria atualizada com sucesso.");
    await onChanged();
  }

  function toggleFiltroStatus(key) {
    setDraftStatuses((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function aplicarFiltros(e) {
    if (e) e.preventDefault();
    setFiltroDataIni(draftDataIni);
    setFiltroDataFim(draftDataFim);
    setFiltroStatuses(draftStatuses);
    setFiltroCategoriaId(draftCategoriaId);
    setBusca(draftBusca);
    setPage(1);
  }

  function limparFiltros() {
    const all = allStatusesOn();
    setDraftDataIni(""); setDraftDataFim(""); setDraftCategoriaId(""); setDraftBusca(""); setDraftStatuses(all);
    setFiltroDataIni(""); setFiltroDataFim(""); setFiltroCategoriaId(""); setBusca(""); setFiltroStatuses(all);
    setPage(1);
  }

  async function exportExcel() {
    const anyStatusChecked = EXPORT_STATUS_OPTIONS.some((s) => filtroStatuses[s.key]);
    if (!anyStatusChecked) return;
    setExporting(true);
    try {
      // exporta exatamente o que está filtrado na tela — mesmo `filteredLeads` usado na tabela
      // "Funil por colaborador" acima, pra exportação e visualização nunca ficarem inconsistentes.
      const XLSX = await import("xlsx");
      const catNameById = {};
      produtoCategorias.forEach((c) => { catNameById[c.id] = c.nome; });
      const empNameById = {};
      employees.forEach((e) => { empNameById[e.id] = e.full_name; });

      const leadRows = filteredLeads.map((l) => ({
        Colaborador: empNameById[l.employee_id] || "—",
        "Nome do cliente": l.nome_completo,
        Telefone: l.telefone,
        Endereço: l.endereco || "",
        "E-mail": l.email || "",
        "Data da ligação": l.data_ligacao || "",
        Agendamento: l.agendamento_at ? new Date(l.agendamento_at).toLocaleString("pt-BR") : "",
        Status: STATUS_LABEL[l.status] || l.status,
        Feedback: l.feedback || "",
        "Valor da venda": l.status === "vendido" ? Number(l.valor || 0) : "",
        "Categoria do produto": l.categoria_produto_id ? catNameById[l.categoria_produto_id] || "" : "",
        Observações: l.observacoes || "",
        "Vendido em": l.vendido_at ? new Date(l.vendido_at).toLocaleString("pt-BR") : "",
      }));

      // resumo por colaborador recalculado em cima do MESMO filtro (não reaproveita o funilBoard
      // do topo, que é sempre do total geral) — senão a segunda aba não bateria com a primeira.
      const resumoRows = employees
        .filter((e) => e.active)
        .map((emp) => {
          const empLeads = filteredLeads.filter((l) => l.employee_id === emp.id);
          return {
            Colaborador: emp.full_name,
            Ligações: empLeads.length,
            Agendados: empLeads.filter((l) => !!l.agendamento_at).length,
            "Agendados que venderam": empLeads.filter((l) => l.agendamento_at && l.status === "vendido").length,
            "Agendados perdidos": empLeads.filter((l) => l.agendamento_at && l.status === "perdido").length,
            "Follow-up": empLeads.filter((l) => l.status === "follow_up").length,
            Perdidos: empLeads.filter((l) => l.status === "perdido").length,
            Vendidos: empLeads.filter((l) => l.status === "vendido").length,
            "Valor vendido": empLeads.filter((l) => l.status === "vendido").reduce((s, l) => s + Number(l.valor || 0), 0),
          };
        })
        .filter((r) => r.Ligações > 0);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leadRows), "Leads");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), "Resumo por colaborador");
      const suffix = filtroDataIni || filtroDataFim ? `${filtroDataIni || "inicio"}_a_${filtroDataFim || "hoje"}` : month;
      XLSX.writeFile(wb, `leads-consorcio-${suffix}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card animate-pop border-blue/20 min-w-0">
          <AutoFitText className="text-xl sm:text-2xl font-extrabold text-navy">{ligacoesHoje}</AutoFitText>
          <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1"><PhoneCall size={11} className="shrink-0" /> Ligações hoje</p>
        </div>
        <div className="card animate-pop border-blue/20 min-w-0">
          <AutoFitText className="text-xl sm:text-2xl font-extrabold text-navy">{agendamentosHoje}</AutoFitText>
          <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1"><CalendarClock size={11} className="shrink-0" /> Reuniões hoje</p>
        </div>
        <div className="card animate-pop border-blue/20 min-w-0">
          <AutoFitText className="text-xl sm:text-2xl font-extrabold text-navy">{abertos}</AutoFitText>
          <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1"><ListTodo size={11} className="shrink-0" /> Em aberto</p>
        </div>
        <div className="card animate-pop border-blue/20 min-w-0">
          <AutoFitText className="text-xl sm:text-2xl font-extrabold text-navy">{formatBRL(vendidoMes)}</AutoFitText>
          <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1"><Coins size={11} className="shrink-0" /> Vendido — {monthLabel(month)}</p>
        </div>
      </div>

      <div className="card animate-pop border-purple/20">
        <p className="label mb-3 flex items-center gap-1.5"><TrendingUp size={14} /> Conversão — {monthLabel(month)}</p>
        {ligacoesMes === 0 ? (
          <p className="text-sm text-muted">Nenhuma ligação registrada nesse mês ainda.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(pctLigacaoAgendamento)}</AutoFitText>
                <p className="text-[11px] text-muted mt-0.5">Ligação → Agendamento</p>
                <p className="text-[10px] text-muted/80 mt-0.5">{agendadosMes} de {ligacoesMes} ligações</p>
              </div>
              <div className="rounded-2xl bg-paper border border-line p-3 min-w-0">
                <AutoFitText className="text-2xl font-extrabold text-navy">{formatPct(pctAgendamentoVenda)}</AutoFitText>
                <p className="text-[11px] text-muted mt-0.5">Agendamento → Venda</p>
                <p className="text-[10px] text-muted/80 mt-0.5">{vendidosMes} de {agendadosMes} agendados</p>
              </div>
              <div className="rounded-2xl bg-purple/5 border border-purple/20 p-3 min-w-0">
                <AutoFitText className="text-2xl font-extrabold text-purple">{formatPct(pctLigacaoVenda)}</AutoFitText>
                <p className="text-[11px] text-muted mt-0.5">Funil completo — Ligação → Venda</p>
                <p className="text-[10px] text-muted/80 mt-0.5">{vendidosMes} de {ligacoesMes} ligações</p>
              </div>
            </div>
            {agendadosEmAberto > 0 && (
              <p className="text-[11px] text-muted mt-3">
                {agendadosEmAberto} agendamento(s) dessa safra ainda em aberto (nem vendido, nem perdido) — contam no denominador de "Agendamento → Venda" acima, então a taxa tende a subir conforme esses leads forem resolvidos.
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <button type="button" onClick={() => setFiltrosOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
          <p className="label mb-0 flex items-center gap-1.5">
            <Filter size={14} /> Filtros{filtroAtivo && <span className="badge bg-purple/15 text-purple !text-[10px]">ativo</span>}
          </p>
          {filtrosOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
        </button>
        {filtrosOpen && (
          <form onSubmit={aplicarFiltros} className="mt-3 space-y-3">
            <div>
              <label className="label">Buscar por nome ou telefone</label>
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input !pl-10" placeholder="ex: Carlos, (11) 9…" value={draftBusca} onChange={(e) => setDraftBusca(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">De</label>
                <input type="date" className="input date-input" value={draftDataIni} onChange={(e) => setDraftDataIni(e.target.value)} max={draftDataFim || undefined} />
              </div>
              <div>
                <label className="label">Até</label>
                <input type="date" className="input date-input" value={draftDataFim} onChange={(e) => setDraftDataFim(e.target.value)} min={draftDataIni || undefined} />
              </div>
            </div>
            <p className="text-[11px] text-muted">Filtro por data da ligação. Deixe em branco pra não filtrar por período.</p>

            <div>
              <label className="label">Categoria do produto</label>
              <SelectField className="w-full" value={draftCategoriaId} onChange={(e) => setDraftCategoriaId(e.target.value)}>
                <option value="">Todas</option>
                {produtoCategorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </SelectField>
              <p className="text-[11px] text-muted mt-1">Só leads vendidos têm categoria — filtrar por categoria deixa de fora quem ainda não fechou venda.</p>
            </div>

            <div>
              <p className="label mb-2">Status</p>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_STATUS_OPTIONS.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!draftStatuses[s.key]} onChange={() => toggleFiltroStatus(s.key)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1 flex-wrap">
              <button type="submit" className="btn !py-1.5 !text-xs whitespace-nowrap">Aplicar filtros</button>
              {(filtroAtivo || filtrosPendentes) && (
                <button type="button" onClick={limparFiltros} className="text-[11px] font-bold uppercase tracking-wider text-muted hover:text-purple">
                  Limpar filtros
                </button>
              )}
              {filtrosPendentes && <span className="text-[11px] text-warn">alterações pendentes — clique em Aplicar</span>}
            </div>
          </form>
        )}
      </div>

      <div className="card-dark">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="label-dark mb-0 flex items-center gap-1.5"><Users size={14} className="text-goldlight" /> Colaboradores</p>
          {canExport && (
            <button
              type="button"
              onClick={exportExcel}
              disabled={leads.length === 0 || exporting}
              className="btn-outline !py-1.5 !text-xs whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50 !border-goldlight !text-goldlight hover:!bg-goldlight hover:!text-navy"
            >
              <Download size={13} /> {exporting ? "Gerando…" : "Exportar Excel"}
            </button>
          )}
        </div>
        {filteredBoard.length === 0 ? (
          <p className="text-sm text-white/50">Nenhum colaborador ativo nessa loja ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setFiltroColaboradorId(""); setPage(1); }}
              className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border transition-colors ${
                !filtroColaboradorId ? "bg-goldlight/20 border-goldlight" : "bg-white/5 border-white/10 hover:border-white/25"
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-white/10 text-white/70 text-[10px] font-bold flex items-center justify-center">*</span>
              <span className={`text-xs font-bold ${!filtroColaboradorId ? "text-goldlight" : "text-white"}`}>Todos</span>
              <span className="text-[10px] text-white/40">{filteredLeads.length}</span>
            </button>
            {filteredBoard.map((b) => (
              <button
                type="button"
                key={b.employee.id}
                onClick={() => { setFiltroColaboradorId((cur) => (cur === b.employee.id ? "" : b.employee.id)); setPage(1); }}
                className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border transition-colors ${
                  filtroColaboradorId === b.employee.id ? "bg-goldlight/20 border-goldlight" : "bg-white/5 border-white/10 hover:border-white/25"
                }`}
                title={`${b.agendados} agendados · ${b.followUp} follow-up · ${b.perdidos} perdidos · ${b.vendidosCount} vendidos${b.valorVendido ? ` · ${formatBRL(b.valorVendido)}` : ""}`}
              >
                <Avatar name={b.employee.full_name} size={24} />
                <span className={`text-xs font-bold truncate max-w-[120px] ${filtroColaboradorId === b.employee.id ? "text-goldlight" : "text-white"}`}>{b.employee.full_name}</span>
                <span className="text-[10px] text-white/40 shrink-0">{b.total}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card-dark">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <p className="label-dark mb-0 flex items-center gap-1.5"><PhoneCall size={14} className="text-goldlight" /> Leads{filtroAtivo || filtroColaboradorId ? " (filtrado)" : ""}</p>
          {totalLeads > 0 && <p className="text-[11px] text-white/40">{totalLeads} lead(s)</p>}
        </div>
        {leadsToShow.length === 0 ? (
          <p className="text-sm text-white/50">Nenhum lead encontrado com esse filtro.</p>
        ) : (
          <>
            <ul>
              {pagedLeads.map((l) => (
                <ManagerLeadRow
                  key={l.id}
                  lead={l}
                  employeeName={empNameById[l.employee_id] || "—"}
                  catNameById={catNameById}
                  canManage={canManageLeads}
                  onAgendar={openAgendar}
                  onResolve={openResolve}
                />
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="text-[11px] font-bold uppercase tracking-wider text-white/60 hover:text-goldlight disabled:opacity-30 disabled:hover:text-white/60 transition-colors"
                >
                  ← Anterior
                </button>
                <p className="text-[11px] text-white/50">Página {safePage} de {totalPages}</p>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="text-[11px] font-bold uppercase tracking-wider text-white/60 hover:text-goldlight disabled:opacity-30 disabled:hover:text-white/60 transition-colors"
                >
                  Próxima →
                </button>
              </div>
            )}
          </>
        )}
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

      {canManageCategorias && (
        <div className="card">
          <button type="button" onClick={() => setCatOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
            <p className="label mb-0 flex items-center gap-1.5"><Tag size={14} /> Categorias de produto</p>
            {catOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
          </button>
          {catOpen && (
            <div className="mt-3 space-y-3">
              <form onSubmit={addCategoria} className="flex gap-2">
                <input className="input flex-1" placeholder="ex: Veículos leves" value={catNome} onChange={(e) => setCatNome(e.target.value)} maxLength={40} />
                <button className="btn whitespace-nowrap" type="submit" disabled={savingCat}>{savingCat ? "Salvando…" : "Adicionar"}</button>
              </form>
              {produtoCategorias.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma categoria cadastrada ainda — colaboradores não conseguem marcar uma venda sem isso.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {produtoCategorias.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      {editingCatId === c.id ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            className="input !py-1 !text-sm flex-1 min-w-0"
                            value={editCatNome}
                            onChange={(e) => setEditCatNome(e.target.value)}
                            maxLength={40}
                            autoFocus
                          />
                          <button type="button" onClick={() => saveCategoriaEdit(c)} disabled={savingCatEdit} className="p-1.5 rounded-lg text-success hover:bg-success/10 transition-colors shrink-0" title="Salvar" aria-label="Salvar">
                            <Check size={15} />
                          </button>
                          <button type="button" onClick={() => setEditingCatId(null)} className="p-1.5 rounded-lg text-muted hover:bg-line/60 transition-colors shrink-0" title="Cancelar" aria-label="Cancelar">
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className={`truncate ${c.active ? "text-navy" : "text-muted line-through"}`}>{c.nome}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => startEditCategoria(c)} className="p-1.5 rounded-lg text-muted hover:text-navy hover:bg-line/60 transition-colors" title="Editar" aria-label="Editar">
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => toggleCategoria(c)} className="text-[11px] font-bold uppercase tracking-wider text-muted hover:text-purple px-1">
                              {c.active ? "desativar" : "ativar"}
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function fmtAgendamento(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function fmtDataLigacao(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR");
}

// Linha de lead na visão de gestão (gerente/supervisor/sócio/master) — igual espírito da LeadRow
// de ColaboradorViewConsorcio.js, mas: (1) mostra de quem é o lead (responsável), porque aqui é
// uma lista cruzando todos os colaboradores da loja; (2) tem um "expandir" com os campos que não
// cabem numa linha compacta (endereço, e-mail, feedback/observações, categoria); (3) os botões de
// ação só aparecem se canManage (pedido do Felipe: o gestor pode editar/resolver o lead daqui).
function ManagerLeadRow({ lead, employeeName, catNameById, canManage, onAgendar, onResolve }) {
  const [expanded, setExpanded] = useState(false);
  const terminal = lead.status === "vendido" || lead.status === "perdido";
  const hora = fmtAgendamento(lead.agendamento_at);
  const chipClass = STATUS_CHIP_DARK[lead.status] || STATUS_CHIP_DARK.novo;
  return (
    <li className="row-card items-start flex-wrap gap-y-2">
      <Avatar name={lead.nome_completo} size={32} />
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-white text-xs sm:text-sm truncate">{lead.nome_completo}</p>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${chipClass}`}>{STATUS_LABEL[lead.status] || lead.status}</span>
        </div>
        <p className="text-[11px] text-white/50 mt-1 flex items-center gap-3 flex-wrap">
          <span>{lead.telefone}</span>
          {hora && <span>🗓 {hora}</span>}
        </p>
        <p className="text-[10px] text-goldlight mt-0.5">Responsável: {employeeName}</p>
        {expanded && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 bg-white/5 border border-dashed border-white/15 rounded-xl p-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/35">Data da ligação</p>
              <p className="text-xs text-white mt-0.5">{fmtDataLigacao(lead.data_ligacao)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/35">E-mail</p>
              <p className="text-xs text-white mt-0.5">{lead.email || "—"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Endereço</p>
              <p className="text-xs text-white mt-0.5">{lead.endereco || "—"}</p>
            </div>
            {lead.status === "vendido" && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/35">Categoria do produto</p>
                <p className="text-xs text-white mt-0.5">{catNameById[lead.categoria_produto_id] || "—"}</p>
              </div>
            )}
            {(lead.feedback || lead.observacoes) && (
              <div className="sm:col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-white/35">Feedback / observações</p>
                <p className="text-xs text-white mt-0.5">{lead.feedback || lead.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </div>
      {lead.status === "vendido" && <p className="font-bold text-goldlight text-xs sm:text-sm shrink-0 whitespace-nowrap">{formatBRL(lead.valor)}</p>}
      {canManage && !terminal && (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => onAgendar(lead)} title="Agendar / reagendar" aria-label="Agendar" className="p-1.5 rounded-lg text-white/60 hover:text-bluelight hover:bg-white/10 transition-colors">
            <CalendarPlus size={14} />
          </button>
          <button type="button" onClick={() => onResolve(lead, "perdido")} title="Perdido" aria-label="Perdido" className="p-1.5 rounded-lg text-white/60 hover:text-danger hover:bg-white/10 transition-colors">
            <XCircle size={14} />
          </button>
          <button type="button" onClick={() => onResolve(lead, "follow_up")} title="Follow-up" aria-label="Follow-up" className="p-1.5 rounded-lg text-white/60 hover:text-warn hover:bg-white/10 transition-colors">
            <Clock size={14} />
          </button>
          <button type="button" onClick={() => onResolve(lead, "vendido")} title="Vendido" aria-label="Vendido" className="p-1.5 rounded-lg text-white/60 hover:text-success hover:bg-white/10 transition-colors">
            <CheckCircle2 size={14} />
          </button>
        </div>
      )}
    </li>
  );
}

function Metas({ goals, allocations, commissionSettings, activeEmpIds, employees, soldLoja, storeMetaTotal, vendasMes, produtoCategorias, month, empresaId, lojaId, canManage, onChanged }) {
  const notifySaved = useSavedNotice();
  const [formOpen, setFormOpen] = useState(false);
  const [gNome, setGNome] = useState("");
  const [gValor, setGValor] = useState("");
  const [gPctColab, setGPctColab] = useState("");
  const [gPctGerente, setGPctGerente] = useState("");
  const [saving, setSaving] = useState(false);

  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgColab, setCfgColab] = useState(commissionSettings.non_achievement_colaborador_pct || 0);
  const [cfgGerente, setCfgGerente] = useState(commissionSettings.non_achievement_gerente_pct || 0);
  const [savingCfg, setSavingCfg] = useState(false);
  // Felipe não estava achando onde ver a distribuição da meta entre colaboradores — antes só
  // aparecia no Início do gerente. Agora mostra aqui também, na própria aba onde a meta é criada,
  // visível a todo mundo que enxerga Metas (gerente/supervisor/sócio/master).
  const [openDistId, setOpenDistId] = useState(null);

  async function addGoal(e) {
    e.preventDefault();
    if (!gNome.trim() || gValor === "" || Number(gValor) <= 0) return;
    setSaving(true);
    const { data: goal, error } = await supabase
      .from("consorcio_goals")
      .insert({
        loja_id: lojaId,
        empresa_id: empresaId,
        month,
        name: gNome.trim(),
        store_total: Number(gValor),
        distribution_mode: "equal",
        commission_pct_colaborador: gPctColab === "" ? 0 : Number(gPctColab),
        commission_pct_gerente: gPctGerente === "" ? 0 : Number(gPctGerente),
      })
      .select()
      .single();
    if (!error && goal && activeEmpIds.length) {
      const amount = Number(gValor) / activeEmpIds.length;
      const rows = activeEmpIds.map((employee_id) => ({
        goal_id: goal.id,
        employee_id,
        amount,
        percentage: 100 / activeEmpIds.length,
        empresa_id: empresaId,
        loja_id: lojaId,
      }));
      await supabase.from("consorcio_goal_allocations").insert(rows);
    }
    setSaving(false);
    setGNome(""); setGValor(""); setGPctColab(""); setGPctGerente("");
    setFormOpen(false);
    notifySaved();
    await onChanged();
  }

  async function removeGoal(goalId) {
    if (!window.confirm("Excluir essa meta? A distribuição entre os colaboradores também é apagada.")) return;
    await supabase.from("consorcio_goal_allocations").delete().eq("goal_id", goalId);
    await supabase.from("consorcio_goals").delete().eq("id", goalId);
    await onChanged();
  }

  async function saveCfg(e) {
    e.preventDefault();
    setSavingCfg(true);
    await supabase.from("consorcio_commission_settings").upsert(
      {
        loja_id: lojaId,
        empresa_id: empresaId,
        month,
        non_achievement_colaborador_pct: Number(cfgColab) || 0,
        non_achievement_gerente_pct: Number(cfgGerente) || 0,
      },
      { onConflict: "loja_id,month" }
    );
    setSavingCfg(false);
    notifySaved();
    await onChanged();
  }

  const catNameById = {};
  produtoCategorias.forEach((c) => { catNameById[c.id] = c.nome; });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-navy flex items-center gap-2"><Wallet size={20} className="text-purple" /> Metas — {monthLabel(month)}</h1>
        <p className="text-xs text-muted mt-1">
          Vendido no mês: {formatBRL(soldLoja)}
          {storeMetaTotal > 0 && <> · Meta em jogo: {formatBRL(storeMetaTotal)}</>}
        </p>
      </div>

      {goals.length === 0 ? (
        <div className="card"><p className="text-sm text-muted">Nenhuma meta cadastrada para este mês ainda.</p></div>
      ) : (
        <div className={`grid gap-4 ${goals.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {goals.map((g, i) => {
            const target = Number(g.store_total);
            const progressPct = target > 0 ? Math.min(100, (soldLoja / target) * 100) : 0;
            const goalAllocs = allocations.filter((a) => a.goal_id === g.id);
            const borders = ["border-purple/25", "border-orange/25", "border-teal/25"];
            return (
              <div key={g.id} className={`card animate-pop ${borders[i % borders.length]}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-xs sm:text-sm text-navy flex items-center gap-1.5"><Target size={15} /> {g.name}</p>
                  {canManage && (
                    <button type="button" onClick={() => removeGoal(g.id)} title="Excluir" aria-label="Excluir" className="p-1 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <AutoFitText className="text-lg font-extrabold text-navy mt-1">{formatBRL(target)}</AutoFitText>
                <p className="text-[11px] text-muted mt-0.5">
                  {Number(g.commission_pct_colaborador) > 0 && `${Number(g.commission_pct_colaborador)}% comissão colaborador`}
                  {Number(g.commission_pct_gerente) > 0 && ` · ${Number(g.commission_pct_gerente)}% gerente`}
                </p>
                <div className="mt-3"><ProgressBar pct={progressPct} height="h-2" /></div>
                <button
                  type="button"
                  onClick={() => setOpenDistId((v) => (v === g.id ? null : g.id))}
                  className="w-full flex items-center justify-between gap-2 mt-2 text-left"
                >
                  <p className="text-[11px] text-muted">
                    {isEvenSplit(goalAllocs) ? `${goalAllocs.length} colaborador(es) · ${formatBRL(target / (goalAllocs.length || 1))} cada` : `${goalAllocs.length} colaborador(es), distribuição custom`}
                  </p>
                  {openDistId === g.id ? <ChevronUp size={14} className="text-muted shrink-0" /> : <ChevronDown size={14} className="text-muted shrink-0" />}
                </button>
                {openDistId === g.id && (
                  goalAllocs.length === 0 ? (
                    <p className="text-[11px] text-muted mt-1">Nenhuma distribuição — nenhum colaborador ativo na loja quando a meta foi criada.</p>
                  ) : (
                    <ul className="divide-y divide-line mt-1">
                      {goalAllocs.map((a) => {
                        const emp = employees.find((e) => e.id === a.employee_id);
                        return (
                          <li key={a.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                            <span className="text-navy truncate min-w-0">{emp?.full_name || "—"}</span>
                            <span className="text-muted shrink-0 whitespace-nowrap">{formatBRL(a.amount)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="card">
          <button type="button" onClick={() => setFormOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
            <p className="label mb-0 flex items-center gap-1.5"><Target size={14} /> Nova meta</p>
            {formOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
          </button>
          {formOpen && (
            <form onSubmit={addGoal} className="grid sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label">Nome (ex: Meta, Super Meta)</label>
                <input className="input" value={gNome} onChange={(e) => setGNome(e.target.value)} maxLength={30} required />
              </div>
              <div>
                <label className="label">Valor total da loja</label>
                <CurrencyInput value={gValor} onChange={setGValor} required />
              </div>
              <div>
                <label className="label">Comissão colaborador (%)</label>
                <input type="number" step="0.01" min="0" className="input" value={gPctColab} onChange={(e) => setGPctColab(e.target.value)} />
              </div>
              <div>
                <label className="label">Comissão gerente (%)</label>
                <input type="number" step="0.01" min="0" className="input" value={gPctGerente} onChange={(e) => setGPctGerente(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <button className="btn" type="submit" disabled={saving}>{saving ? "Salvando…" : "Criar meta"}</button>
                <p className="text-[11px] text-muted mt-2">Distribuída igualmente entre os {activeEmpIds.length} colaborador(es) ativo(s) da loja. Distribuição customizada por pessoa ainda não está disponível aqui — avise se precisar.</p>
              </div>
            </form>
          )}
        </div>
      )}

      {canManage && (
        <div className="card">
          <button type="button" onClick={() => setCfgOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
            <p className="label mb-0 flex items-center gap-1.5"><Coins size={14} /> Comissão de não atingimento</p>
            {cfgOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
          </button>
          {cfgOpen && (
            <form onSubmit={saveCfg} className="grid sm:grid-cols-2 gap-3 mt-3 items-end">
              <div>
                <label className="label">Colaborador (%)</label>
                <input type="number" step="0.01" min="0" className="input" value={cfgColab} onChange={(e) => setCfgColab(e.target.value)} />
              </div>
              <div>
                <label className="label">Gerente (%)</label>
                <input type="number" step="0.01" min="0" className="input" value={cfgGerente} onChange={(e) => setCfgGerente(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <button className="btn-outline !py-1.5 !text-xs" type="submit" disabled={savingCfg}>{savingCfg ? "Salvando…" : "Salvar"}</button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="card-dark">
        <p className="label-dark mb-3">Vendas do mês</p>
        {vendasMes.length === 0 ? (
          <p className="text-sm text-white/50">Nenhuma venda registrada este mês ainda.</p>
        ) : (
          <ul>
            {vendasMes.map((l) => {
              const emp = employees.find((e) => e.id === l.employee_id);
              return (
                <li key={l.id} className="row-card">
                  <Avatar name={emp?.full_name || "?"} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white text-xs sm:text-sm truncate">{emp?.full_name || "—"}</p>
                    <p className="text-[11px] text-white/50 truncate">{l.nome_completo} · {catNameById[l.categoria_produto_id] || "—"}</p>
                  </div>
                  <p className="font-bold text-goldlight text-xs sm:text-sm shrink-0 whitespace-nowrap">{formatBRL(l.valor)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

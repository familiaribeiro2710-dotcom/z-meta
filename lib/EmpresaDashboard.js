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
  Power,
  PhoneCall,
  Globe,
  Receipt,
  Search,
  ChevronLeft,
  ChevronRight,
  Phone,
  Calendar,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import ProgressBar from "./ProgressBar";
import CountUp from "./CountUp";
import DateNav from "./DateNav";
import SelectField from "./SelectField";
import Avatar from "./Avatar";
import AutoFitText from "./AutoFitText";
import ConfirmModal from "./ConfirmModal";
import { calcIndividualPct, formatBRL, currentGoalTarget } from "./scoring";
import { todayStr, firstDayOfMonth, nextMonth, monthLabel, isTaskDueOn, WEEKDAY_LABELS, daysElapsedInMonth, daysInMonth, remainingPeriodsInMonth, periodLabel, PACING_LABELS, goalPeriods, isPrizePeriodActive, prizeWindowLabel } from "./date";
import { useSavedNotice } from "./SavedNotice";
import { CurrencyInput } from "./MaskedInputs";

// Mesmas abas (Início/Metas) usadas na página do colaborador — exportado pra quem
// renderiza <EmpresaDashboard> passar pro AppShell e manter o mesmo layout/posição de abas.
export const EMPRESA_TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "metas", label: "Metas", Icon: Wallet },
  { key: "online", label: "Online", Icon: Globe },
  { key: "leads", label: "Leads", Icon: PhoneCall },
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
export default function EmpresaDashboard({ lojaId, empresaId, viewerRole = "master_admin", viewerId, tab = "atividades", month: monthProp, onOpenEmployee, onOpenGerente, atSub: atSubProp, onAtSubChange }) {
  const [loading, setLoading] = useState(true);
  // atSub (Placar/Colaboradores/Tarefas/Advertências/Premiações) pode ser controlado de fora
  // (atSub + onAtSubChange) quando quem renderiza este componente precisa saber qual sub-aba está
  // ativa pra decidir se mostra cards de apoio próprios (ex.: GerenteView/HierarchyHome só devem
  // mostrar "Metas da loja"/"Ranking de vendas"/etc. quando a sub-aba for "placar" — do contrário,
  // esses cards vazavam pra dentro de Colaboradores/Tarefas/Advertências/Premiações, que não têm
  // nada a ver com eles). Sem controle externo, cai no estado interno de sempre (master_admin, que
  // não tem cards de apoio fora daqui, não precisa se importar com isso).
  const [atSubInternal, setAtSubInternal] = useState("placar");
  const atSub = atSubProp !== undefined ? atSubProp : atSubInternal;
  const setAtSub = onAtSubChange || setAtSubInternal;
  const [metaSub, setMetaSub] = useState("metas");

  const [employees, setEmployees] = useState([]);
  const [gerentes, setGerentes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState({ warning_penalty_points: 10, team_threshold_pct: 95, monthly_prize: 1000 });
  const [prizes, setPrizes] = useState([]);
  // 2026-08-31: quais colaboradores tiveram o "prêmio do mês" (barra de atividades) validado pelo
  // gestor nesse mês/loja — existir linha em employee_prize_validations = validado.
  const [prizeValidations, setPrizeValidations] = useState([]);
  const [scoreboard, setScoreboard] = useState([]);

  const [goals, setGoals] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [entries, setEntries] = useState([]);
  const [commissionSettings, setCommissionSettings] = useState({ non_achievement_colaborador_pct: 0, non_achievement_gerente_pct: 0 });

  // Módulo "Online" (2026-07-27) — totalmente independente de sales_goals/sales_entries, tabelas
  // próprias (online_goals/online_sales). Meta com o MESMO alvo pra qualquer colaborador da loja
  // (não é meta de loja dividida em alocação por pessoa), premiação fixa em R$ por camada.
  const [onlineGoals, setOnlineGoals] = useState([]);
  const [onlineSales, setOnlineSales] = useState([]);
  // Aba "Leads" (2026-08-16, pedido do Felipe) — lista dos contatos/leads cadastrados via
  // "Ativação Online" (tabela online_activations). Independente do mês selecionado no topo da
  // tela (mesmo padrão da aba Leads do consórcio): busca tudo da loja de uma vez, o componente
  // filtra por período/colaborador internamente.
  const [onlineLeads, setOnlineLeads] = useState([]);
  // 2026-07-29: toggle + meta de contatos/dia da campanha "Ativação Online" (tarefa gerada
  // automaticamente pra cada colaborador via trigger no banco — ver sync_online_activation_tasks).
  // null = loja nunca ativou a campanha ainda.
  const [activationSettings, setActivationSettings] = useState(null);

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

    const { data: prizeValidationRows } = await supabase
      .from("employee_prize_validations")
      .select("employee_id")
      .eq("loja_id", lojaId)
      .eq("month", month);
    setPrizeValidations(prizeValidationRows || []);

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

    const { data: onlineGoalRows } = await supabase
      .from("online_goals")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("month", month)
      .order("target_amount", { ascending: true });
    setOnlineGoals(onlineGoalRows || []);
    const { data: onlineSaleRows } = await supabase
      .from("online_sales")
      .select("*")
      .eq("loja_id", lojaId)
      .gte("sale_date", month)
      .lt("sale_date", nextMonthStr)
      .order("sale_date", { ascending: false });
    setOnlineSales(onlineSaleRows || []);

    const { data: activationRow } = await supabase
      .from("online_activation_settings")
      .select("*")
      .eq("loja_id", lojaId)
      .maybeSingle();
    setActivationSettings(activationRow || null);

    // Leads da Ativação Online — sem filtro de mês de propósito (a aba Leads tem o próprio
    // filtro de período, independente do MonthNav do resto da tela).
    const { data: activationLeadRows } = await supabase
      .from("online_activations")
      .select("*")
      .eq("loja_id", lojaId)
      .order("contact_date", { ascending: false })
      .order("created_at", { ascending: false });
    setOnlineLeads(activationLeadRows || []);

    // "Esperado" da barra geral/individual NÃO pode vir de contar linhas de task_completions já
    // existentes — essas só nascem quando alguém abre o checklist daquele dia ("semeadura
    // preguiçosa"), então um colaborador cujo checklist ninguém abriu ainda entraria com
    // expected=0, e calcIndividualPct trata expected=0 como 100% (nota máxima por falta de dado,
    // não porque a pessoa realmente cumpriu tudo) — inflando a barra da equipe pra cima. Em vez
    // disso, calculamos os dias em que cada tarefa ATIVA valia (isTaskDueOn, do início do mês até
    // hoje — ou até o fim do mês, se for mês fechado) e só então cruzamos com as completions que
    // já existem. Só entram tarefas com active=true: uma tarefa excluída não pode inflar/desinflar
    // o total com completions históricas de quando ela existia.
    const { data: completions } = await supabase
      .from("task_completions")
      .select("task_id, completed, completion_date, tasks!inner(employee_id, loja_id)")
      .eq("tasks.loja_id", lojaId)
      .eq("tasks.active", true)
      .gte("completion_date", month)
      .lt("completion_date", nextMonthStr);
    const completionMap = {};
    (completions || []).forEach((c) => { completionMap[`${c.task_id}|${c.completion_date}`] = c.completed; });

    const activeTasksForBoard = (allTasks || []).filter((t) => t.active);
    const daysRangeBoard = daysElapsedInMonth(month, today);

    const soldThisMonth = (entryRows || []).filter((e) => e.entry_date >= month && e.entry_date < nextMonthStr);

    // placar/ranking só considera colaboradores ativos — a aba Colaboradores continua listando
    // todo mundo (inclusive inativos, pra dar pra reativar), mas não faz sentido um colaborador
    // desligado aparecer na barra da equipe ou no placar individual.
    const board = (emps || []).filter((emp) => emp.active).map((emp) => {
      const empTasks = activeTasksForBoard.filter((t) => t.employee_id === emp.id);
      let expected = 0, completed = 0;
      empTasks.forEach((t) => {
        daysRangeBoard.forEach((ds) => {
          if (!isTaskDueOn(t, ds)) return;
          expected++;
          if (completionMap[`${t.id}|${ds}`]) completed++;
        });
      });
      const wCount = (allWarnings || []).filter((w) => w.employee_id === emp.id).length;
      const pct = calcIndividualPct({ completed, expected, warningsCount: wCount, penaltyPerWarning: penalty });
      const sold = soldThisMonth.filter((e) => e.employee_id === emp.id).reduce((s, e) => s + Number(e.daily_amount || 0), 0);
      return { employee: emp, expected, completed, warnings: wCount, pct, sold };
    });
    setScoreboard(board);
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
              settings={settings}
              month={month}
              goals={goals}
              storeMetaTotal={storeMetaTotal}
              storeSoldTotal={storeSoldTotal}
              entries={entries}
              viewerRole={viewerRole}
              prizes={prizes}
              prizeValidations={prizeValidations}
              empresaId={empresaId}
              lojaId={lojaId}
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
              onChanged={refreshTeam}
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
            <Premiacoes
              employees={employees}
              gerentes={gerentes}
              viewerRole={viewerRole}
              prizes={prizes}
              month={month}
              empresaId={empresaId}
              lojaId={lojaId}
              settings={settings}
              onChanged={refresh}
              goals={goals}
              soldTotal={storeSoldTotal}
              onSaveExtraPrize={async (goalId, text, periodType, periodStart, periodEnd) => {
                await supabase.from("sales_goals").update({
                  non_monetary_prize: text || null,
                  prize_period_type: periodType || "mes",
                  prize_period_start: periodStart,
                  prize_period_end: periodEnd,
                }).eq("id", goalId);
                await refresh();
              }}
            />
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
              soldTotal={storeSoldTotal}
            />
          )}
          {metaSub === "lancamentos" && (
            <Lancamentos employees={employees} entries={entries} month={month} empresaId={empresaId} lojaId={lojaId} onChanged={refresh} viewerRole={viewerRole} />
          )}
        </div>
      )}

      {tab === "online" && (
        <OnlineTab
          employees={employees}
          onlineGoals={onlineGoals}
          onlineSales={onlineSales}
          activationSettings={activationSettings}
          lojaId={lojaId}
          empresaId={empresaId}
          month={month}
          viewerRole={viewerRole}
          onChanged={refresh}
        />
      )}

      {tab === "leads" && (
        <OnlineLeadsTab employees={employees} leads={onlineLeads} />
      )}
    </div>
  );
}

export function SubNav({ subs, active, onChange }) {
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

// versão compacta de formatBRL pra caber dentro de uma célula de calendário (ex.: "1,9k" em vez
// de "R$ 1.900,00") — o "R$" já fica implícito pelo contexto (título "Vendas do mês" acima).
function formatCompactBRL(n) {
  const v = Number(n) || 0;
  if (v <= 0) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(".", ",").replace(",0", "")}k`;
  return v.toFixed(0);
}

function Placar({ scoreboard, settings, month, viewerRole = "master_admin", goals = [], storeMetaTotal = 0, storeSoldTotal = 0, entries = [], prizes = [], prizeValidations = [], empresaId, lojaId, onChanged }) {
  const notifySaved = useSavedNotice();
  const isSupervisorView = viewerRole === "supervisor" || viewerRole === "socio";
  // 2026-08-31, pedido do Felipe: o "prêmio do mês" (gate pela barra individual x
  // settings.team_threshold_pct) deixa de ser só informativo — o gestor decide, por colaborador/mês,
  // se as premiações JÁ REGISTRADAS pra ele (lançadas normalmente na aba Premiações, com o valor
  // real) entram no relatório mensal. Validar/descartar NÃO cria nem apaga premiação nenhuma — só
  // grava a decisão em employee_prize_validations (existir linha = validado). Redesenhado depois
  // que a 1ª versão inseria uma premiação fake com o valor da VERBA da loja (monthly_prize), que
  // não é o valor individual de ninguém — bug real apontado pelo Felipe.
  const canValidatePrize = viewerRole !== "leitor";
  const [confirmPrizeAction, setConfirmPrizeAction] = useState(null); // { type: "validate"|"discard", employee }
  const [savingPrizeAction, setSavingPrizeAction] = useState(false);

  function isPrizeValidated(employeeId) {
    return prizeValidations.some((v) => v.employee_id === employeeId);
  }

  async function runPrizeAction() {
    if (!confirmPrizeAction) return;
    setSavingPrizeAction(true);
    const { type, employee } = confirmPrizeAction;
    if (type === "validate") {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from("employee_prize_validations").upsert({
        employee_id: employee.id,
        month,
        loja_id: lojaId,
        empresa_id: empresaId,
        validated_by: session.user.id,
        validated_at: new Date().toISOString(),
      });
    } else {
      await supabase.from("employee_prize_validations").delete().eq("employee_id", employee.id).eq("month", month);
    }
    setSavingPrizeAction(false);
    setConfirmPrizeAction(null);
    notifySaved(type === "validate" ? "Premiação validada com sucesso." : "Validação descartada com sucesso.");
    onChanged && onChanged();
  }

  const salesPct = storeMetaTotal > 0 ? Math.min(100, (storeSoldTotal / storeMetaTotal) * 100) : 0;
  const activeGoalId = goals.find((g) => storeSoldTotal < Number(g.store_total))?.id ?? goals[goals.length - 1]?.id;

  // ranqueado do maior pro menor valor vendido no mês
  const ranked = [...scoreboard].sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0));
  const leader = ranked.find((b) => Number(b.sold || 0) > 0);

  // Venda diária da loja — navegável dia a dia com as setinhas do DateNav, mas sincronizada com
  // o mês em exibição (month/MonthNav do resto da tela): mês corrente começa e vai até hoje; mês
  // fechado sendo revisado começa e trava no último dia DAQUELE mês, nunca mostra "hoje" de um
  // período diferente do que está selecionado. `entries` já vem sem filtro de data (loadAll busca
  // toda a loja), então filtra direto sem query nova. Soma de TODOS os colaboradores da loja, não
  // só da equipe de quem olha.
  const today = todayStr();
  const isCurrentMonthView = month === firstDayOfMonth(today);
  const monthLastDay = `${month.slice(0, 7)}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const maxViewDate = isCurrentMonthView ? today : monthLastDay;
  const [viewDate, setViewDate] = useState(maxViewDate);
  useEffect(() => {
    setViewDate(maxViewDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);
  const storeSoldOnDate = entries
    .filter((e) => e.entry_date === viewDate)
    .reduce((s, e) => s + Number(e.daily_amount || 0), 0);

  // 2026-08-17 (pedido do Felipe, mockup aprovado): calendário do mês com a venda de cada dia,
  // aberto ao tocar no card "Venda da loja". Navega livremente entre meses (trava em não passar do
  // mês corrente) independente do MonthNav do resto da tela — é só uma lupa sobre o histórico que
  // já está carregado em `entries` (sem filtro de mês), então não precisa de query nova.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(month);

  function openCalendar() {
    setCalendarMonth(month);
    setCalendarOpen(true);
  }

  function shiftCalendarMonth(delta) {
    const [y, m] = calendarMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    if (next > firstDayOfMonth(today)) return;
    setCalendarMonth(next);
  }

  function selectCalendarDay(dateStr) {
    if (dateStr > today) return;
    setViewDate(dateStr);
    setCalendarOpen(false);
  }

  const calendarNextMonth = nextMonth(calendarMonth);
  const dayTotals = {};
  entries.forEach((e) => {
    if (e.entry_date >= calendarMonth && e.entry_date < calendarNextMonth) {
      dayTotals[e.entry_date] = (dayTotals[e.entry_date] || 0) + Number(e.daily_amount || 0);
    }
  });
  const calendarMonthTotal = Object.values(dayTotals).reduce((s, v) => s + v, 0);
  const calDays = daysInMonth(calendarMonth);
  const calFirstWeekday = new Date(calendarMonth + "T00:00:00").getDay();
  const calAtMax = calendarMonth >= firstDayOfMonth(today);

  return (
    <div className="space-y-6">
      {(viewerRole === "gerente" || isSupervisorView) && (
        <div className="card-dark animate-pop cursor-pointer" onClick={openCalendar}>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <p className="label-dark mb-0 flex items-center gap-1.5"><Coins size={14} className="text-goldlight" /> Venda da loja</p>
            <div onClick={(e) => e.stopPropagation()}>
              <DateNav date={viewDate} onChange={setViewDate} maxDate={maxViewDate} todayDate={today} dark />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <AutoFitText className="text-3xl sm:text-4xl font-extrabold text-white">{formatBRL(storeSoldOnDate)}</AutoFitText>
            <span className="text-[11px] font-bold text-goldlight flex items-center gap-1 shrink-0 whitespace-nowrap">
              <Calendar size={13} /> ver calendário
            </span>
          </div>
          <p className="text-xs text-white/50 mt-1">Soma das vendas de todos os colaboradores da loja nesse dia. Toque para ver o mês inteiro.</p>
        </div>
      )}

      {calendarOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]"
          onClick={() => setCalendarOpen(false)}
        >
          <div className="min-h-full flex items-start sm:items-center justify-center">
            <div className="card max-w-sm w-full my-8 sm:my-0 animate-bounce-in border-gold/30" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-navy flex items-center gap-1.5">
                  <Calendar size={16} /> Vendas do mês
                </h2>
                <button
                  type="button"
                  onClick={() => setCalendarOpen(false)}
                  aria-label="Fechar"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:bg-line/60 transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center justify-center gap-3 mt-3 mb-1">
                <button
                  type="button"
                  onClick={() => shiftCalendarMonth(-1)}
                  aria-label="Mês anterior"
                  className="w-7 h-7 rounded-full border-2 border-line flex items-center justify-center text-muted hover:border-gold/50 hover:text-gold transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-sm font-extrabold text-navy min-w-[130px] text-center">{monthLabel(calendarMonth)}</span>
                <button
                  type="button"
                  onClick={() => shiftCalendarMonth(1)}
                  disabled={calAtMax}
                  aria-label="Próximo mês"
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                    calAtMax ? "border-line text-line cursor-not-allowed" : "border-line text-muted hover:border-gold/50 hover:text-gold"
                  }`}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <p className="text-xs text-muted text-center mb-4">
                Total vendido no mês: <span className="font-bold text-navy">{formatBRL(calendarMonthTotal)}</span>
              </p>

              <div className="grid grid-cols-7 gap-1.5">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <div key={i} className="text-[10px] font-extrabold uppercase text-muted text-center pb-1">{d}</div>
                ))}
                {Array.from({ length: calFirstWeekday }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: calDays }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${calendarMonth.slice(0, 7)}-${String(dayNum).padStart(2, "0")}`;
                  const amt = dayTotals[dateStr] || 0;
                  const isToday = dateStr === today;
                  const isSelected = dateStr === viewDate;
                  const isFuture = dateStr > today;
                  return (
                    <button
                      type="button"
                      key={dateStr}
                      disabled={isFuture}
                      onClick={() => selectCalendarDay(dateStr)}
                      className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                        isSelected ? "bg-navy border-navy" : isToday ? "border-gold bg-white" : "border-line bg-white"
                      } ${isFuture ? "opacity-30 cursor-not-allowed" : "hover:border-gold/60"}`}
                    >
                      <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-navy"}`}>{dayNum}</span>
                      <span className={`text-[8px] font-bold ${isSelected ? "text-goldlight" : amt > 0 ? "text-muted" : "text-line"}`}>
                        {formatCompactBRL(amt)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-muted font-semibold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] border-2 border-gold inline-block" /> hoje</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-navy inline-block" /> selecionado</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSupervisorView ? (
        <div className="card animate-pop">
          <p className="label flex items-center gap-1.5"><Trophy size={14} /> Barra de vendas — {monthLabel(month)}</p>
          <ProgressBar pct={salesPct} />
          <p className="text-xs text-muted mt-2">{formatBRL(storeSoldTotal)} vendido de {formatBRL(storeMetaTotal)} de meta.</p>
        </div>
      ) : (
        <div className="card animate-pop">
          <p className="label flex items-center gap-1.5"><Trophy size={14} /> Atividades — premiação por colaborador</p>
          <p className="text-[11px] text-muted mb-3">Cada colaborador responde só pela própria barra. Mínimo pra premiação: {settings.team_threshold_pct}%.</p>
          <ul className="divide-y divide-line">
            {scoreboard.map((b) => {
              const released = Number(b.pct) >= Number(settings.team_threshold_pct);
              const validated = isPrizeValidated(b.employee.id);
              // soma real do que já foi lançado pra esse colaborador na aba Premiações esse mês —
              // só informativo aqui (não é criado nem alterado por validar/descartar).
              const empPrizeTotal = prizes.filter((p) => p.employee_id === b.employee.id).reduce((s, p) => s + Number(p.amount || 0), 0);
              return (
                <li key={b.employee.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium text-navy truncate">{b.employee.full_name}</span>
                    <span className={`shrink-0 whitespace-nowrap text-[11px] font-bold flex items-center gap-1 ${released ? "text-success" : "text-danger"}`}>
                      {released ? <PartyPopper size={12} /> : <Frown size={12} />}
                      {released ? "liberada" : "abaixo do mínimo"}
                    </span>
                  </div>
                  <ProgressBar pct={b.pct} threshold={settings.team_threshold_pct} height="h-2" />
                  {canValidatePrize && (
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className={`text-[11px] font-bold flex items-center gap-1 ${validated ? "text-gold" : "text-muted"}`}>
                        {validated ? <><Gift size={12} className="shrink-0" /> Validada{empPrizeTotal > 0 ? ` — ${formatBRL(empPrizeTotal)} registrado` : ""}</> : "Ainda não validada"}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          title="Validar premiação"
                          aria-label="Validar premiação"
                          disabled={savingPrizeAction}
                          onClick={() => setConfirmPrizeAction({ type: "validate", employee: b.employee })}
                          className={`w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center transition disabled:opacity-60 ${
                            validated ? "bg-gold border-gold text-white" : "border-line text-muted hover:border-gold/50 hover:text-gold hover:bg-gold/5"
                          }`}
                        >
                          <Check size={15} strokeWidth={3} />
                        </button>
                        <button
                          type="button"
                          title="Descartar validação"
                          aria-label="Descartar validação"
                          disabled={savingPrizeAction}
                          onClick={() => setConfirmPrizeAction({ type: "discard", employee: b.employee })}
                          className="w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center transition disabled:opacity-60 border-line text-muted hover:border-danger/50 hover:text-danger hover:bg-danger/5"
                        >
                          <X size={15} strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {scoreboard.length === 0 && (
              <p className="text-sm text-muted py-2">Nenhum colaborador ativo nessa loja.</p>
            )}
          </ul>
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
                      {activeGoalId === g.id && <span className="badge bg-gold/15 text-gold shrink-0">em jogo</span>}
                    </span>
                    <span className="text-muted shrink-0 whitespace-nowrap">{formatBRL(target)}</span>
                  </div>
                  <div className="mt-1.5"><ProgressBar pct={goalPct} height="h-2" /></div>
                  {activeGoalId === g.id && g.non_monetary_prize && (
                    <p className="text-[11px] font-bold text-navy mt-1.5 flex items-center gap-1.5">
                      <PartyPopper size={12} className="shrink-0" /> Prêmio extra: {g.non_monetary_prize}
                    </p>
                  )}
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
        <div className="card-dark animate-pop">
          <p className="label-dark mb-2 flex items-center gap-1.5"><Trophy size={14} className="text-goldlight" /> Líder de vendas até agora — {monthLabel(month)}</p>
          <p className="text-lg font-extrabold text-white">{leader.employee.full_name}</p>
          <p className="text-sm text-white/50"><CountUp value={leader.sold} currency /> vendido no mês</p>
        </div>
      )}

      <ConfirmModal
        open={!!confirmPrizeAction}
        title={confirmPrizeAction?.type === "validate" ? "Validar premiação do mês?" : "Descartar validação?"}
        message={
          confirmPrizeAction
            ? confirmPrizeAction.type === "validate"
              ? `As premiações já registradas para ${confirmPrizeAction.employee.full_name} em ${monthLabel(month)} vão passar a aparecer no relatório mensal.`
              : `As premiações de ${confirmPrizeAction.employee.full_name} em ${monthLabel(month)} deixam de aparecer no relatório mensal — elas continuam existindo normalmente, só saem do relatório.`
            : ""
        }
        confirmLabel={confirmPrizeAction?.type === "validate" ? "Validar" : "Descartar"}
        danger={confirmPrizeAction?.type === "discard"}
        onConfirm={runPrizeAction}
        onCancel={() => setConfirmPrizeAction(null)}
      />
    </div>
  );
}

// Cadastro de supervisor a partir da aba Colaboradores — só pro sócio (o supervisor não cria outro
// supervisor, e o master admin já tem seu próprio fluxo de cadastro universal em app/admin/page.js).
// Diferente de gerente/colaborador, o acesso de um supervisor não é preso a uma loja só, então esse
// componente busca TODAS as lojas da empresa (via empresaId), não só a loja selecionada no momento.
function NovoSupervisor({ empresaId, onChanged }) {
  const [open, setOpen] = useState(false);
  const [lojas, setLojas] = useState([]);
  const [lojasLoaded, setLojasLoaded] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [picked, setPicked] = useState({});
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open || lojasLoaded) return;
    (async () => {
      const { data } = await supabase.from("lojas").select("id, name").eq("empresa_id", empresaId).order("name");
      setLojas((data || []).map((l) => ({ loja_id: l.id, loja_name: l.name })));
      setLojasLoaded(true);
    })();
  }, [open, empresaId, lojasLoaded]);

  function togglePicked(id) {
    setPicked((p) => {
      const next = { ...p };
      if (next[id]) delete next[id];
      else next[id] = "ver";
      return next;
    });
  }
  function setPickedPermission(id, permission) {
    setPicked((p) => ({ ...p, [id]: permission }));
  }

  async function createSupervisor(e) {
    e.preventDefault();
    const selected = Object.entries(picked).map(([lojaId, permission]) => ({ lojaId, permission }));
    if (!fullName.trim() || selected.length === 0) {
      setMsg("Erro: preencha o nome e selecione ao menos uma loja.");
      return;
    }
    setCreating(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-hierarchy", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ role: "supervisor", empresaId, fullName: fullName.trim(), username: username.trim(), lojaAccess: selected }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setMsg(`Supervisor criado! Usuário: ${json.username}${json.defaultPassword ? ` · senha padrão: ${json.defaultPassword}` : ""}`);
    setFullName(""); setUsername(""); setPicked({});
    onChanged && onChanged();
  }

  return (
    <div className="card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 whitespace-nowrap m-0 text-xs uppercase tracking-wider text-muted font-bold">
          <ShieldCheck size={14} className="shrink-0" /> Novo supervisor
        </p>
        {open ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
      </button>
      {open && (
        !lojasLoaded ? (
          <p className="text-xs text-muted mt-3">carregando lojas…</p>
        ) : lojas.length === 0 ? (
          <p className="text-xs text-muted mt-3">Cadastre uma loja antes de incluir um supervisor.</p>
        ) : (
          <form onSubmit={createSupervisor} className="mt-3 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Nome completo</label>
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={18} required />
              </div>
              <div>
                <label className="label">Usuário (id de login)</label>
                <input className="input" placeholder="gerado automaticamente se vazio" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} />
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5">Lojas com acesso</p>
              <div className="space-y-1.5">
                {lojas.map((l) => {
                  const perm = picked[l.loja_id];
                  return (
                    <div key={l.loja_id} className="flex items-center justify-between gap-2 text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={!!perm} onChange={() => togglePicked(l.loja_id)} />
                        {l.loja_name}
                      </label>
                      {perm && (
                        <div className="flex items-center gap-1">
                          {["ver", "gerenciar"].map((opt) => (
                            <button
                              type="button"
                              key={opt}
                              onClick={() => setPickedPermission(l.loja_id, opt)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                                perm === opt ? "bg-navy text-white border-navy" : "border-line text-muted hover:border-navy"
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <button className="btn" type="submit" disabled={creating}>{creating ? "Criando…" : "Criar supervisor"}</button>
            <p className="text-[11px] text-muted">A senha padrão (123456789) é definida automaticamente. O supervisor troca no primeiro acesso.</p>
            {msg && (
              <p className="text-xs text-muted flex items-center gap-1.5">
                {msg.startsWith("Erro") ? <AlertTriangle size={13} className="text-danger" /> : <CheckCircle2 size={13} className="text-success" />}
                {msg}
              </p>
            )}
          </form>
        )
      )}
    </div>
  );
}

// Lista de referência (só leitura) dos supervisores já cadastrados na empresa — aparece antes do
// "Novo gerente" pro sócio ver, de relance, quem já existe na camada acima antes de cadastrar mais
// gente. Gestão completa (editar/redefinir senha/lojas/ativar/excluir) continua exclusiva da aba
// Supervisores, pra não duplicar a mesma lógica em dois lugares.
function SupervisoresList({ empresaId, refreshKey }) {
  const [supervisores, setSupervisores] = useState([]);
  const [access, setAccess] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sups } = await supabase.from("profiles").select("*").eq("role", "supervisor").eq("empresa_id", empresaId).order("full_name");
      setSupervisores(sups || []);
      const ids = (sups || []).map((s) => s.id);
      const { data: acc } = ids.length
        ? await supabase.from("loja_access").select("*").in("profile_id", ids)
        : { data: [] };
      setAccess(acc || []);
      setLoaded(true);
    })();
  }, [empresaId, refreshKey]);

  return (
    <div className="card">
      <p className="label mb-3 flex items-center gap-1.5"><ShieldCheck size={14} /> Supervisores ({supervisores.length})</p>
      {!loaded ? (
        <p className="text-xs text-muted">carregando…</p>
      ) : supervisores.length === 0 ? (
        <p className="text-sm text-muted">Nenhum supervisor cadastrado ainda nessa empresa.</p>
      ) : (
        <ul className="divide-y divide-line">
          {supervisores.map((s) => {
            const myAccess = access.filter((a) => a.profile_id === s.id);
            return (
              <li key={s.id} className="py-2.5 text-sm">
                <div className="flex items-center gap-2.5">
                  <Avatar name={s.full_name} avatarUrl={s.avatar_url} size={32} />
                  <div className="min-w-0">
                    <p className={`font-medium ${s.active === false ? "text-muted line-through" : "text-navy"}`}>{s.full_name}</p>
                    <p className="text-xs text-muted truncate">
                      usuário: {s.username}
                      {myAccess.length > 0 ? ` · ${myAccess.length} loja(s)` : " · sem loja vinculada"}
                      {!s.active && " · inativo"}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Colaboradores({ employees, gerentes = [], viewerRole = "master_admin", empresaId, lojaId, onChanged, onOpenEmployee, onOpenGerente }) {
  const notifySaved = useSavedNotice();
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
  const [gerenteFormOpen, setGerenteFormOpen] = useState(false);
  const [colabFormOpen, setColabFormOpen] = useState(false);
  const [supervisoresVersion, setSupervisoresVersion] = useState(0);
  // 2026-07-20: ativar/desativar/redefinir senha/excluir (colaborador ou gerente) agora passam
  // por <ConfirmModal> (antes/durante) + notifySaved (depois) em vez de window.confirm/alert —
  // mesmo padrão já usado em app/admin/page.js pra empresa/loja. Um state só cobre as 4 ações
  // porque são sempre 1 de cada vez, nunca simultâneas.
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'toggle'|'delete'|'reset', target }
  // 2026-08-04 (pedido do Felipe): excluir usuário (colaborador ou gerente) passou a ser exclusivo
  // do Master Admin — gerente/sócio/supervisor continuam vendo o botão de excluir (não escondido,
  // só redirecionado), mas ao clicar caem nesse modal de "fale com o suporte" em vez do fluxo
  // normal de confirmação. O bloqueio de verdade está também na API (delete-employee/route.js),
  // esse aqui é só a experiência — sem os dois, um usuário avançado poderia chamar a rota direto.
  const [supportBlockOpen, setSupportBlockOpen] = useState(false);

  function requestDelete(target) {
    if (viewerRole !== "master_admin") {
      setSupportBlockOpen(true);
      return;
    }
    setConfirmAction({ type: "delete", target });
  }

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
    setMsg(
      json.pending
        ? `Cadastro enviado! Usuário: ${json.username} · senha padrão: ${json.defaultPassword}. Aguardando aprovação do Master Admin antes de conseguir acessar.`
        : `Colaborador criado! Usuário: ${json.username} · senha padrão: ${json.defaultPassword} (o colaborador troca no primeiro acesso).`
    );
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
    setGMsg(json.pending ? `Cadastro enviado! Usuário: ${json.username}. Aguardando aprovação do Master Admin antes de conseguir acessar.` : `Gerente criado! Usuário: ${json.username}`);
    setGName(""); setGUsername(""); setGPassword(""); setGTeam([]); setGTeamOpen(false);
    onChanged();
  }

  async function toggleActive(emp) {
    const nextActive = !emp.active;
    const { error } = await supabase.from("profiles").update({ active: nextActive }).eq("id", emp.id);
    if (error) throw new Error(error.message || "não foi possível atualizar.");
    notifySaved(`${emp.full_name} ${nextActive ? "ativado(a)" : "desativado(a)"} com sucesso.`);
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
    notifySaved();
    onChanged();
  }

  async function resetPassword(user) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/update-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ employeeId: user.id, resetPassword: true }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "não foi possível redefinir.");
    notifySaved(`Senha de ${user.full_name} redefinida para 123456789.`);
    onChanged();
  }

  async function removeEmployee(emp) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/delete-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ employeeId: emp.id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "não foi possível excluir.");
    notifySaved(`${emp.full_name} excluído(a) com sucesso.`);
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
    notifySaved();
    onChanged();
  }

  return (
    <div className="space-y-6">
      {viewerRole === "socio" && (
        <NovoSupervisor empresaId={empresaId} onChanged={() => { onChanged(); setSupervisoresVersion((v) => v + 1); }} />
      )}
      {viewerRole === "socio" && <SupervisoresList empresaId={empresaId} refreshKey={supervisoresVersion} />}

      {canManageTeams && (
        <div className="card">
          <button type="button" onClick={() => setGerenteFormOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 whitespace-nowrap m-0 text-xs uppercase tracking-wider text-muted font-bold">
              <ShieldCheck size={14} className="shrink-0" /> Novo gerente
            </p>
            {gerenteFormOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
          </button>
          {gerenteFormOpen && (
          <form onSubmit={handleCreateGerente} className="grid sm:grid-cols-2 gap-4 mt-3">
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
                      <label key={emp.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-paper transition-colors ${gTeam.includes(emp.id) ? "text-gold font-medium" : "text-navy"}`}>
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
          )}
          {gerenteFormOpen && gMsg && (
            <p className="text-xs text-muted mt-2 flex items-center gap-1.5">
              {gMsg.startsWith("Erro") ? <AlertTriangle size={13} className="text-danger" /> : <CheckCircle2 size={13} className="text-success" />}
              {gMsg}
            </p>
          )}
        </div>
      )}

      {canManageTeams && (
        <div className="card-dark">
          <p className="label-dark mb-3 flex items-center gap-1.5"><ShieldCheck size={14} className="text-goldlight" /> Gerentes ({gerentes.length})</p>
          <ul>
            {gerentes.map((g) => (
              <li key={g.id} className="row-card justify-between flex-wrap">
                {editingGerenteId === g.id ? (
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <Avatar name={g.full_name} avatarUrl={g.avatar_url} size={32} />
                    <input className="input !py-1.5 !text-sm w-40" value={editGerenteName} onChange={(e) => setEditGerenteName(e.target.value)} placeholder="Nome completo" maxLength={18} autoFocus />
                    <input className="input !py-1.5 !text-sm w-32" value={editGerenteUsername} onChange={(e) => setEditGerenteUsername(e.target.value)} placeholder="Usuário" maxLength={20} />
                    <button onClick={() => saveEditGerente(g)} disabled={savingGerenteEdit} title="Salvar" aria-label="Salvar" className="p-1.5 rounded-lg text-success hover:bg-success/15 transition-colors disabled:opacity-40">
                      <Check size={16} strokeWidth={2.5} />
                    </button>
                    <button onClick={() => { setEditingGerenteId(null); setEditGerenteMsg(""); }} title="Cancelar" aria-label="Cancelar" className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                      <X size={16} />
                    </button>
                    {editGerenteMsg && <p className="text-[11px] text-danger w-full">{editGerenteMsg}</p>}
                  </div>
                ) : onOpenGerente ? (
                  <button type="button" onClick={() => onOpenGerente(g)} className="flex items-center gap-2.5 text-left hover:opacity-75 transition-opacity" title="Ver como este gerente">
                    <Avatar name={g.full_name} avatarUrl={g.avatar_url} size={32} />
                    <div>
                      <p className="font-medium text-white flex items-center gap-1.5">{g.full_name} <Eye size={12} className="text-white/50" /></p>
                      <p className="text-xs text-white/50">usuário: {g.username} · {employees.filter((e) => e.gerente_id === g.id).length} colaborador(es){!g.active ? " · inativo" : ""}</p>
                    </div>
                  </button>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={g.full_name} avatarUrl={g.avatar_url} size={32} />
                    <span>
                      <p className="font-medium text-white">{g.full_name}</p>
                      <p className="text-xs text-white/50">usuário: {g.username}{!g.active ? " · inativo" : ""}</p>
                    </span>
                  </div>
                )}
                {editingGerenteId !== g.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEditGerente(g)} title="Editar" aria-label="Editar" className="p-1.5 rounded-lg text-white/60 hover:text-goldlight hover:bg-white/10 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: "reset", target: g })}
                      title="Redefinir senha para 123456789"
                      aria-label="Redefinir senha"
                      className="p-1.5 rounded-lg text-white/60 hover:text-warn hover:bg-white/10 transition-colors"
                    >
                      <KeyRound size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: "toggle", target: g })}
                      title={g.active ? "Desativar" : "Ativar"}
                      aria-label={g.active ? "Desativar" : "Ativar"}
                      className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ${g.active ? "text-white/60 hover:text-white" : "text-danger"}`}
                    >
                      <Power size={14} />
                    </button>
                    <button onClick={() => requestDelete(g)} title="Excluir" aria-label="Excluir" className="p-1.5 rounded-lg text-white/60 hover:text-danger hover:bg-white/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
            {gerentes.length === 0 && <p className="text-sm text-white/50 py-2">Nenhum gerente cadastrado ainda nessa loja.</p>}
          </ul>
        </div>
      )}

      {canEdit && (
      <div className="card">
        <button type="button" onClick={() => setColabFormOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 whitespace-nowrap m-0 text-xs uppercase tracking-wider text-muted font-bold">
            <Plus size={14} className="shrink-0" /> Novo colaborador
          </p>
          {colabFormOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
        </button>
        {colabFormOpen && (
        <>
        <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4 mt-3">
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
              <SelectField className="w-full" value={gerenteId} onChange={(e) => setGerenteId(e.target.value)}>
                <option value="">— sem equipe por enquanto —</option>
                {gerentes.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
              </SelectField>
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
        </>
        )}
      </div>
      )}

      <div className="card-dark">
        <p className="label-dark mb-3 flex items-center gap-1.5"><Users size={14} className="text-goldlight" /> Equipe ({employees.length})</p>
        <ul>
          {employees.map((emp) => (
            <li key={emp.id} className="row-card justify-between flex-wrap">
              {editingId === emp.id ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <Avatar name={emp.full_name} avatarUrl={emp.avatar_url} size={32} />
                  <input className="input !py-1.5 !text-sm w-40" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome completo" maxLength={18} autoFocus />
                  <input className="input !py-1.5 !text-sm w-32" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="Usuário" maxLength={20} />
                  {canManageTeams && (
                    <SelectField className="w-40 shrink-0" value={editGerenteId} onChange={(e) => setEditGerenteId(e.target.value)}>
                      <option value="">— sem equipe —</option>
                      {gerentes.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
                    </SelectField>
                  )}
                  <button onClick={() => saveEdit(emp)} disabled={savingEdit} title="Salvar" aria-label="Salvar" className="p-1.5 rounded-lg text-success hover:bg-success/15 transition-colors disabled:opacity-40">
                    <Check size={16} strokeWidth={2.5} />
                  </button>
                  <button onClick={() => { setEditingId(null); setEditMsg(""); }} title="Cancelar" aria-label="Cancelar" className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                    <X size={16} />
                  </button>
                  {editMsg && <p className="text-[11px] text-danger w-full">{editMsg}</p>}
                </div>
              ) : onOpenEmployee ? (
                <button type="button" onClick={() => onOpenEmployee(emp)} className="flex items-center gap-2.5 text-left hover:opacity-75 transition-opacity" title="Ver como este colaborador">
                  <Avatar name={emp.full_name} avatarUrl={emp.avatar_url} size={32} />
                  <div>
                    <p className="font-medium text-white flex items-center gap-1.5">{emp.full_name} <Eye size={12} className="text-white/50" /></p>
                    <p className="text-xs text-white/50">usuário: {emp.username}{canManageTeams ? ` · equipe: ${gerenteName(emp.gerente_id)}` : ""}</p>
                  </div>
                </button>
              ) : (
                <div className="flex items-center gap-2.5">
                  <Avatar name={emp.full_name} avatarUrl={emp.avatar_url} size={32} />
                  <div>
                    <p className="font-medium text-white">{emp.full_name}</p>
                    <p className="text-xs text-white/50">usuário: {emp.username}</p>
                  </div>
                </div>
              )}
              {editingId !== emp.id && canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(emp)} title="Editar" aria-label="Editar" className="p-1.5 rounded-lg text-white/60 hover:text-goldlight hover:bg-white/10 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmAction({ type: "reset", target: emp })}
                    title="Redefinir senha para 123456789"
                    aria-label="Redefinir senha"
                    className="p-1.5 rounded-lg text-white/60 hover:text-warn hover:bg-white/10 transition-colors"
                  >
                    <KeyRound size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmAction({ type: "toggle", target: emp })}
                    title={emp.active ? "Desativar" : "Ativar"}
                    aria-label={emp.active ? "Desativar" : "Ativar"}
                    className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ${emp.active ? "text-white/60 hover:text-white" : "text-danger"}`}
                  >
                    <Power size={14} />
                  </button>
                  <button onClick={() => requestDelete(emp)} title="Excluir" aria-label="Excluir" className="p-1.5 rounded-lg text-white/60 hover:text-danger hover:bg-white/10 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
          {employees.length === 0 && <p className="text-sm text-white/50 py-2">Nenhum colaborador cadastrado ainda.</p>}
        </ul>
      </div>

      <ConfirmModal
        open={!!confirmAction}
        title={
          !confirmAction ? "" :
          confirmAction.type === "delete" ? `Excluir ${confirmAction.target.full_name}?` :
          confirmAction.type === "reset" ? `Redefinir senha de ${confirmAction.target.full_name}?` :
          `${confirmAction.target.active ? "Desativar" : "Ativar"} ${confirmAction.target.full_name}?`
        }
        message={
          !confirmAction ? "" :
          confirmAction.type === "delete" ? "Essa ação não pode ser desfeita — o acesso é removido definitivamente (tarefas, vendas/leads e histórico continuam no banco)." :
          confirmAction.type === "reset" ? "A senha volta para 123456789 e a pessoa precisa trocar no próximo acesso." :
          confirmAction.target.active ? "A pessoa perde o acesso até você reativar." : "A pessoa recupera o acesso imediatamente."
        }
        confirmLabel={
          !confirmAction ? "Confirmar" :
          confirmAction.type === "delete" ? "Excluir" :
          confirmAction.type === "reset" ? "Redefinir" :
          confirmAction.target.active ? "Desativar" : "Ativar"
        }
        danger={!!confirmAction && (confirmAction.type === "delete" || (confirmAction.type === "toggle" && confirmAction.target.active))}
        confirmText={confirmAction?.type === "delete" ? confirmAction.target.full_name : undefined}
        onConfirm={async () => {
          if (confirmAction.type === "delete") await removeEmployee(confirmAction.target);
          else if (confirmAction.type === "reset") await resetPassword(confirmAction.target);
          else await toggleActive(confirmAction.target);
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {supportBlockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6" onClick={() => setSupportBlockOpen(false)}>
          <div className="card max-w-sm w-full animate-bounce-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-extrabold text-navy flex items-center gap-2">
              <ShieldCheck className="text-gold shrink-0" size={20} /> Exclusão só pelo Master Admin
            </h2>
            <p className="text-sm text-muted mt-2">
              Por segurança, excluir um usuário só pode ser feito pelo Master Admin. Entre em contato com o suporte pra solicitar essa exclusão.
            </p>
            <button className="btn w-full mt-5" onClick={() => setSupportBlockOpen(false)}>Entendi</button>
          </div>
        </div>
      )}
    </div>
  );
}

const TASKS_PAGE_SIZE = 10;

// legenda curta pra cada regra de recorrência, usada na lista de tarefas cadastradas
function recurrenceLabel(t) {
  if (t.recurrence_type === "weekly") return `toda ${WEEKDAY_LABELS[t.weekday]}`;
  if (t.recurrence_type === "once") return `só em ${t.once_date?.split("-").reverse().join("/")}`;
  return "todo dia";
}

export function Tarefas({ employees, gerentes = [], viewerRole = "master_admin", tasks, empresaId, lojaId, onChanged, isConsorcio = false }) {
  const notifySaved = useSavedNotice();
  const canEdit = viewerRole !== "leitor";
  const canTargetGerentes = viewerRole !== "gerente" && gerentes.length > 0;
  const [selected, setSelected] = useState(employees[0]?.id || "");
  const [title, setTitle] = useState("");
  const [replicateAll, setReplicateAll] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState("daily");
  const [weekday, setWeekday] = useState(1);
  const [onceDate, setOnceDate] = useState(todayStr());
  // 2026-07-20: tipo de tarefa "contatos" — só existe pra consórcio. O gestor configura quantos
  // contatos/ligações (crm_leads.data_ligacao) o colaborador precisa registrar naquele dia; o
  // check nunca é manual — um trigger no banco (sync_contatos_completions) marca sozinho
  // comparando a contagem real com essa meta, toda vez que um lead muda. Por isso força
  // recurrence_type='daily' (não faz sentido meta de contato "1x na semana"/"uma vez só").
  const [taskType, setTaskType] = useState("checklist");
  const [contactsTarget, setContactsTarget] = useState(10);
  const [viewDate, setViewDate] = useState(todayStr());
  const [dayCompletions, setDayCompletions] = useState({});
  // contagem real de crm_leads.data_ligacao do colaborador selecionado no dia visualizado — só
  // carregada quando isConsorcio, pra mostrar o progresso ("3/10 contatos") das tarefas tipo
  // 'contatos' no checklist abaixo (elas não têm toggle manual).
  const [contactsCountToday, setContactsCountToday] = useState(0);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [savingTaskEdit, setSavingTaskEdit] = useState(false);
  const myTasks = tasks.filter((t) => t.employee_id === selected);
  const myActiveTasks = myTasks.filter((t) => t.active);
  // só as tarefas que realmente valem no dia sendo visualizado (semanal só no seu dia da
  // semana, única só na sua data) — é o mesmo checklist que o colaborador vê.
  const dueTasks = myActiveTasks.filter((t) => isTaskDueOn(t, viewDate));

  // 2026-08-17 (pedido do Felipe): lista de tarefas cadastradas pode crescer bastante — pagina
  // de 10 em 10. Volta pra página 1 sempre que troca de colaborador (senão o índice antigo podia
  // sobrar apontando pra uma página que nem existe na lista da pessoa nova); se a lista encolher
  // (tarefa excluída) e a página atual ficar vazia, `taskPageClamped` abaixo já se autocorrige.
  const [taskPage, setTaskPage] = useState(0);
  useEffect(() => { setTaskPage(0); }, [selected]);
  const taskTotalPages = Math.max(1, Math.ceil(myActiveTasks.length / TASKS_PAGE_SIZE));
  const taskPageClamped = Math.min(taskPage, taskTotalPages - 1);
  const pagedActiveTasks = myActiveTasks.slice(taskPageClamped * TASKS_PAGE_SIZE, taskPageClamped * TASKS_PAGE_SIZE + TASKS_PAGE_SIZE);

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

  useEffect(() => {
    if (!isConsorcio || !selected) { setContactsCountToday(0); return; }
    let active = true;
    (async () => {
      const { count } = await supabase
        .from("crm_leads")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", selected)
        .eq("data_ligacao", viewDate);
      if (active) setContactsCountToday(count || 0);
    })();
    return () => { active = false; };
  }, [isConsorcio, selected, viewDate]);

  async function addTask(e) {
    e.preventDefault();
    if (!title.trim()) return;
    if (taskType === "contatos" && (!contactsTarget || contactsTarget <= 0)) return;
    const recurrenceFields = taskType === "contatos"
      ? { recurrence_type: "daily", weekday: null, once_date: null, start_date: todayStr() }
      : {
          recurrence_type: recurrenceType,
          weekday: recurrenceType === "weekly" ? weekday : null,
          once_date: recurrenceType === "once" ? onceDate : null,
          start_date: todayStr(),
        };
    const typeFields = { task_type: taskType, contacts_target: taskType === "contatos" ? Number(contactsTarget) : null };
    if (replicateAll) {
      const activeEmps = employees.filter((e) => e.active);
      if (!activeEmps.length) return;
      const rows = activeEmps.map((emp) => ({
        employee_id: emp.id,
        title: title.trim(),
        empresa_id: empresaId,
        loja_id: lojaId,
        ...recurrenceFields,
        ...typeFields,
      }));
      await supabase.from("tasks").insert(rows);
    } else {
      if (!selected) return;
      await supabase.from("tasks").insert({ employee_id: selected, title: title.trim(), empresa_id: empresaId, loja_id: lojaId, ...recurrenceFields, ...typeFields });
    }
    setTitle("");
    setRecurrenceType("daily");
    setTaskType("checklist");
    setContactsTarget(10);
    notifySaved();
    onChanged();
  }

  // "Excluir" nunca pode apagar dias já registrados (feitos ou não) — isso reescreveria o
  // histórico de indicadores passados. Só remove pendências de hoje em diante (que ainda nem
  // deveriam ter acontecido) e desativa a tarefa (active=false) pra ela sumir da lista e parar
  // de valer daqui pra frente — os dias já concluídos ou perdidos permanecem intactos no
  // histórico, ligados à tarefa, mesmo ela não aparecendo mais aqui.
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(null);

  async function removeTask(t) {
    await supabase
      .from("task_completions")
      .delete()
      .eq("task_id", t.id)
      .eq("completed", false)
      .gte("completion_date", todayStr());
    await supabase.from("tasks").update({ active: false }).eq("id", t.id);
    notifySaved(`Tarefa "${t.title}" excluída com sucesso.`);
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
    notifySaved();
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
        <SelectField className="w-full" value={selected} onChange={(e) => setSelected(e.target.value)}>
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
        </SelectField>
      </div>

      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><CheckSquare size={14} /> Tarefas</p>
        {canEdit && (
        <form onSubmit={addTask} className="space-y-3 mb-4">
          <div className="flex gap-3">
            <input className="input" placeholder="nome da tarefa" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} />
            <button className="btn whitespace-nowrap" type="submit">Adicionar</button>
          </div>

          {isConsorcio && (
            <div>
              <label className="label">Tipo de tarefa</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setTaskType("checklist")}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                    taskType === "checklist" ? "border-gold text-gold" : "border-line text-muted hover:border-gold/50"
                  }`}
                >
                  Checklist manual
                </button>
                <button
                  type="button"
                  onClick={() => setTaskType("contatos")}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all flex items-center gap-1.5 ${
                    taskType === "contatos" ? "border-blue text-blue" : "border-line text-muted hover:border-blue/50"
                  }`}
                >
                  <PhoneCall size={12} /> Contatos (automático)
                </button>
              </div>
              {taskType === "contatos" && (
                <p className="text-[11px] text-muted mt-1.5">
                  O sistema marca sozinho quando o colaborador registrar essa quantidade de ligações no dia — sem botão de check manual.
                </p>
              )}
            </div>
          )}

          {taskType === "contatos" ? (
            <div className="max-w-[220px]">
              <label className="label">Contatos por dia</label>
              <input
                type="number"
                min={1}
                className="input"
                value={contactsTarget}
                onChange={(e) => setContactsTarget(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          ) : (
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
                      recurrenceType === opt.key ? "border-gold text-gold" : "border-line text-muted hover:border-gold/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {taskType !== "contatos" && recurrenceType === "weekly" && (
            <div className="max-w-[220px]">
              <label className="label">Dia da semana</label>
              <SelectField className="w-full" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAY_LABELS.map((label, idx) => <option key={idx} value={idx}>{label}</option>)}
              </SelectField>
            </div>
          )}

          {taskType !== "contatos" && recurrenceType === "once" && (
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
          {pagedActiveTasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 flex-wrap py-2.5 text-sm">
              {editingTaskId === t.id ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <input
                    className="input !py-1.5 !text-sm flex-1 min-w-[140px]"
                    value={editTaskTitle}
                    onChange={(e) => setEditTaskTitle(e.target.value)}
                    maxLength={40}
                    autoFocus
                  />
                  <button onClick={() => saveTaskEdit(t)} disabled={savingTaskEdit} title="Salvar" aria-label="Salvar" className="p-1.5 rounded-lg text-success hover:bg-success/10 transition-colors disabled:opacity-40">
                    <Check size={16} strokeWidth={2.5} />
                  </button>
                  <button onClick={() => setEditingTaskId(null)} title="Cancelar" aria-label="Cancelar" className="p-1.5 rounded-lg text-muted hover:text-navy hover:bg-line/60 transition-colors">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-navy min-w-0 truncate">
                    {t.title}{" "}
                    <span className="text-[11px] text-muted font-normal">
                      · {t.task_type === "contatos" ? `${t.contacts_target} contatos/dia (automático)` : recurrenceLabel(t)}
                    </span>
                  </span>
                  {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEditTask(t)} title="Editar tarefa" aria-label="Editar tarefa" className="p-1.5 rounded-lg text-muted hover:text-navy hover:bg-line/60 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDeleteTask(t)} title="Excluir tarefa" aria-label="Excluir tarefa" className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-line/60 transition-colors">
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
        {myActiveTasks.length > TASKS_PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-line flex-wrap">
            <p className="text-[11px] text-muted">Página {taskPageClamped + 1} de {taskTotalPages}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-outline !p-1.5"
                disabled={taskPageClamped === 0}
                onClick={() => setTaskPage((p) => Math.max(0, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="btn-outline !p-1.5"
                disabled={taskPageClamped >= taskTotalPages - 1}
                onClick={() => setTaskPage((p) => Math.min(taskTotalPages - 1, p + 1))}
                aria-label="Próxima página"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="label mb-0 flex items-center gap-1.5"><CheckSquare size={14} /> Checklist do dia</p>
          <DateNav date={viewDate} onChange={setViewDate} maxDate={todayStr()} />
        </div>
        <ul className="divide-y divide-line">
          {dueTasks.map((t) => {
            const done = !!dayCompletions[t.id]?.completed;
            const isContatos = t.task_type === "contatos";
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                {isContatos ? (
                  // Tarefa "contatos" nunca tem check manual — o próprio banco (trigger em
                  // crm_leads) marca completed quando a contagem real bate a meta. Aqui só
                  // mostramos o resultado + o progresso do dia (X/meta).
                  <span
                    title="Marcado automaticamente pelo sistema"
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-bold text-white transition-all ${done ? "" : "bg-blue/15 text-blue"}`}
                    style={done ? { background: "linear-gradient(135deg, #84cc16, #0d9488)" } : undefined}
                  >
                    {done ? <Check size={13} strokeWidth={3} /> : <PhoneCall size={12} />}
                  </span>
                ) : canEdit ? (
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
                <span className={done ? "text-navy" : "text-muted"}>
                  {t.title}
                  {isContatos && (
                    <span className="text-[11px] text-muted font-normal"> · {contactsCountToday}/{t.contacts_target} contatos {viewDate === todayStr() ? "hoje" : "nesse dia"}</span>
                  )}
                </span>
              </li>
            );
          })}
          {dueTasks.length === 0 && <p className="text-sm text-muted py-2">Nenhuma tarefa valendo nesse dia para este colaborador.</p>}
        </ul>
      </div>

      <ConfirmModal
        open={!!confirmDeleteTask}
        title={`Excluir "${confirmDeleteTask?.title || ""}"?`}
        message="Ela some da lista e para de valer a partir de hoje. Dias já registrados (feitos ou perdidos) continuam no histórico e não são apagados."
        confirmLabel="Excluir"
        danger
        onConfirm={async () => { await removeTask(confirmDeleteTask); setConfirmDeleteTask(null); }}
        onCancel={() => setConfirmDeleteTask(null)}
      />
    </div>
  );
}

export function Advertencias({ employees, gerentes = [], viewerRole = "master_admin", warnings, settings, today, empresaId, lojaId, onChanged, onSaveSettings }) {
  const notifySaved = useSavedNotice();
  const canEdit = viewerRole !== "leitor";
  const canTargetGerentes = viewerRole !== "gerente" && gerentes.length > 0;
  const canEditPrize = viewerRole !== "gerente" && viewerRole !== "leitor";
  const canEditSettings = viewerRole !== "leitor";
  const isSupervisorView = viewerRole === "supervisor" || viewerRole === "socio";
  const [selected, setSelected] = useState(employees[0]?.id || "");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgPenalty, setCfgPenalty] = useState(settings.warning_penalty_points);
  const [cfgThreshold, setCfgThreshold] = useState(settings.team_threshold_pct);
  const [cfgPrize, setCfgPrize] = useState(settings.monthly_prize);
  const myWarnings = warnings.filter((w) => w.employee_id === selected);

  async function addWarning(e) {
    e.preventDefault();
    if (!selected || !reason.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("warnings").insert({
      employee_id: selected,
      warning_date: date,
      reason: reason.trim(),
      // desconto sempre vem da configuração global da loja (aba Configurações), nunca escolhido
      // aqui — não existe (nem nunca existiu de fato) desconto customizado por advertência: o
      // cálculo real (calcIndividualPct) sempre multiplica a quantidade de advertências pelo
      // penalty global, então guardamos o valor vigente só como registro histórico.
      points: Number(settings.warning_penalty_points) || 0,
      created_by: session.user.id,
      empresa_id: empresaId,
      loja_id: lojaId,
    });
    setReason("");
    notifySaved();
    onChanged();
  }

  const [confirmDeleteWarning, setConfirmDeleteWarning] = useState(null);

  async function removeWarning(w) {
    await supabase.from("warnings").delete().eq("id", w.id);
    notifySaved("Advertência removida com sucesso.");
    onChanged();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label">Colaborador{canTargetGerentes ? " ou gerente" : ""}</label>
        <SelectField className="w-full" value={selected} onChange={(e) => setSelected(e.target.value)}>
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
        </SelectField>
      </div>

      {canEdit && (
      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><AlertTriangle size={14} /> Registrar advertência</p>
        <form onSubmit={addWarning} className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">Data</label>
            <input type="date" className="input date-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Motivo</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex: atraso, falha de atendimento…" />
          </div>
          <div className="sm:col-span-3">
            <button className="btn" type="submit">Registrar</button>
          </div>
        </form>
        <p className="text-[11px] text-muted mt-2">Desconto aplicado: {Number(settings.warning_penalty_points) || 0}% (configurado abaixo).</p>
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
              <button onClick={() => setConfirmDeleteWarning(w)} className="text-xs uppercase tracking-wider text-danger">remover</button>
              )}
            </li>
          ))}
          {myWarnings.length === 0 && (
            <p className="text-sm text-muted py-2 flex items-center gap-1.5"><ThumbsUp size={14} className="text-success" /> Nenhuma advertência este mês.</p>
          )}
        </ul>
      </div>

      {!isSupervisorView && (
      <div className="card">
        <button type="button" onClick={() => setCfgOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 whitespace-nowrap m-0 label mb-0"><Settings size={14} className="shrink-0" /> Configurações</p>
          {cfgOpen ? <ChevronUp size={15} className="text-muted shrink-0" /> : <ChevronDown size={15} className="text-muted shrink-0" />}
        </button>
        {cfgOpen && (
        <div className="mt-3">
        {canEditSettings ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const vals = {
                warning_penalty_points: Number(cfgPenalty),
                team_threshold_pct: Number(cfgThreshold),
              };
              if (canEditPrize) vals.monthly_prize = Number(cfgPrize);
              await onSaveSettings(vals);
              notifySaved();
            }}
            className="grid sm:grid-cols-3 gap-4"
          >
            <div>
              <label className="label">Desconto por advertência (%)</label>
              <input type="number" step="0.5" className="input" value={cfgPenalty} onChange={(e) => setCfgPenalty(e.target.value)} />
            </div>
            <div>
              <label className="label">Mínimo p/ premiação (%)</label>
              <input type="number" step="0.5" className="input" value={cfgThreshold} onChange={(e) => setCfgThreshold(e.target.value)} />
            </div>
            <div>
              <label className="label">Premiação mensal (R$)</label>
              {canEditPrize ? (
                <CurrencyInput value={cfgPrize} onChange={setCfgPrize} />
              ) : (
                <p className="input !flex !items-center bg-line/40 text-muted"><AutoFitText as="span">{formatBRL(settings.monthly_prize)}</AutoFitText></p>
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
            <li className="flex justify-between py-1.5"><span className="text-muted">Mínimo p/ premiação</span><span>{Number(settings.team_threshold_pct) || 0}%</span></li>
            <li className="flex justify-between gap-2 py-1.5"><span className="text-muted">Premiação mensal</span><span className="shrink-0 whitespace-nowrap">{formatBRL(settings.monthly_prize)}</span></li>
          </ul>
        )}
        </div>
        )}
      </div>
      )}

      <ConfirmModal
        open={!!confirmDeleteWarning}
        title="Remover essa advertência?"
        message={confirmDeleteWarning ? `"${confirmDeleteWarning.reason}" — o desconto aplicado por ela deixa de contar no cálculo da barra.` : ""}
        confirmLabel="Remover"
        danger
        onConfirm={async () => { await removeWarning(confirmDeleteWarning); setConfirmDeleteWarning(null); }}
        onCancel={() => setConfirmDeleteWarning(null)}
      />
    </div>
  );
}

export function Premiacoes({ employees, gerentes = [], viewerRole = "master_admin", prizes, month, empresaId, lojaId, settings, onChanged, goals = [], soldTotal = 0, onSaveExtraPrize }) {
  const notifySaved = useSavedNotice();
  const canEdit = viewerRole !== "leitor";
  const canTargetGerentes = viewerRole !== "gerente" && gerentes.length > 0;
  const activeEmps = employees.filter((e) => e.active);
  const [empId, setEmpId] = useState(activeEmps[0]?.id || "");
  // 2026-08-31, pedido do Felipe: premiação pra quem não tem cadastro no Z Meta (ex.: estoquista) —
  // toggle entre lançar pra um colaborador/gerente já cadastrado ou digitar um nome livre
  // (employee_prizes.employee_id fica null, recipient_name/recipient_role guardam quem é).
  const [recipientMode, setRecipientMode] = useState("cadastrado");
  const [avulsoName, setAvulsoName] = useState("");
  const [avulsoRole, setAvulsoRole] = useState("");

  // Qual premiação extra está ativa AGORA — mesma lógica do aviso fixo no Início (menor meta ainda
  // não batida entre as premiadas; se todas já foram batidas, a de maior valor entre elas), agora
  // também filtrando por período (2026-08-06, pedido do Felipe): uma premiação vinculada só a uma
  // semana/quinzena/estágio específico só conta enquanto hoje cair dentro daquela janela.
  const prizeGoalsAll = goals.filter((g) => g.non_monetary_prize && isPrizePeriodActive(g));
  const activeExtraPrizeGoal = prizeGoalsAll.find((g) => soldTotal < Number(g.store_total)) || prizeGoalsAll[prizeGoalsAll.length - 1] || null;

  // Premiação extra (2026-08-04, pedido do Felipe): não é uma meta nova, é um prêmio (festa,
  // jantar, viagem — qualquer coisa fora de comissão em dinheiro) vinculado a UMA das metas já
  // cadastradas na loja naquele mês — quando a equipe bater aquela meta, o prêmio é liberado.
  // Gerente/supervisor/sócio podem cadastrar (mesma permissão de premiação em dinheiro, canEdit).
  // 2026-08-06: além da meta, agora dá pra restringir a premiação a um período específico dentro
  // do mês (semana/quinzena/estágio exatos, não só "mês inteiro") — reaproveita goalPeriods (mesmo
  // motor do ritmo da meta) pra listar as instâncias reais daquele mês com as datas certas.
  const [extraGoalId, setExtraGoalId] = useState(goals[0]?.id || "");
  const [extraText, setExtraText] = useState(goals[0]?.non_monetary_prize || "");
  const [extraPeriodType, setExtraPeriodType] = useState(goals[0]?.prize_period_type || "mes");
  const [extraPeriodIdx, setExtraPeriodIdx] = useState(0);
  const [savingExtra, setSavingExtra] = useState(false);

  useEffect(() => {
    if (!extraGoalId && goals.length) selectExtraGoal(goals[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals]);

  function selectExtraGoal(goalId) {
    setExtraGoalId(goalId);
    const g = goals.find((x) => x.id === goalId);
    setExtraText(g?.non_monetary_prize || "");
    const pType = g?.prize_period_type || "mes";
    setExtraPeriodType(pType);
    if (pType !== "mes" && g?.prize_period_start) {
      const periods = goalPeriods(month, pType);
      const idx = periods.findIndex((p) => p.start === g.prize_period_start && p.end === g.prize_period_end);
      setExtraPeriodIdx(idx >= 0 ? idx : 0);
    } else {
      setExtraPeriodIdx(0);
    }
  }

  function selectExtraPeriodType(pType) {
    setExtraPeriodType(pType);
    setExtraPeriodIdx(0);
  }

  async function saveExtraPrize(e) {
    e.preventDefault();
    if (!extraGoalId || !onSaveExtraPrize) return;
    setSavingExtra(true);
    let periodStart = null;
    let periodEnd = null;
    if (extraPeriodType !== "mes") {
      const periods = goalPeriods(month, extraPeriodType);
      const p = periods[extraPeriodIdx] || periods[0];
      periodStart = p?.start || null;
      periodEnd = p?.end || null;
    }
    await onSaveExtraPrize(extraGoalId, extraText.trim(), extraPeriodType, periodStart, periodEnd);
    setSavingExtra(false);
    notifySaved();
  }
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [prizeErrorMsg, setPrizeErrorMsg] = useState("");
  // Verba de premiação do mês (app_settings.monthly_prize, mesma config usada na aba Metas) —
  // pedido do Felipe (2026-08-04): o total lançado aqui não pode passar desse teto, nas duas
  // categorias (vestuário e consórcio, já que esse componente é compartilhado). Recalcula o total
  // já lançado a cada render em vez de guardar em state, porque `prizes` muda pelo onChanged().
  const monthlyBudget = Number(settings?.monthly_prize ?? 0);
  const totalLancado = prizes.reduce((s, p) => s + Number(p.amount || 0), 0);
  const remainingBudget = monthlyBudget - totalLancado;
  // 2026-07-21: "replicar pra todos" — mesmo padrão já usado em Tarefas (replicateAll), pedido do
  // Felipe pra premiações também. Escopo igual: só colaboradores ativos da loja, gerentes ficam de
  // fora (mesma decisão de Tarefas).
  const [replicateAll, setReplicateAll] = useState(false);

  useEffect(() => {
    if (!empId && activeEmps.length) setEmpId(activeEmps[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  async function addPrize(e) {
    e.preventDefault();
    setPrizeErrorMsg("");
    if (!amount) return;
    const isAvulso = recipientMode === "avulso";
    if (isAvulso && !avulsoName.trim()) return;
    if (!isAvulso && !replicateAll && !empId) return;

    // Não pode passar da verba de premiação do mês (pedido do Felipe) — soma o que essa ação vai
    // adicionar (1 lançamento ou 1 por colaborador ativo, se "replicar pra todos") contra o que já
    // foi lançado. O banco também trava isso (trigger enforce_monthly_prize_budget), essa checagem
    // aqui é só pra dar uma mensagem clara em vez de estourar um erro genérico do Supabase.
    const qtdLancamentos = !isAvulso && replicateAll ? activeEmps.length : 1;
    const totalDessaAcao = Number(amount) * qtdLancamentos;
    if (totalLancado + totalDessaAcao > monthlyBudget) {
      setPrizeErrorMsg(
        `Isso ultrapassa a verba de premiação do mês (${formatBRL(monthlyBudget)}). Já lançado: ${formatBRL(totalLancado)} · disponível: ${formatBRL(Math.max(0, remainingBudget))}.`
      );
      return;
    }

    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const baseFields = {
      month,
      amount: Number(amount) || 0,
      description: description.trim() || null,
      empresa_id: empresaId,
      loja_id: lojaId,
      created_by: session.user.id,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (isAvulso) {
      ({ error } = await supabase.from("employee_prizes").insert({
        employee_id: null,
        recipient_name: avulsoName.trim(),
        recipient_role: avulsoRole.trim() || null,
        ...baseFields,
      }));
    } else if (replicateAll) {
      if (!activeEmps.length) { setSaving(false); return; }
      const rows = activeEmps.map((emp) => ({ employee_id: emp.id, ...baseFields }));
      ({ error } = await supabase.from("employee_prizes").insert(rows));
    } else {
      ({ error } = await supabase.from("employee_prizes").insert({ employee_id: empId, ...baseFields }));
    }
    setSaving(false);
    if (error) {
      setPrizeErrorMsg("Erro ao lançar: " + error.message);
      return;
    }
    setAmount("");
    setDescription("");
    if (isAvulso) { setAvulsoName(""); setAvulsoRole(""); }
    notifySaved();
    onChanged();
  }

  const [confirmDeletePrize, setConfirmDeletePrize] = useState(null);

  async function removePrize(id) {
    await supabase.from("employee_prizes").delete().eq("id", id);
    notifySaved("Premiação excluída com sucesso.");
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
          <form onSubmit={addPrize} className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "cadastrado", label: "Colaborador cadastrado" },
                { key: "avulso", label: "Prêmio avulso (sem cadastro)" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRecipientMode(opt.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${recipientMode === opt.key ? "bg-navy text-white border-navy" : "bg-white text-muted border-line hover:border-navy/40"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-4 gap-3 items-end">
              {recipientMode === "avulso" ? (
                <>
                  <div>
                    <label className="label">Nome</label>
                    <input className="input" placeholder="ex: Carlos" value={avulsoName} onChange={(e) => setAvulsoName(e.target.value)} maxLength={80} />
                  </div>
                  <div>
                    <label className="label">Função (opcional)</label>
                    <input className="input" placeholder="ex: Estoquista" value={avulsoRole} onChange={(e) => setAvulsoRole(e.target.value)} maxLength={60} />
                  </div>
                </>
              ) : (
                <div>
                  <label className="label">Colaborador{canTargetGerentes ? " ou gerente" : ""}</label>
                  <SelectField className="w-full" value={empId} onChange={(e) => setEmpId(e.target.value)} disabled={replicateAll}>
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
                  </SelectField>
                </div>
              )}
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
            </div>
            {recipientMode !== "avulso" && (
              <label className="flex items-center gap-2 text-[11px] sm:text-xs text-muted font-medium">
                <input type="checkbox" checked={replicateAll} onChange={(e) => setReplicateAll(e.target.checked)} className="shrink-0" />
                Replicar essa premiação para todos os colaboradores da loja
              </label>
            )}
            {prizeErrorMsg && <p className="text-xs text-danger">{prizeErrorMsg}</p>}
          </form>
        )}
      </div>
      )}

      {canEdit && goals.length > 0 && (
        <div className="card">
          <p className="label mb-2 flex items-center gap-1.5"><PartyPopper size={14} /> Premiação extra</p>
          <p className="text-xs text-muted mb-4">Um prêmio fora da comissão em dinheiro (festa, jantar, viagem…) vinculado a uma meta já cadastrada — libera pra toda a equipe da loja quando ela for batida. Pode valer o mês inteiro ou só um período específico.</p>
          {activeExtraPrizeGoal && (
            <div className="rounded-lg py-2 px-3 bg-pink/10 flex items-center gap-2 mb-4">
              <PartyPopper size={14} className="text-pink shrink-0" />
              <p className="text-xs font-bold text-navy">Ativa agora ({prizeWindowLabel(activeExtraPrizeGoal.prize_period_type)}): {activeExtraPrizeGoal.non_monetary_prize} — vale se a loja bater a {activeExtraPrizeGoal.name}</p>
            </div>
          )}
          <form onSubmit={saveExtraPrize} className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="label">Qual meta libera essa premiação?</label>
              <SelectField className="w-full" value={extraGoalId} onChange={(e) => selectExtraGoal(e.target.value)}>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </SelectField>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Premiação (deixe em branco pra remover)</label>
              <input className="input" placeholder="ex: jantar de confraternização, viagem, festa da equipe" value={extraText} onChange={(e) => setExtraText(e.target.value)} maxLength={120} />
            </div>
            <div className="sm:col-span-3">
              <label className="label">Vale por quanto tempo?</label>
              <div className="flex flex-wrap gap-1.5">
                {["mes", "estagio", "semana", "quinzena"].map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => selectExtraPeriodType(pt)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${extraPeriodType === pt ? "bg-navy text-white border-navy" : "bg-white text-muted border-line hover:border-navy/40"}`}
                  >
                    {pt === "mes" ? "Mês inteiro" : PACING_LABELS[pt]}
                  </button>
                ))}
              </div>
            </div>
            {extraPeriodType !== "mes" && (
              <div className="sm:col-span-3">
                <label className="label">Qual {PACING_LABELS[extraPeriodType].toLowerCase()} de {monthLabel(month)}?</label>
                <div className="flex flex-wrap gap-1.5">
                  {goalPeriods(month, extraPeriodType).map((p, idx) => (
                    <button
                      key={p.start}
                      type="button"
                      onClick={() => setExtraPeriodIdx(idx)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${extraPeriodIdx === idx ? "bg-gold text-navy border-gold" : "bg-white text-muted border-line hover:border-navy/40"}`}
                    >
                      {PACING_LABELS[extraPeriodType]} {idx + 1} ({p.start.slice(8, 10)}–{p.end.slice(8, 10)}/{p.end.slice(5, 7)})
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="sm:col-span-3">
              <button className="btn" type="submit" disabled={savingExtra}>{savingExtra ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <p className="label mb-0">Premiações lançadas — {monthLabel(month)}</p>
          <span className="text-right shrink-0">
            <span className="block text-sm font-bold text-gold whitespace-nowrap">Total: {formatBRL(totalLancado)}</span>
            <span className={`block text-[11px] whitespace-nowrap ${remainingBudget < 0 ? "text-danger" : "text-muted"}`}>
              Verba do mês: {formatBRL(monthlyBudget)} · restante: {formatBRL(remainingBudget)}
            </span>
          </span>
        </div>
        {[...activeEmps, ...(canTargetGerentes ? gerentes : [])].map((emp) => {
          const empPrizes = prizes.filter((p) => p.employee_id === emp.id);
          if (!empPrizes.length) return null;
          const total = empPrizes.reduce((s, p) => s + Number(p.amount || 0), 0);
          return (
            <div key={emp.id} className="mb-4 last:mb-0">
              <p className="text-xs sm:text-sm font-semibold text-navy flex items-center justify-between gap-2">
                <span className="truncate">{emp.full_name}</span>
                <span className="text-gold shrink-0 whitespace-nowrap">{formatBRL(total)}</span>
              </p>
              <ul className="divide-y divide-line mt-1">
                {empPrizes.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-xs sm:text-sm">
                    <span className="text-muted truncate">{p.description || "sem descrição"}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="font-medium text-navy whitespace-nowrap">{formatBRL(p.amount)}</span>
                      {canEdit && (
                      <button onClick={() => setConfirmDeletePrize(p)} title="Excluir" aria-label="Excluir" className="p-1 rounded-lg text-muted hover:text-danger hover:bg-line/60 transition-colors">
                        <Trash2 size={13} />
                      </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {/* 2026-08-31, pedido do Felipe: premiações avulsas (sem cadastro no Z Meta) — agrupadas por
            nome digitado (recipient_name), já que não existe um profile pra agrupar por id. */}
        {(() => {
          const avulsoPrizes = prizes.filter((p) => !p.employee_id && p.recipient_name);
          if (!avulsoPrizes.length) return null;
          const groups = {};
          avulsoPrizes.forEach((p) => {
            const key = p.recipient_name.trim();
            if (!groups[key]) groups[key] = { name: key, role: p.recipient_role, items: [] };
            groups[key].items.push(p);
          });
          return Object.values(groups).map((g) => {
            const total = g.items.reduce((s, p) => s + Number(p.amount || 0), 0);
            return (
              <div key={g.name} className="mb-4 last:mb-0">
                <p className="text-xs sm:text-sm font-semibold text-navy flex items-center justify-between gap-2">
                  <span className="truncate flex items-center gap-1.5">
                    {g.name}
                    <span className="badge !py-0.5 !px-1.5 !text-[10px]">Avulso{g.role ? ` · ${g.role}` : ""}</span>
                  </span>
                  <span className="text-gold shrink-0 whitespace-nowrap">{formatBRL(total)}</span>
                </p>
                <ul className="divide-y divide-line mt-1">
                  {g.items.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-xs sm:text-sm">
                      <span className="text-muted truncate">{p.description || "sem descrição"}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="font-medium text-navy whitespace-nowrap">{formatBRL(p.amount)}</span>
                        {canEdit && (
                        <button onClick={() => setConfirmDeletePrize(p)} title="Excluir" aria-label="Excluir" className="p-1 rounded-lg text-muted hover:text-danger hover:bg-line/60 transition-colors">
                          <Trash2 size={13} />
                        </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          });
        })()}
        {prizes.length === 0 && <p className="text-sm text-muted">Nenhuma premiação lançada ainda.</p>}
      </div>

      <ConfirmModal
        open={!!confirmDeletePrize}
        title="Excluir essa premiação?"
        message={confirmDeletePrize ? `${formatBRL(confirmDeletePrize.amount)}${confirmDeletePrize.description ? ` · ${confirmDeletePrize.description}` : ""} — essa ação não pode ser desfeita.` : ""}
        confirmLabel="Excluir"
        danger
        onConfirm={async () => { await removePrize(confirmDeletePrize.id); setConfirmDeletePrize(null); }}
        onCancel={() => setConfirmDeletePrize(null)}
      />
    </div>
  );
}

// cada meta ganha uma cor de ícone diferente, ciclando pela paleta conforme a ordem (Meta 1, Meta 2…)
const GOAL_ICON_COLORS = ["text-purple", "text-teal", "text-orange", "text-pink", "text-blue", "text-gold", "text-lime", "text-success"];

function Metas({ employees, goals, allocations, commissionSettings, settings, month, empresaId, lojaId, onChanged, viewerRole = "master_admin", soldTotal = 0 }) {
  const notifySaved = useSavedNotice();
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
    notifySaved();
    onChanged();
  }

  const activeEmps = employees.filter((e) => e.active);

  // Monta as linhas de sales_goal_allocations pra um dos 3 modos de distribuição — reaproveitado
  // tanto na criação quanto na edição de distribuição de uma meta já existente (2026-08-05, pedido
  // do Felipe: "igual pra todos" / "valor manual" / "por percentual"). "percent" calcula o R$ a
  // partir do % informado; "custom" (valor manual) calcula o % a partir do R$ informado — os dois
  // campos (amount/percentage) sempre ficam consistentes entre si, não importa qual foi digitado.
  function buildAllocRows(goalId, storeTotal, mode, vals) {
    if (mode === "equal") {
      if (!activeEmps.length) return [];
      const amount = storeTotal / activeEmps.length;
      return activeEmps.map((emp) => ({
        goal_id: goalId, employee_id: emp.id, amount, percentage: 100 / activeEmps.length,
        empresa_id: empresaId, loja_id: lojaId,
      }));
    }
    if (mode === "percent") {
      return Object.entries(vals)
        .filter(([, v]) => v !== "" && v != null)
        .map(([employee_id, v]) => ({
          goal_id: goalId, employee_id, amount: (Number(v) / 100) * storeTotal, percentage: Number(v),
          empresa_id: empresaId, loja_id: lojaId,
        }));
    }
    return Object.entries(vals)
      .filter(([, v]) => v !== "" && v != null)
      .map(([employee_id, v]) => ({
        goal_id: goalId, employee_id, amount: Number(v), percentage: storeTotal > 0 ? (Number(v) / storeTotal) * 100 : 0,
        empresa_id: empresaId, loja_id: lojaId,
      }));
  }

  function pctSum(vals) {
    return activeEmps.reduce((s, emp) => s + (Number(vals[emp.id]) || 0), 0);
  }

  // Pills de "Igual pra todos / Valor manual / Por percentual" + os campos por colaborador —
  // reaproveitado idêntico na criação (Nova meta) e na edição de distribuição de uma meta existente.
  function DistributionFields({ mode, setMode, vals, setVals, storeTotalForCalc, error }) {
    const sum = mode === "percent" ? pctSum(vals) : 0;
    return (
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {[["equal", "Igual para todos"], ["custom", "Valor manual"], ["percent", "Por percentual"]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 whitespace-nowrap ${mode === key ? "border-gold text-gold" : "border-line text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "equal" ? (
          <p className="text-xs text-muted">
            {activeEmps.length} colaborador(es) ativo(s) · {formatBRL(activeEmps.length && storeTotalForCalc ? Number(storeTotalForCalc) / activeEmps.length : 0)} cada.
          </p>
        ) : mode === "percent" ? (
          <div className="space-y-2">
            {activeEmps.map((emp) => (
              <div key={emp.id} className="flex items-center gap-3">
                <span className="text-xs sm:text-sm flex-1 min-w-0 truncate">{emp.full_name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number" step="0.1" min="0" max="100"
                    className="input w-20 text-right"
                    value={vals[emp.id] ?? ""}
                    onChange={(e) => setVals((c) => ({ ...c, [emp.id]: e.target.value }))}
                  />
                  <span className="text-xs text-muted">%</span>
                </div>
              </div>
            ))}
            <p className={`text-xs font-bold ${Math.abs(sum - 100) < 0.5 ? "text-success" : "text-danger"}`}>
              Total: {sum.toFixed(1)}%{Math.abs(sum - 100) >= 0.5 ? " — precisa fechar em 100% pra salvar" : ""}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeEmps.map((emp) => (
              <div key={emp.id} className="flex items-center gap-3">
                <span className="text-xs sm:text-sm flex-1 min-w-0 truncate">{emp.full_name}</span>
                <div className="w-36 shrink-0">
                  <CurrencyInput value={vals[emp.id] ?? ""} onChange={(v) => setVals((c) => ({ ...c, [emp.id]: v }))} />
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  function PacingFields({ value, onChange }) {
    return (
      <div>
        <label className="label">Ritmo da meta</label>
        <div className="flex gap-2 flex-wrap mt-1">
          {Object.entries(PACING_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 whitespace-nowrap ${value === key ? "border-gold text-gold" : "border-line text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-1.5">O que faltar num período soma no próximo; o último período do mês não carrega pro mês seguinte.</p>
      </div>
    );
  }

  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [commColab, setCommColab] = useState("");
  const [commGerente, setCommGerente] = useState("");
  const [pacing, setPacing] = useState("dia");
  const [createDistMode, setCreateDistMode] = useState("equal");
  const [createCustomVals, setCreateCustomVals] = useState({});
  const [createPercentVals, setCreatePercentVals] = useState({});
  const [createError, setCreateError] = useState("");

  const [editingGoal, setEditingGoal] = useState(null);
  const [distMode, setDistMode] = useState("equal");
  const [customVals, setCustomVals] = useState({});
  const [percentVals, setPercentVals] = useState({});
  const [distError, setDistError] = useState("");

  const [editingValuesId, setEditingValuesId] = useState(null);
  const [evName, setEvName] = useState("");
  const [evTotal, setEvTotal] = useState("");
  const [evCommColab, setEvCommColab] = useState("");
  const [evCommGerente, setEvCommGerente] = useState("");
  const [evPacing, setEvPacing] = useState("dia");
  const [savingValues, setSavingValues] = useState(false);

  const [naoAtingColab, setNaoAtingColab] = useState(commissionSettings.non_achievement_colaborador_pct ?? 0);
  const [naoAtingGerente, setNaoAtingGerente] = useState(commissionSettings.non_achievement_gerente_pct ?? 0);
  const [savingNaoAting, setSavingNaoAting] = useState(false);

  async function createGoal(e) {
    e.preventDefault();
    if (!name.trim() || !total) return;
    if (createDistMode === "percent" && Math.abs(pctSum(createPercentVals) - 100) > 0.5) {
      setCreateError("A soma dos percentuais precisa fechar em 100% antes de criar a meta.");
      return;
    }
    setCreateError("");
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
        pacing,
        distribution_mode: createDistMode,
      })
      .select()
      .single();

    if (!error && inserted) {
      const rows = buildAllocRows(inserted.id, storeTotal, createDistMode, createDistMode === "percent" ? createPercentVals : createCustomVals);
      if (rows.length) await supabase.from("sales_goal_allocations").upsert(rows, { onConflict: "goal_id,employee_id" });
    }

    setName(""); setTotal(""); setCommColab(""); setCommGerente(""); setPacing("dia");
    setCreateDistMode("equal"); setCreateCustomVals({}); setCreatePercentVals({});
    setNewGoalOpen(false);
    notifySaved();
    onChanged();
  }

  function startEditValues(goal) {
    setEditingValuesId(goal.id);
    setEvName(goal.name);
    setEvTotal(String(goal.store_total));
    setEvCommColab(String(goal.commission_pct_colaborador ?? 0));
    setEvCommGerente(String(goal.commission_pct_gerente ?? 0));
    setEvPacing(goal.pacing || "dia");
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
        pacing: evPacing,
      })
      .eq("id", goalId);

    // recalcula a distribuição automaticamente — só quando a meta está em distribuição igual
    // (ou ainda sem distribuição nenhuma); distribuição manual/percentual foi definida à mão e não é mexida.
    const goalAllocs = allocations.filter((a) => a.goal_id === goalId);
    if (goalAllocs.length === 0 || isEvenSplit(goalAllocs)) {
      const rows = buildAllocRows(goalId, newTotal, "equal", {});
      if (rows.length) await supabase.from("sales_goal_allocations").upsert(rows, { onConflict: "goal_id,employee_id" });
    }

    setSavingValues(false);
    setEditingValuesId(null);
    notifySaved();
    onChanged();
  }

  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState(null);

  async function removeGoal(goal) {
    await supabase.from("sales_goal_allocations").delete().eq("goal_id", goal.id);
    await supabase.from("sales_goals").delete().eq("id", goal.id);
    notifySaved(`Meta "${goal.name}" excluída com sucesso.`);
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
    notifySaved();
    onChanged();
  }

  function openEditor(goal, goalAllocs) {
    const manualExisting = {};
    const percentExisting = {};
    activeEmps.forEach((emp) => {
      const a = goalAllocs.find((al) => al.employee_id === emp.id);
      manualExisting[emp.id] = a ? String(a.amount) : "";
      percentExisting[emp.id] = a && a.percentage != null ? String(Number(a.percentage).toFixed(1)) : "";
    });
    setCustomVals(manualExisting);
    setPercentVals(percentExisting);
    setDistError("");
    const inferredMode = goalAllocs.length === 0 ? "equal" : goal.distribution_mode === "percent" ? "percent" : goal.distribution_mode === "custom" ? "custom" : isEvenSplit(goalAllocs) ? "equal" : "custom";
    setDistMode(inferredMode);
    setEditingGoal(goal.id);
  }

  async function saveDistribution(goal) {
    if (distMode === "percent" && Math.abs(pctSum(percentVals) - 100) > 0.5) {
      setDistError("A soma dos percentuais precisa fechar em 100% antes de salvar.");
      return;
    }
    setDistError("");
    const rows = buildAllocRows(goal.id, Number(goal.store_total), distMode, distMode === "percent" ? percentVals : customVals);
    if (rows.length) {
      await supabase.from("sales_goal_allocations").upsert(rows, { onConflict: "goal_id,employee_id" });
    }
    await supabase.from("sales_goals").update({ distribution_mode: distMode }).eq("id", goal.id);
    setEditingGoal(null);
    notifySaved();
    onChanged();
  }

  function isEvenSplit(goalAllocs) {
    if (goalAllocs.length < 2) return true;
    const amounts = goalAllocs.map((a) => Number(a.amount));
    return Math.max(...amounts) - Math.min(...amounts) < 0.01;
  }

  const today = todayStr();
  const isCurrentMonth = month === firstDayOfMonth(today);

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
          <p className="text-[11px] text-muted mt-2">Liberada quando a barra geral da equipe bate o percentual mínimo (configurado na aba Início).</p>
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
              <form onSubmit={createGoal} className="mt-3 space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
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
                </div>

                <PacingFields value={pacing} onChange={setPacing} />

                <div>
                  <label className="label">Distribuição entre colaboradores</label>
                  <div className="mt-1">
                    <DistributionFields
                      mode={createDistMode}
                      setMode={setCreateDistMode}
                      vals={createDistMode === "percent" ? createPercentVals : createCustomVals}
                      setVals={createDistMode === "percent" ? setCreatePercentVals : setCreateCustomVals}
                      storeTotalForCalc={total}
                      error={createError}
                    />
                  </div>
                </div>

                <button className="btn w-full" type="submit">Criar meta</button>
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
                  <p className="font-semibold text-xs sm:text-sm text-navy flex items-center gap-1.5 flex-wrap"><Target size={14} className={GOAL_ICON_COLORS[idx % GOAL_ICON_COLORS.length]} /> {g.name} <span className="badge bg-line text-muted">Meta {idx + 1}</span>{g.pacing && g.pacing !== "dia" && <span className="badge bg-gold/15 text-gold">ritmo: {PACING_LABELS[g.pacing]?.toLowerCase()}</span>}</p>
                  <AutoFitText as="p" className="text-[11px] sm:text-xs text-muted">{formatBRL(g.store_total)}</AutoFitText>
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
                      onClick={() => setConfirmDeleteGoal(g)}
                      title="Excluir meta"
                      aria-label="Excluir meta"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>

              {g.non_monetary_prize && (
                <p className="w-full flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-lg bg-pink/10 text-left">
                  <PartyPopper size={13} className="text-pink shrink-0" />
                  <span className="text-[11px] font-semibold text-navy truncate">Prêmio extra: {g.non_monetary_prize}</span>
                </p>
              )}

              {g.pacing && g.pacing !== "dia" && isCurrentMonth && editingValuesId !== g.id && !isEditing && (() => {
                const periodsLeft = remainingPeriodsInMonth(month, today, g.pacing);
                const resto = Math.max(0, Number(g.store_total) - soldTotal);
                const periodTarget = periodsLeft > 0 ? resto / periodsLeft : 0;
                return (
                  <div className="mt-3 px-3 py-2.5 rounded-lg bg-paper">
                    <p className="text-[11px] font-bold text-navy">Meta {periodLabel(month, today, g.pacing)}: {formatBRL(periodTarget)}</p>
                    <p className="text-[11px] text-muted mt-0.5">Recalculada automaticamente: o que faltar num período soma no próximo.</p>
                  </div>
                );
              })()}

              {editingValuesId === g.id ? (
                <div className="mt-4 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3 items-end">
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
                  </div>
                  <PacingFields value={evPacing} onChange={setEvPacing} />
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => saveGoalValues(g.id)} disabled={savingValues}>{savingValues ? "Salvando…" : "Salvar"}</button>
                    <button className="btn-outline" onClick={() => setEditingValuesId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : isEditing ? (
                <div className="mt-4 space-y-3">
                  <DistributionFields
                    mode={distMode}
                    setMode={setDistMode}
                    vals={distMode === "percent" ? percentVals : customVals}
                    setVals={distMode === "percent" ? setPercentVals : setCustomVals}
                    storeTotalForCalc={g.store_total}
                    error={distError}
                  />
                  <div className="flex items-center gap-2">
                    <button className="btn" onClick={() => saveDistribution(g)}>Salvar distribuição</button>
                    <button title="Cancelar" aria-label="Cancelar" className="p-1.5 rounded-lg text-muted hover:text-navy hover:bg-line/60 transition-colors" onClick={() => setEditingGoal(null)}>
                      <X size={16} />
                    </button>
                  </div>
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
                      <li key={a.id} className="flex justify-between gap-2 py-1.5">
                        <span className="text-muted truncate min-w-0">{emp?.full_name || "—"}</span>
                        <span className="shrink-0 whitespace-nowrap">{formatBRL(a.amount)}</span>
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

      <ConfirmModal
        open={!!confirmDeleteGoal}
        title={`Excluir a meta "${confirmDeleteGoal?.name || ""}"?`}
        message="Isso também remove a distribuição feita entre os colaboradores. Não dá pra desfazer."
        confirmLabel="Excluir"
        danger
        onConfirm={async () => { await removeGoal(confirmDeleteGoal); setConfirmDeleteGoal(null); }}
        onCancel={() => setConfirmDeleteGoal(null)}
      />
    </div>
  );
}

// Mesmo padrão de medalha usada nos rankings de HierarchyHome.js/ColaboradorView.js
// (.rank-pos/.rank-pos-1/2/3/plain).
function rankPosClass(idx) {
  if (idx === 0) return "rank-pos-1";
  if (idx === 1) return "rank-pos-2";
  if (idx === 2) return "rank-pos-3";
  return "rank-pos-plain";
}

// Aba "Online" (2026-07-27, pedido do Felipe) — módulo independente de vendas online, com metas
// em camadas (mesmo alvo pra qualquer colaborador da loja, não meta dividida por alocação) e
// premiação fixa em R$ por camada. Gerente/supervisor/sócio/master cadastram as metas e veem o
// ranking; o lançamento de cada venda em si é feito pelo colaborador (ColaboradorView.js).
function OnlineTab({ employees, onlineGoals, onlineSales, activationSettings, lojaId, empresaId, month, viewerRole, onChanged }) {
  const notifySaved = useSavedNotice();
  const canEdit = viewerRole !== "leitor";

  // 2026-07-29: Ativação Online — toggle + meta de contatos/dia. Só colaboradores ganham a
  // tarefa (nunca o gerente); tudo é sincronizado no banco via trigger (sync_online_activation_tasks),
  // aqui só lemos/escrevemos online_activation_settings. Mudar a meta vale a partir de agora — o
  // trigger lê o valor ao vivo, nunca congela por dia.
  const activationActive = !!activationSettings?.active;
  const [actTarget, setActTarget] = useState(String(activationSettings?.contacts_target || 20));
  const [actSaving, setActSaving] = useState(false);
  const [confirmActivation, setConfirmActivation] = useState(false);

  useEffect(() => {
    setActTarget(String(activationSettings?.contacts_target || 20));
  }, [activationSettings?.contacts_target]);

  async function upsertActivationSettings(nextActive) {
    const n = Number(actTarget);
    if (!n || n <= 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("online_activation_settings").upsert(
      {
        loja_id: lojaId,
        empresa_id: empresaId,
        active: nextActive,
        contacts_target: n,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "loja_id" }
    );
  }

  async function saveActivationTarget() {
    setActSaving(true);
    await upsertActivationSettings(activationActive);
    setActSaving(false);
    notifySaved();
    onChanged();
  }

  async function toggleActivation() {
    await upsertActivationSettings(!activationActive);
    notifySaved(`Ativação Online ${!activationActive ? "ativada" : "desativada"} com sucesso.`);
    onChanged();
  }

  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [gName, setGName] = useState("");
  const [gTarget, setGTarget] = useState("");
  const [gPrize, setGPrize] = useState("");
  const [gSaving, setGSaving] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [egName, setEgName] = useState("");
  const [egTarget, setEgTarget] = useState("");
  const [egPrize, setEgPrize] = useState("");
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState(null);

  const empById = {};
  employees.forEach((e) => { empById[e.id] = e; });

  // só soma vendas de quem está em `employees` — já vem escopado certo por viewerRole (gerente
  // só a própria equipe; sócio/supervisor/master a loja inteira), sem precisar duplicar a lógica
  // de escopo aqui.
  const totalsByEmp = {};
  onlineSales.forEach((s) => {
    if (!empById[s.employee_id]) return;
    totalsByEmp[s.employee_id] = (totalsByEmp[s.employee_id] || 0) + Number(s.amount || 0);
  });

  const targets = onlineGoals.map((g) => Number(g.target_amount));

  function tierInfo(total) {
    const inPlayTarget = currentGoalTarget(targets, total);
    const inPlayGoal = onlineGoals.find((g) => Number(g.target_amount) === inPlayTarget) || null;
    let achieved = null;
    onlineGoals.forEach((g) => { if (total >= Number(g.target_amount)) achieved = g; });
    return { inPlayGoal, achieved };
  }

  const ranking = employees
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: e.full_name, avatar_url: e.avatar_url, sold: totalsByEmp[e.id] || 0 }))
    .sort((a, b) => b.sold - a.sold);

  async function addGoal(e) {
    e.preventDefault();
    if (!gName || gTarget === "" || gPrize === "") return;
    setGSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("online_goals").insert({
      loja_id: lojaId,
      empresa_id: empresaId,
      month,
      name: gName,
      target_amount: Number(gTarget),
      prize_amount: Number(gPrize),
      created_by: session.user.id,
    });
    setGSaving(false);
    setGName("");
    setGTarget("");
    setGPrize("");
    setGoalFormOpen(false);
    notifySaved();
    onChanged();
  }

  function openEditGoal(g) {
    setEditingGoal(g);
    setEgName(g.name);
    setEgTarget(String(g.target_amount));
    setEgPrize(String(g.prize_amount));
  }

  async function saveEditGoal() {
    if (!editingGoal) return;
    await supabase
      .from("online_goals")
      .update({ name: egName, target_amount: Number(egTarget), prize_amount: Number(egPrize) })
      .eq("id", editingGoal.id);
    setEditingGoal(null);
    notifySaved();
    onChanged();
  }

  async function removeGoal(g) {
    await supabase.from("online_goals").delete().eq("id", g.id);
    onChanged();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <p className="label mb-0 flex items-center gap-1.5"><PhoneCall size={14} /> Ativação Online</p>
          {canEdit && (
            <button
              type="button"
              className={`btn-outline !py-1.5 !px-3.5 !text-xs ${activationActive ? "!border-danger !text-danger" : ""}`}
              onClick={() => setConfirmActivation(true)}
            >
              <Power size={13} /> {activationActive ? "Desativar" : "Ativar"}
            </button>
          )}
        </div>
        <p className="text-sm text-muted mb-3">
          {activationActive
            ? 'Ativa — todo colaborador ganha a tarefa "Ativação Online" todo dia, até você desativar.'
            : "Inativa — nenhum colaborador tem a tarefa de ativação hoje."}
        </p>
        {canEdit && (
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="label">Meta de contatos por dia</label>
              <input type="number" min="1" className="input !w-32" value={actTarget} onChange={(e) => setActTarget(e.target.value)} />
            </div>
            <button type="button" className="btn !py-2 !px-4 !text-xs" disabled={actSaving} onClick={saveActivationTarget}>
              {actSaving ? "Salvando…" : "Salvar meta"}
            </button>
          </div>
        )}
        <p className="text-[11px] text-muted mt-3">Mudar a meta vale a partir de agora — não afeta os dias já fechados. Mesma meta pra todos os colaboradores da loja.</p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <p className="label mb-0 flex items-center gap-1.5"><Target size={14} /> Metas & premiações Online — {monthLabel(month)}</p>
          {canEdit && (
            <button type="button" className="btn-outline !py-1.5 !px-3.5 !text-xs" onClick={() => setGoalFormOpen((v) => !v)}>
              <Plus size={13} /> Nova meta
            </button>
          )}
        </div>

        {onlineGoals.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma meta Online cadastrada este mês ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {onlineGoals.map((g) => (
              <li key={g.id} className="py-3">
                {editingGoal?.id === g.id ? (
                  <div className="grid sm:grid-cols-3 gap-2 items-end">
                    <div><label className="label">Nome</label><input className="input" value={egName} onChange={(e) => setEgName(e.target.value)} maxLength={40} /></div>
                    <div><label className="label">Valor alvo</label><CurrencyInput value={egTarget} onChange={setEgTarget} /></div>
                    <div><label className="label">Premiação</label><CurrencyInput value={egPrize} onChange={setEgPrize} /></div>
                    <div className="sm:col-span-3 flex gap-2">
                      <button type="button" className="btn-outline flex-1" onClick={() => setEditingGoal(null)}>Cancelar</button>
                      <button type="button" className="btn flex-1" onClick={saveEditGoal}>Salvar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-navy truncate">{g.name}</p>
                      <p className="text-[11px] text-muted mt-0.5">prêmio {formatBRL(Number(g.prize_amount))}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-bold text-navy whitespace-nowrap">{formatBRL(Number(g.target_amount))}</span>
                      {canEdit && (
                        <>
                          <button type="button" title="Editar" aria-label="Editar" className="p-1.5 rounded-lg text-muted hover:text-navy hover:bg-line/60 transition-colors" onClick={() => openEditGoal(g)}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" title="Excluir" aria-label="Excluir" className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-line/60 transition-colors" onClick={() => setConfirmDeleteGoal(g)}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && goalFormOpen && (
          <form onSubmit={addGoal} className="grid sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-line items-end">
            <div className="sm:col-span-3">
              <label className="label">Nome — ex: Meta, Super Meta</label>
              <input className="input" value={gName} onChange={(e) => setGName(e.target.value)} maxLength={40} required />
            </div>
            <div><label className="label">Valor alvo</label><CurrencyInput value={gTarget} onChange={setGTarget} required /></div>
            <div><label className="label">Premiação</label><CurrencyInput value={gPrize} onChange={setGPrize} required /></div>
            <button type="submit" className="btn" disabled={gSaving}>{gSaving ? "Salvando…" : "Adicionar"}</button>
          </form>
        )}

        <p className="text-[11px] text-muted mt-3">Vale a meta real até ela ser batida, depois passa a valer a próxima — mesmo alvo pra qualquer colaborador da loja.</p>
      </div>

      <div className="card-dark animate-pop">
        <p className="label-dark mb-3 flex items-center gap-1.5"><Trophy size={14} className="text-goldlight" /> Ranking Online — {monthLabel(month)}</p>
        {ranking.length === 0 ? (
          <p className="text-sm text-white/50">Nenhum colaborador ativo.</p>
        ) : (
          <ul>
            {ranking.map((r, idx) => {
              const { inPlayGoal, achieved } = tierInfo(r.sold);
              const statusLabel = achieved ? `${achieved.name} batida` : inPlayGoal ? `${inPlayGoal.name} em jogo` : "sem meta cadastrada";
              return (
                <li key={r.id} className="row-card reveal-up" style={{ animationDelay: `${idx * 60}ms` }}>
                  <span className={`rank-pos ${rankPosClass(idx)}`}>{idx + 1}</span>
                  <Avatar name={r.name} avatarUrl={r.avatar_url} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-xs sm:text-sm truncate">{r.name}</p>
                    <p className="text-[10px] text-white/50 truncate">{statusLabel}</p>
                  </div>
                  <span className="font-bold text-goldlight text-xs sm:text-sm shrink-0 whitespace-nowrap">{formatBRL(r.sold)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {onlineSales.length > 0 && (
        <div className="card-dark overflow-x-auto">
          <p className="label-dark mb-3 flex items-center gap-1.5"><Receipt size={14} className="text-goldlight" /> Vendas Online do mês</p>
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-white/50 border-b border-white/10">
                <th className="pb-2">Data</th>
                <th className="pb-2">Colaborador</th>
                <th className="pb-2">Cliente</th>
                <th className="pb-2">NF</th>
                <th className="pb-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {onlineSales.filter((s) => empById[s.employee_id]).slice(0, 30).map((s) => (
                <tr key={s.id} className="border-b border-white/10 last:border-0">
                  <td className="py-2 text-white/70">{s.sale_date}{s.edited_by ? " (corrigido)" : ""}</td>
                  <td className="py-2 text-white/90">{empById[s.employee_id]?.full_name || "—"}</td>
                  <td className="py-2 text-white/70">{s.client_name}</td>
                  <td className="py-2 text-white/50">{s.nf}</td>
                  <td className="py-2 text-goldlight font-medium text-right">{formatBRL(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDeleteGoal}
        title={`Excluir a meta "${confirmDeleteGoal?.name || ""}"?`}
        message="Não dá pra desfazer."
        confirmLabel="Excluir"
        danger
        onConfirm={async () => { await removeGoal(confirmDeleteGoal); setConfirmDeleteGoal(null); }}
        onCancel={() => setConfirmDeleteGoal(null)}
      />

      <ConfirmModal
        open={confirmActivation}
        title={activationActive ? "Desativar a Ativação Online?" : "Ativar a Ativação Online?"}
        message={
          activationActive
            ? "As tarefas de hoje que ainda não foram concluídas somem. As já concluídas continuam no histórico."
            : `Todo colaborador da loja ganha a tarefa "Ativação Online" com meta de ${actTarget || 0} contatos/dia, todo dia, até você desativar.`
        }
        confirmLabel={activationActive ? "Desativar" : "Ativar"}
        danger={activationActive}
        onConfirm={async () => { await toggleActivation(); setConfirmActivation(false); }}
        onCancel={() => setConfirmActivation(false)}
      />
    </div>
  );
}

const LEADS_PAGE_SIZE = 20;

// Aba "Leads" (2026-08-16, pedido do Felipe) — lista somente-leitura dos contatos cadastrados
// pelos colaboradores via "Ativação Online" (online_activations). Não é um funil como o de
// consórcio (sem status/agendamento/transferência) — é o registro dos leads em si, com filtro
// por período e por colaborador. `employees` já vem escopado certo por viewerRole (gerente só a
// própria equipe; master_admin a loja toda), então o filtro de escopo aqui é só "pertence a algum
// employee da lista recebida".
function OnlineLeadsTab({ employees, leads }) {
  const [page, setPage] = useState(0);
  const [draftFilterEmp, setDraftFilterEmp] = useState("todos");
  const [draftSearch, setDraftSearch] = useState("");
  const [draftDataIni, setDraftDataIni] = useState("");
  const [draftDataFim, setDraftDataFim] = useState("");
  const [filterEmp, setFilterEmp] = useState("todos");
  const [search, setSearch] = useState("");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");

  const empById = {};
  employees.forEach((e) => { empById[e.id] = e; });
  const multiEmp = employees.length > 1;

  const scoped = leads.filter((l) => empById[l.employee_id]);

  const filtered = scoped.filter((l) => {
    if (filterEmp !== "todos" && l.employee_id !== filterEmp) return false;
    if (dataIni && l.contact_date < dataIni) return false;
    if (dataFim && l.contact_date > dataFim) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!l.client_name?.toLowerCase().includes(q) && !l.client_phone?.includes(q) && !l.client_code?.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / LEADS_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(pageClamped * LEADS_PAGE_SIZE, pageClamped * LEADS_PAGE_SIZE + LEADS_PAGE_SIZE);
  const filtroAtivo = filterEmp !== "todos" || !!search.trim() || !!dataIni || !!dataFim;
  const filtrosPendentes = draftFilterEmp !== filterEmp || draftSearch !== search || draftDataIni !== dataIni || draftDataFim !== dataFim;

  function aplicarFiltros(e) {
    if (e) e.preventDefault();
    setFilterEmp(draftFilterEmp);
    setSearch(draftSearch);
    setDataIni(draftDataIni);
    setDataFim(draftDataFim);
    setPage(0);
  }

  function limparFiltros() {
    setDraftFilterEmp("todos");
    setDraftSearch("");
    setDraftDataIni("");
    setDraftDataFim("");
    setFilterEmp("todos");
    setSearch("");
    setDataIni("");
    setDataFim("");
    setPage(0);
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <form onSubmit={aplicarFiltros} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input !pl-9"
                placeholder="nome, telefone ou código"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
              />
            </div>
          </div>
          {multiEmp && (
            <div>
              <label className="label">Colaborador</label>
              <SelectField className="w-full" value={draftFilterEmp} onChange={(e) => setDraftFilterEmp(e.target.value)}>
                <option value="todos">Todos</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </SelectField>
            </div>
          )}
          <div>
            <label className="label">De</label>
            <input type="date" className="input date-input" value={draftDataIni} onChange={(e) => setDraftDataIni(e.target.value)} max={draftDataFim || undefined} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" className="input date-input" value={draftDataFim} onChange={(e) => setDraftDataFim(e.target.value)} min={draftDataIni || undefined} />
          </div>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="btn !py-1.5 !text-xs whitespace-nowrap">Aplicar filtros</button>
            {(filtroAtivo || filtrosPendentes) && (
              <button type="button" onClick={limparFiltros} className="text-[11px] font-bold uppercase tracking-wider text-muted hover:text-gold whitespace-nowrap">
                Limpar
              </button>
            )}
            {filtrosPendentes && <span className="text-[11px] text-warn">alterações pendentes</span>}
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <p className="label mb-3">Leads {multiEmp ? "da equipe" : "cadastrados"} ({filtered.length})</p>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted py-4">Nenhum lead encontrado com esse filtro.</p>
        ) : (
          <>
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-[10px] sm:text-xs uppercase tracking-wider text-muted border-b border-line">
                  <th className="pb-2 pr-3 whitespace-nowrap">Cliente</th>
                  <th className="pb-2 pr-3 whitespace-nowrap">Código</th>
                  {multiEmp && <th className="pb-2 pr-3 whitespace-nowrap">Colaborador</th>}
                  <th className="pb-2 whitespace-nowrap">Data</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-navy whitespace-nowrap">{l.client_name}</p>
                      <p className="text-[11px] text-muted whitespace-nowrap flex items-center gap-1"><Phone size={10} /> {l.client_phone}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-muted whitespace-nowrap">{l.client_code || "—"}</td>
                    {multiEmp && <td className="py-2.5 pr-3 text-navy whitespace-nowrap">{empById[l.employee_id]?.full_name || "—"}</td>}
                    <td className="py-2.5 text-muted whitespace-nowrap">{l.contact_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
              <p className="text-[11px] text-muted">Página {pageClamped + 1} de {totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-outline !p-1.5"
                  disabled={pageClamped === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  className="btn-outline !p-1.5"
                  disabled={pageClamped >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label="Próxima página"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Lancamentos({ employees, entries, month, empresaId, lojaId, onChanged, viewerRole = "master_admin" }) {
  const notifySaved = useSavedNotice();
  const canEdit = viewerRole !== "leitor";
  const [selected, setSelected] = useState(employees[0]?.id || "");
  const today = todayStr();
  const [date, setDate] = useState(today);
  const [value, setValue] = useState("");
  const [showFolgaModal, setShowFolgaModal] = useState(false);
  const [saving, setSaving] = useState(false);
  // Editar/excluir um lançamento já existente (2026-08-04, pedido do Felipe) — só quem gerencia
  // (gerente/sócio/supervisor/master), nunca o próprio colaborador: aqui é sempre o gestor olhando
  // a loja/equipe, então não precisa checar viewerRole além do canEdit já existente. Editar troca
  // só o valor (a data não muda, evita colidir com o unique employee_id+entry_date de outro dia);
  // excluir é hard delete de verdade — fica registrado em sales_entries_deleted_log por trigger.
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(null);
  // `entries` vem sem filtro de data (a loja inteira, todo o histórico — ver comentário em
  // Placar acima). O Histórico daqui precisa respeitar o mês selecionado no MonthNav de cima
  // (aba Metas), senão mistura lançamentos de outro mês quando o colaborador tem poucos
  // lançamentos no mês em exibição (achado do Felipe: aparecia data do mês anterior mesmo
  // olhando o mês corrente). Escopo natural já limita a no máximo ~31 linhas, então não precisa
  // mais do corte fixo de 10 que existia antes.
  const monthEnd = month ? nextMonth(month) : null;
  const myEntries = entries
    .filter((e) => e.employee_id === selected && (!month || (e.entry_date >= month && e.entry_date < monthEnd)))
    .slice(0, 31);

  // mesma lógica do card do colaborador (ColaboradorView.js): não faz sentido lançar/corrigir
  // venda de um dia que ainda não aconteceu, então a data fica limitada a até hoje — mesmo aqui,
  // onde é o gerente escolhendo por qual colaborador lançar. 2026-08-18 (pedido do Felipe): a
  // pergunta de folga passou a valer também pra hoje — antes só perguntava pra um dia que já
  // tinha passado.
  async function save(e) {
    e.preventDefault();
    if (!selected || value === "") return;
    if (Number(value) === 0) {
      setShowFolgaModal(true);
      return;
    }
    await doSave(false);
  }

  async function doSave(isFolga) {
    if (!selected) return;
    setSaving(true);
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

    // venda R$0 pode significar folga do colaborador nesse dia — se confirmado, marca automaticamente
    // como concluídas todas as tarefas dele que valem nessa data específica (mesmo padrão usado no
    // lançamento do próprio colaborador em ColaboradorView.js).
    if (isFolga) {
      const { data: myTasks } = await supabase.from("tasks").select("*").eq("employee_id", selected).eq("active", true);
      // Mesmo padrão de ColaboradorView.js: folga é uma das 3 formas válidas de dar check na
      // Ativação Online (contagem real, gerente manual, ou folga confirmada — 2026-08-18: inclusive hoje).
      const dueTasks = (myTasks || []).filter((t) => isTaskDueOn(t, date));
      if (dueTasks.length) {
        const rows = dueTasks.map((t) => ({
          task_id: t.id,
          completion_date: date,
          completed: true,
          completed_at: new Date().toISOString(),
        }));
        await supabase.from("task_completions").upsert(rows, { onConflict: "task_id,completion_date" });
      }
    }

    setSaving(false);
    setShowFolgaModal(false);
    setValue("");
    notifySaved();
    onChanged();
  }

  function startEdit(en) {
    setEditingEntryId(en.id);
    setEditValue(String(en.daily_amount));
  }

  async function saveEdit(en) {
    if (editValue === "") return;
    setSavingEdit(true);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("sales_entries").update({
      daily_amount: Number(editValue),
      edited_by_manager: true,
      edited_by: session.user.id,
      edited_at: new Date().toISOString(),
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    }).eq("id", en.id);
    setSavingEdit(false);
    setEditingEntryId(null);
    notifySaved();
    onChanged();
  }

  async function removeEntry(id) {
    await supabase.from("sales_entries").delete().eq("id", id);
    notifySaved("Lançamento excluído com sucesso.");
    onChanged();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label">Colaborador</label>
        <SelectField className="w-full" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
        </SelectField>
      </div>

      {canEdit && (
      <div className="card">
        <p className="label mb-3 flex items-center gap-1.5"><FileText size={14} /> Lançar valor vendido</p>
        <form onSubmit={save} className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">Dia da venda</label>
            <input type="date" className="input date-input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Valor vendido nesse dia</label>
            <CurrencyInput value={value} onChange={setValue} />
          </div>
          <div>
            <button className="btn w-full" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
          </div>
        </form>
      </div>
      )}

      {showFolgaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
          <div className="card max-w-sm w-full text-center animate-bounce-in border-gold/30">
            <h2 className="text-lg font-extrabold text-navy">Foi um dia de folga?</h2>
            <p className="text-sm text-muted mt-2">
              Você lançou <span className="font-bold text-navy">R$ 0,00</span> em {date.split("-").reverse().join("/")} pra {employees.find((e) => e.id === selected)?.full_name || "esse colaborador"}. Se foi folga, podemos marcar automaticamente todas as tarefas desse dia como concluídas.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <button className="btn-outline flex-1" disabled={saving} onClick={() => doSave(false)}>
                Não foi folga
              </button>
              <button className="btn flex-1" disabled={saving} onClick={() => doSave(true)}>
                {saving ? "Salvando…" : "Sim, foi folga"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card-dark">
        <p className="label-dark mb-3">Histórico{month ? ` — ${monthLabel(month)}` : ""}</p>
        {myEntries.length === 0 ? (
          <p className="text-sm text-white/50">Nenhum lançamento nesse mês ainda.</p>
        ) : (
          <ul>
            {myEntries.map((en) =>
              editingEntryId === en.id ? (
                <li key={en.id} className="row-card justify-between gap-2 flex-wrap">
                  <span className="text-white/70 text-xs sm:text-sm shrink-0">{en.entry_date}</span>
                  <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                    <CurrencyInput value={editValue} onChange={setEditValue} />
                    <button className="btn !py-1.5 !px-3 !text-xs shrink-0" disabled={savingEdit} onClick={() => saveEdit(en)}>
                      {savingEdit ? "Salvando…" : "Salvar"}
                    </button>
                    <button type="button" title="Cancelar" aria-label="Cancelar" className="p-1.5 rounded-lg text-white/50 hover:text-white transition-colors shrink-0" onClick={() => setEditingEntryId(null)}>
                      <X size={16} />
                    </button>
                  </div>
                </li>
              ) : (
                <li key={en.id} className="row-card justify-between">
                  <span className="text-white/70 text-xs sm:text-sm truncate min-w-0">{en.entry_date}{en.edited_by_manager ? " (corrigido)" : ""}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-goldlight text-xs sm:text-sm whitespace-nowrap">{formatBRL(en.daily_amount)}</span>
                    {canEdit && (
                      <>
                        <button type="button" title="Editar" aria-label="Editar" className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors" onClick={() => startEdit(en)}>
                          <Pencil size={13} />
                        </button>
                        <button type="button" title="Excluir" aria-label="Excluir" className="p-1.5 rounded-lg text-white/50 hover:text-danger hover:bg-white/10 transition-colors" onClick={() => setConfirmDeleteEntry(en)}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </span>
                </li>
              )
            )}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={!!confirmDeleteEntry}
        title="Excluir esse lançamento?"
        message={confirmDeleteEntry ? `${confirmDeleteEntry.entry_date} · ${formatBRL(confirmDeleteEntry.daily_amount)} — essa ação não pode ser desfeita.` : ""}
        confirmLabel="Excluir"
        danger
        onConfirm={async () => { await removeEntry(confirmDeleteEntry.id); setConfirmDeleteEntry(null); }}
        onCancel={() => setConfirmDeleteEntry(null)}
      />
    </div>
  );
}

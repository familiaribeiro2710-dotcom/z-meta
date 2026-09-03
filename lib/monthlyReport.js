// Relatório mensal em PDF (2026-08-31, pedido do Felipe) — faturamento da loja, faturamento e
// comissão por colaborador, comissão do gerente e premiações, num único PDF baixável direto do
// herocard de gerente/supervisor/sócio. Mockup aprovado antes de implementar
// (MOCKUP_RELATORIO_MENSAL_PDF.html).
//
// Duas etapas deliberadamente separadas:
//   1. `buildMonthlyReportData` — busca e normaliza os dados (agnóstico de vestuário/consórcio
//      depois de montado, só a ORIGEM da venda muda: sales_entries/sales_goals/commission_settings
//      em vestuário, crm_leads/consorcio_goals/consorcio_commission_settings em consórcio).
//   2. `downloadMonthlyReportPdf` — só desenha o PDF a partir dos dados já prontos (jsPDF +
//      jspdf-autotable, import dinâmico pra não pesar o bundle inicial, mesmo padrão já usado
//      pra `xlsx` em ConsorcioDashboard.js).
//
// warnings/employee_prizes são tabelas compartilhadas entre as duas categorias (sem coluna de
// categoria), então essa parte da busca é uma função só, reaproveitada nos dois caminhos.
import { supabase } from "./supabaseClient";
import { currentGoalTarget, formatBRL } from "./scoring";
import { monthLabel } from "./date";

async function fetchWarningsAndPrizes(empIds, month, nextMonthStr) {
  if (!empIds.length) return { warningsByEmp: {}, prizesByEmp: {} };
  const [{ data: warnRows }, { data: prizeRows }] = await Promise.all([
    supabase.from("warnings").select("employee_id").in("employee_id", empIds).gte("warning_date", month).lt("warning_date", nextMonthStr),
    supabase.from("employee_prizes").select("employee_id, amount").in("employee_id", empIds).eq("month", month),
  ]);
  const warningsByEmp = {};
  (warnRows || []).forEach((w) => { warningsByEmp[w.employee_id] = (warningsByEmp[w.employee_id] || 0) + 1; });
  const prizesByEmp = {};
  (prizeRows || []).forEach((p) => { prizesByEmp[p.employee_id] = (prizesByEmp[p.employee_id] || 0) + Number(p.amount || 0); });
  return { warningsByEmp, prizesByEmp };
}

// 2026-08-31, pedido do Felipe (redesenho): a premiação de um colaborador só entra no relatório se
// o gestor VALIDOU o "prêmio do mês" (barra de atividades) pra ele naquele mês/loja — existir linha
// em employee_prize_validations = validado. Validar/descartar não cria nem apaga premiação
// nenhuma, só decide se o que já está lançado em employee_prizes aparece aqui.
async function fetchValidatedEmployeeIds(lojaId, month) {
  const { data } = await supabase.from("employee_prize_validations").select("employee_id").eq("loja_id", lojaId).eq("month", month);
  return new Set((data || []).map((v) => v.employee_id));
}

// 2026-08-31, pedido do Felipe: premiação pra quem não tem cadastro no Z Meta (ex.: estoquista) —
// employee_prizes.employee_id null + recipient_name/recipient_role. Busca por loja/mês (não por
// empIds, já que não pertence a nenhum colaborador) e entra no relatório numa lista à parte, mas
// soma no total geral da loja.
async function fetchAvulsoPrizes(lojaId, month) {
  const { data } = await supabase
    .from("employee_prizes")
    .select("recipient_name, recipient_role, amount, description")
    .eq("loja_id", lojaId)
    .eq("month", month)
    .is("employee_id", null);
  return (data || []).map((p) => ({
    name: p.recipient_name,
    role: p.recipient_role,
    amount: Number(p.amount || 0),
    description: p.description,
  }));
}

// Camada em jogo/comissão contra um total de vendido — mesma regra usada em todo o resto do app
// (scoring.js/currentGoalTarget): a comissão vale pela maior camada REALMENTE atingida, nunca soma
// camadas; sem nenhuma batida, cai pro % de "não atingimento". Usado só pra métricas de LOJA/EQUIPE
// (faturamento da loja, comissão do gerente) — nunca pra comissão de colaborador, ver
// `employeeTierFor` abaixo (bug real corrigido em 2026-08-31, ver changelog).
function tierFor(soldAmount, goalRows, commissionRow) {
  let achievedTier = null;
  (goalRows || []).forEach((g) => { if (soldAmount >= Number(g.store_total || 0)) achievedTier = g; });
  const colaboradorPct = achievedTier ? Number(achievedTier.commission_pct_colaborador) || 0 : Number(commissionRow?.non_achievement_colaborador_pct) || 0;
  const gerentePct = achievedTier ? Number(achievedTier.commission_pct_gerente) || 0 : Number(commissionRow?.non_achievement_gerente_pct) || 0;
  const tierLabel = achievedTier ? achievedTier.name : "Não atingimento";
  return { colaboradorPct, gerentePct, tierLabel };
}

// 2026-08-31 — BUG REAL corrigido (Felipe pegou na ArmyBR Anália Franco: colaboradores que bateram
// camadas de até 4% apareciam no PDF com só 1,5%, o % de "não atingimento"). A comissão do
// COLABORADOR nunca foi contra o total da loja/equipe — é contra a PRÓPRIA cota individual
// (sales_goal_allocations/consorcio_goal_allocations.amount, que costuma ser o store_total dividido
// entre a equipe, mas cada um é avaliado pelo que ELE PRÓPRIO vendeu, não pela soma do time). Essa é
// a mesma regra que ColaboradorView.js/ColaboradorViewConsorcio.js e os rankings de
// HierarchyHome.js (loadRankings/loadRankingsConsorcio) já usavam corretamente — só o relatório em
// PDF (`buildMonthlyReportData`, introduzido em 2026-08-31) tinha essa conta errada, comparando o
// total da LOJA/EQUIPE contra `store_total` e aplicando o mesmo % pra todo mundo.
function employeeTierFor(sold, allocByGoalId, goalRows, commissionRow) {
  let achievedTier = null;
  (goalRows || []).forEach((g) => {
    const alloc = allocByGoalId[g.id];
    if (alloc !== undefined && sold >= Number(alloc)) achievedTier = g;
  });
  const colaboradorPct = achievedTier ? Number(achievedTier.commission_pct_colaborador) || 0 : Number(commissionRow?.non_achievement_colaborador_pct) || 0;
  const tierLabel = achievedTier ? achievedTier.name : "Não atingimento";
  return { colaboradorPct, tierLabel };
}

// `gerenteId` presente = relatório exportado pelo PRÓPRIO gerente (GerenteView.js/
// GerenteViewConsorcio.js) — escopado só à equipe dele (mesma regra que o herocard dele já usa:
// "soldLoja" ali é na real o total da PRÓPRIA equipe, comparado contra os patamares da loja).
// `gerenteId` ausente = exportado por sócio/supervisor (HierarchyHome.js) — escopo é a LOJA
// inteira, podendo ter mais de um gerente/equipe. Nesse caso cada gerente e cada colaborador tem
// sua comissão calculada contra o patamar que a PRÓPRIA equipe bateu (não um % único borrado pra
// todo mundo) — exatamente o que cada gerente veria na própria tela, só que reunido num PDF só.
export async function buildMonthlyReportData({ lojaId, isConsorcio, lojaName, empresaName, month, gerenteId = null, gerenteName = null }) {
  const nextMonth = new Date(month + "T00:00:00");
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = nextMonth.toISOString().slice(0, 10);

  // 2026-09-03: NÃO filtra active=true aqui — um relatório de mês fechado não pode sumir com o
  // faturamento/comissão/premiação de quem foi desativado depois daquele mês (bug real, ver
  // `hadActivityInMonth` mais abaixo: só entra no relatório quem está ativo hoje OU teve algum
  // dado real registrado no mês sendo exportado).
  let empQuery = supabase.from("profiles").select("id, full_name, gerente_id, active").eq("role", "colaborador");
  empQuery = gerenteId ? empQuery.eq("gerente_id", gerenteId) : empQuery.eq("loja_id", lojaId);
  const { data: emps } = await empQuery;
  const empIds = (emps || []).map((e) => e.id);

  const soldByEmp = {};
  if (empIds.length) {
    if (isConsorcio) {
      const { data: leadRows } = await supabase
        .from("crm_leads")
        .select("employee_id, valor, vendido_at")
        .in("employee_id", empIds)
        .eq("status", "vendido")
        .gte("vendido_at", month)
        .lt("vendido_at", nextMonthStr);
      (leadRows || []).forEach((l) => { soldByEmp[l.employee_id] = (soldByEmp[l.employee_id] || 0) + Number(l.valor || 0); });
    } else {
      const { data: entryRows } = await supabase
        .from("sales_entries")
        .select("employee_id, daily_amount")
        .in("employee_id", empIds)
        .gte("entry_date", month)
        .lt("entry_date", nextMonthStr);
      (entryRows || []).forEach((e) => { soldByEmp[e.employee_id] = (soldByEmp[e.employee_id] || 0) + Number(e.daily_amount || 0); });
    }
  }
  const soldLoja = Object.values(soldByEmp).reduce((s, v) => s + v, 0);

  const goalsTable = isConsorcio ? "consorcio_goals" : "sales_goals";
  const commissionTable = isConsorcio ? "consorcio_commission_settings" : "commission_settings";
  const allocTable = isConsorcio ? "consorcio_goal_allocations" : "sales_goal_allocations";

  const [{ data: goalRows }, { data: commissionRow }] = await Promise.all([
    supabase.from(goalsTable).select("id, name, store_total, commission_pct_colaborador, commission_pct_gerente").eq("loja_id", lojaId).eq("month", month).order("store_total", { ascending: true }),
    supabase.from(commissionTable).select("non_achievement_colaborador_pct, non_achievement_gerente_pct").eq("loja_id", lojaId).eq("month", month).maybeSingle(),
  ]);

  // Cota individual de cada colaborador por meta (mesma fonte que ColaboradorView.js já usa pra
  // saber a PRÓPRIA meta em jogo) — indispensável pra calcular a comissão de cada um corretamente,
  // ver `employeeTierFor` acima.
  let allocByEmpGoal = {};
  if (empIds.length) {
    const { data: allocRows } = await supabase.from(allocTable).select("goal_id, employee_id, amount").in("employee_id", empIds);
    (allocRows || []).forEach((a) => {
      if (!allocByEmpGoal[a.employee_id]) allocByEmpGoal[a.employee_id] = {};
      allocByEmpGoal[a.employee_id][a.goal_id] = a.amount;
    });
  }

  const metaLoja = currentGoalTarget((goalRows || []).map((g) => g.store_total), soldLoja);
  const storeTier = tierFor(soldLoja, goalRows, commissionRow);
  const atingimentoPct = metaLoja > 0 ? (soldLoja / metaLoja) * 100 : 0;

  const { warningsByEmp, prizesByEmp } = await fetchWarningsAndPrizes(empIds, month, nextMonthStr);
  const avulsoPrizes = await fetchAvulsoPrizes(lojaId, month);
  const validatedEmployeeIds = await fetchValidatedEmployeeIds(lojaId, month);

  // Ativo hoje OU teve QUALQUER dado real no mês exportado (vendeu, tem premiação lançada —
  // validada ou não — ou advertência) — quem está inativo e não tem nada nesse mês simplesmente
  // nunca vendeu/participou dele, então continua de fora, igual sempre foi.
  const hadActivityInMonth = (e) =>
    e.active || (soldByEmp[e.id] || 0) > 0 || (prizesByEmp[e.id] || 0) > 0 || (warningsByEmp[e.id] || 0) > 0;

  let gerentes;
  let employees;

  if (gerenteId) {
    // relatório do próprio gerente: uma equipe só. Comissão do GERENTE continua contra o total da
    // equipe (storeTier, correto); comissão de cada COLABORADOR é individual, contra a própria cota
    // (employeeTierFor) — nunca contra o total da equipe.
    employees = (emps || [])
      .filter(hadActivityInMonth)
      .map((e) => {
        const sold = soldByEmp[e.id] || 0;
        const tier = employeeTierFor(sold, allocByEmpGoal[e.id] || {}, goalRows, commissionRow);
        return { name: e.full_name, sold, commissionPct: tier.colaboradorPct, commission: sold * (tier.colaboradorPct / 100), prizes: validatedEmployeeIds.has(e.id) ? (prizesByEmp[e.id] || 0) : 0, warningsCount: warningsByEmp[e.id] || 0 };
      })
      .sort((a, b) => b.sold - a.sold);
    gerentes = [{ name: gerenteName, sold: soldLoja, pct: storeTier.gerentePct, amount: soldLoja * (storeTier.gerentePct / 100) }];
  } else {
    // relatório do sócio/supervisor: loja pode ter mais de uma equipe. Comissão do(s) GERENTE(S)
    // continua contra o total da PRÓPRIA equipe (tierByGerente, correto); comissão de cada
    // COLABORADOR é individual, contra a própria cota (employeeTierFor) — nunca contra o total da
    // equipe nem da loja.
    const { data: gerRows } = await supabase.from("profiles").select("id, full_name, active").eq("loja_id", lojaId).eq("role", "gerente");
    const soldByGerente = {};
    (emps || []).forEach((e) => { if (e.gerente_id) soldByGerente[e.gerente_id] = (soldByGerente[e.gerente_id] || 0) + (soldByEmp[e.id] || 0); });
    const tierByGerente = {};
    (gerRows || []).forEach((g) => { tierByGerente[g.id] = tierFor(soldByGerente[g.id] || 0, goalRows, commissionRow); });

    employees = (emps || [])
      .filter(hadActivityInMonth)
      .map((e) => {
        const sold = soldByEmp[e.id] || 0;
        const tier = employeeTierFor(sold, allocByEmpGoal[e.id] || {}, goalRows, commissionRow);
        return { name: e.full_name, sold, commissionPct: tier.colaboradorPct, commission: sold * (tier.colaboradorPct / 100), prizes: validatedEmployeeIds.has(e.id) ? (prizesByEmp[e.id] || 0) : 0, warningsCount: warningsByEmp[e.id] || 0 };
      })
      .sort((a, b) => b.sold - a.sold);
    // gerente ativo hoje OU com venda de equipe > 0 no mês exportado — mesma regra dos colaboradores.
    gerentes = (gerRows || [])
      .filter((g) => g.active || (soldByGerente[g.id] || 0) > 0)
      .map((g) => {
        const teamSold = soldByGerente[g.id] || 0;
        const t = tierByGerente[g.id];
        return { name: g.full_name, sold: teamSold, pct: t.gerentePct, amount: teamSold * (t.gerentePct / 100) };
      });
  }

  const comissaoColaboradores = employees.reduce((s, e) => s + e.commission, 0);
  const premiacoes = employees.reduce((s, e) => s + e.prizes, 0);
  const advertencias = employees.reduce((s, e) => s + e.warningsCount, 0);
  const comissaoGerente = gerentes.reduce((s, g) => s + g.amount, 0);
  const premiacoesAvulsas = avulsoPrizes.reduce((s, p) => s + p.amount, 0);

  return {
    empresaName,
    lojaName,
    month,
    monthLabelText: monthLabel(month),
    soldLoja,
    metaLoja,
    tierLabel: storeTier.tierLabel,
    atingimentoPct,
    multiEquipe: gerentes.length > 1,
    employees,
    gerentes,
    avulsoPrizes,
    totals: {
      comissaoColaboradores,
      comissaoGerente,
      premiacoes,
      premiacoesAvulsas,
      advertencias,
      geral: comissaoColaboradores + comissaoGerente + premiacoes + premiacoesAvulsas,
    },
  };
}

const NAVY = [18, 32, 58];
const GOLD = [201, 161, 90];
const MUTED = [125, 122, 111];
const LINE = [231, 227, 217];

// `options` (ver lib/ReportOptionsModal.js) decide quais seções entram no PDF — todas `true` por
// padrão (compatível com quem já chamava esta função sem o 2º argumento). A faixa de identificação
// (empresa/loja/gerente/período) e o rodapé sempre aparecem, independente da escolha.
export async function downloadMonthlyReportPdf(data, options = {}) {
  const opt = {
    faturamentoLoja: true,
    ranking: true,
    colaboradores: true,
    premiacoes: true,
    comissaoGerente: true,
    avulsos: true,
    resumo: true,
    ...options,
  };
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  let y = 46;

  // Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text("Z META", marginX, y);
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.text("Gestão de equipes de varejo", marginX, y + 13);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text("Relatório Mensal", pageWidth - marginX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const generatedAt = new Date().toLocaleString("pt-BR");
  doc.text(`Gerado em ${generatedAt}`, pageWidth - marginX, y + 13, { align: "right" });

  y += 26;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.4);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 22;

  // Faixa de identificação (empresa / loja / gerente / período)
  const stripY = y;
  doc.setFillColor(245, 243, 238);
  doc.roundedRect(marginX, stripY, pageWidth - marginX * 2, 40, 6, 6, "F");
  const stripCols = [
    { label: "EMPRESA", val: data.empresaName || "—" },
    { label: "LOJA", val: data.lojaName || "—" },
    { label: data.gerentes.length > 1 ? "GERENTES" : "GERENTE", val: data.gerentes.map((g) => g.name).join(", ") || "—" },
    { label: "PERÍODO", val: data.monthLabelText },
  ];
  const colWidth = (pageWidth - marginX * 2 - 24) / 4;
  stripCols.forEach((c, i) => {
    const cx = marginX + 12 + i * colWidth;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(c.label, cx, stripY + 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(String(c.val), cx, stripY + 29, { maxWidth: colWidth - 8 });
  });
  y = stripY + 40 + 24;

  function sectionTitle(text) {
    doc.setFillColor(...GOLD);
    doc.rect(marginX, y - 9, 3, 12, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(text.toUpperCase(), marginX + 9, y);
    y += 14;
  }

  // Faturamento da loja
  if (opt.faturamentoLoja) {
  sectionTitle("Faturamento da loja");
  const heroH = 66;
  doc.setFillColor(...NAVY);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, heroH, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text(formatBRL(data.soldLoja), marginX + 16, y + 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(220, 220, 225);
  doc.text("VENDIDO NO MÊS", marginX + 16, y + 44);

  const heroCol2X = marginX + (pageWidth - marginX * 2) * 0.5;
  const heroCol3X = marginX + (pageWidth - marginX * 2) * 0.75;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(formatBRL(data.metaLoja), heroCol2X, y + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(210, 210, 216);
  doc.text(`META EM JOGO (${data.tierLabel === "Não atingimento" ? "próxima" : data.tierLabel})`.toUpperCase(), heroCol2X, y + 38, { maxWidth: heroCol3X - heroCol2X - 10 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`${data.atingimentoPct.toFixed(1)}%`, heroCol3X, y + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(210, 210, 216);
  doc.text("ATINGIMENTO DA META", heroCol3X, y + 38);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(252, 165, 165);
  doc.text(data.tierLabel === "Não atingimento" ? "Nenhuma camada batida" : `Camada batida: ${data.tierLabel}`, heroCol3X, y + 50);

  y += heroH + 26;
  }

  // Ranking de vendedores — mesmas cores de medalha usadas no app (.rank-pos-1/2/3, ver
  // app/globals.css): ouro/prata/bronze pros 3 primeiros, cinza claro pros demais.
  if (opt.ranking) {
  sectionTitle("Ranking de vendedores do mês");
  const medalColors = { 1: GOLD, 2: [199, 204, 214], 3: [200, 138, 90] };
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["#", "Colaborador", "Vendido"]],
    body: data.employees.length ? data.employees.map((e, i) => [`${i + 1}º`, e.name, formatBRL(e.sold)]) : [["—", "Nenhuma venda registrada no mês", "—"]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, textColor: NAVY, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, lineColor: LINE, lineWidth: 0.5 },
    headStyles: { textColor: MUTED, fontStyle: "bold", fontSize: 7.5, lineWidth: { bottom: 1 }, lineColor: NAVY },
    columnStyles: { 0: { cellWidth: 34, halign: "center" }, 2: { halign: "right" } },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 0 && data.employees.length) {
        const rank = hookData.row.index + 1;
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.fillColor = medalColors[rank] || [237, 235, 229];
        hookData.cell.styles.textColor = NAVY;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 26;
  }

  // Faturamento e comissão por colaborador — "Premiações" é coluna condicional (opt.premiacoes,
  // toggle independente de opt.avulsos): quem não quer ver premiação nenhuma no relatório tira as
  // duas separadamente.
  if (opt.colaboradores) {
  sectionTitle("Faturamento e comissão por colaborador");
  const showPrizesCol = !!opt.premiacoes;
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Colaborador", "Vendido", "% comissão", "Comissão", ...(showPrizesCol ? ["Premiações"] : []), "Advertências"]],
    body: data.employees.map((e) => [
      e.name,
      formatBRL(e.sold),
      `${e.commissionPct.toFixed(1)}%`,
      formatBRL(e.commission),
      ...(showPrizesCol ? [formatBRL(e.prizes)] : []),
      String(e.warningsCount),
    ]),
    foot: [[
      "Total",
      formatBRL(data.soldLoja),
      "",
      formatBRL(data.totals.comissaoColaboradores),
      ...(showPrizesCol ? [formatBRL(data.totals.premiacoes)] : []),
      String(data.totals.advertencias),
    ]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, textColor: NAVY, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, lineColor: LINE, lineWidth: 0.5 },
    headStyles: { textColor: MUTED, fontStyle: "bold", fontSize: 7.5, lineWidth: { bottom: 1 }, lineColor: NAVY },
    footStyles: { textColor: NAVY, fontStyle: "bold", fontSize: 9, lineWidth: { top: 1 }, lineColor: NAVY, fillColor: 255 },
    columnStyles: showPrizesCol
      ? { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } }
      : { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
  });
  y = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  // 2026-08-31: o % de cada colaborador é INDIVIDUAL — contra a própria cota (a mesma que ele vê na
  // própria tela), nunca contra o total da loja ou da equipe. Corrigido bug real onde esse texto
  // (e o cálculo por trás) descrevia um % único tirado do total agregado.
  doc.text(
    "% de comissão de cada colaborador corresponde à maior meta que ele mesmo bateu no mês, comparada à própria cota — não ao total da loja ou da equipe.",
    marginX,
    y,
    { maxWidth: pageWidth - marginX * 2 }
  );
  y += 24;
  }

  // 2026-09-03: Premiações por colaborador como tabela PRÓPRIA — só quando "Faturamento e comissão
  // por colaborador" está DESMARCADA (senão a premiação já aparece como coluna dentro daquela
  // tabela, ver showPrizesCol acima — comportamento de sempre, sem mudança pra quem já usa assim).
  // Sem isso, um relatório "só de premiações" (avulsas + colaboradores, sem comissão) desmarcava
  // "colaboradores" e a premiação por colaborador sumia inteira do PDF (bug real apontado pelo
  // Felipe) — só as avulsas sobreviviam, por serem uma seção independente.
  const employeesWithPrizes = data.employees.filter((e) => e.prizes > 0);
  if (opt.premiacoes && !opt.colaboradores && employeesWithPrizes.length > 0) {
    sectionTitle("Premiações por colaborador");
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Colaborador", "Premiações"]],
      body: employeesWithPrizes.map((e) => [e.name, formatBRL(e.prizes)]),
      foot: [["Total", formatBRL(employeesWithPrizes.reduce((s, e) => s + e.prizes, 0))]],
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9, textColor: NAVY, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, lineColor: LINE, lineWidth: 0.5 },
      headStyles: { textColor: MUTED, fontStyle: "bold", fontSize: 7.5, lineWidth: { bottom: 1 }, lineColor: NAVY },
      footStyles: { textColor: NAVY, fontStyle: "bold", fontSize: 9, lineWidth: { top: 1 }, lineColor: NAVY, fillColor: 255 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = doc.lastAutoTable.finalY + 26;
  }

  // Comissão do(s) gerente(s)
  if (opt.comissaoGerente) {
  sectionTitle(data.gerentes.length > 1 ? "Comissão dos gerentes" : "Comissão do gerente");
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Gerente", "Base de cálculo", "% comissão", "Comissão"]],
    body: data.gerentes.map((g) => [
      g.name || "—",
      `${formatBRL(g.sold)} (venda da equipe)`,
      `${g.pct.toFixed(1)}%`,
      formatBRL(g.amount),
    ]),
    foot: data.gerentes.length > 1 ? [["Total", "", "", formatBRL(data.totals.comissaoGerente)]] : undefined,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, textColor: NAVY, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, lineColor: LINE, lineWidth: 0.5 },
    headStyles: { textColor: MUTED, fontStyle: "bold", fontSize: 7.5, lineWidth: { bottom: 1 }, lineColor: NAVY },
    footStyles: { textColor: NAVY, fontStyle: "bold", fontSize: 9, lineWidth: { top: 1 }, lineColor: NAVY, fillColor: 255 },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
  });
  y = doc.lastAutoTable.finalY + 26;
  }

  // Premiações avulsas — pra quem recebeu premiação mas não tem cadastro no Z Meta (ex.:
  // estoquista). Só aparece se houver ao menos um lançamento avulso no mês; não faz sentido mostrar
  // uma tabela vazia pra loja que nunca usou esse recurso.
  if (opt.avulsos && data.avulsoPrizes.length > 0) {
  sectionTitle("Premiações avulsas (sem cadastro no sistema)");
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Nome", "Função", "Motivo", "Valor"]],
    body: data.avulsoPrizes.map((p) => [p.name, p.role || "—", p.description || "—", formatBRL(p.amount)]),
    foot: [["Total", "", "", formatBRL(data.totals.premiacoesAvulsas)]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, textColor: NAVY, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, lineColor: LINE, lineWidth: 0.5 },
    headStyles: { textColor: MUTED, fontStyle: "bold", fontSize: 7.5, lineWidth: { bottom: 1 }, lineColor: NAVY },
    footStyles: { textColor: NAVY, fontStyle: "bold", fontSize: 9, lineWidth: { top: 1 }, lineColor: NAVY, fillColor: 255 },
    columnStyles: { 3: { halign: "right" } },
  });
  y = doc.lastAutoTable.finalY + 26;
  }

  // Resumo do mês — premiações (por colaborador e avulsas) só entram na soma se a respectiva opção
  // estiver marcada; cada uma pode ser incluída/excluída do relatório de forma independente.
  const premiacoesIncluidas = (opt.premiacoes ? data.totals.premiacoes : 0) + (opt.avulsos ? data.totals.premiacoesAvulsas : 0);
  const totalGeralIncluido = data.totals.comissaoColaboradores + data.totals.comissaoGerente + premiacoesIncluidas;
  if (opt.resumo) {
  if (y > 700) { doc.addPage(); y = 46; }
  sectionTitle("Resumo do mês");
  const cardW = (pageWidth - marginX * 2 - 24) / 3;
  const cards = [
    { label: "COMISSÃO COLABORADORES", val: formatBRL(data.totals.comissaoColaboradores) },
    { label: "COMISSÃO GERENTE", val: formatBRL(data.totals.comissaoGerente) },
    { label: "PREMIAÇÕES PAGAS", val: formatBRL(premiacoesIncluidas) },
  ];
  cards.forEach((c, i) => {
    const cx = marginX + i * (cardW + 12);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(1);
    doc.roundedRect(cx, y, cardW, 46, 6, 6, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(c.label, cx + 10, y + 16, { maxWidth: cardW - 20 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...NAVY);
    doc.text(c.val, cx + 10, y + 34);
  });
  y += 46 + 12;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.4);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 46, 6, 6, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("TOTAL GERAL A PAGAR (COMISSÕES + PREMIAÇÕES)", marginX + 12, y + 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text(formatBRL(totalGeralIncluido), marginX + 12, y + 36);
  }

  // Rodapé
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, pageHeight - 34, pageWidth - marginX, pageHeight - 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Relatório gerado automaticamente pelo Z Meta.", marginX, pageHeight - 22);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - marginX, pageHeight - 22, { align: "right" });
  }

  const safeLoja = (data.lojaName || "loja").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  doc.save(`relatorio-mensal-${safeLoja}-${data.month}.pdf`);
}

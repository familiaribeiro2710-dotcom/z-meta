import { Sun, CloudSun, Moon } from "lucide-react";

const TZ = "America/Sao_Paulo";

// 'YYYY-MM-DD' no fuso de SP, sempre.
export function todayStr(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${day}`;
}

export function firstDayOfMonth(dateStr) {
  return dateStr.slice(0, 7) + "-01";
}

export function daysInMonth(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function dayOfMonth(dateStr) {
  return Number(dateStr.split("-")[2]);
}

export function remainingDaysInMonth(dateStr) {
  return daysInMonth(dateStr) - dayOfMonth(dateStr) + 1; // inclui hoje
}

// Lista de dias (strings 'YYYY-MM-DD') de um mês que já "aconteceram": do dia 1 até hoje, se for
// o mês corrente, ou até o último dia do mês, se for um mês fechado. Usado por qualquer cálculo
// de "esperado" (barra de tarefas, individual ou de equipe) que precisa cruzar cada dia já
// ocorrido com isTaskDueOn — em vez de contar linhas de task_completions já existentes, que só
// nascem quando alguém abre o checklist daquele dia ("semeadura preguiçosa") e por isso não podem
// ser a fonte de verdade de quantos dias uma tarefa realmente valia.
export function daysElapsedInMonth(monthArg, todayArg = todayStr()) {
  const rangeEnd = monthArg === firstDayOfMonth(todayArg) ? todayArg : `${monthArg.slice(0, 7)}-${String(daysInMonth(monthArg)).padStart(2, "0")}`;
  const days = [];
  const [sy, sm, sd] = monthArg.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  let ds = cursor.toISOString().slice(0, 10);
  while (ds <= rangeEnd) {
    days.push(ds);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    ds = cursor.toISOString().slice(0, 10);
  }
  return days;
}

// Primeiro dia do mês anterior a `dateStr` (ou ao mês do próprio dateStr, se ele não for dia 1).
// Usado pelo ritual de fechamento de mês — no dia 1+ de qualquer mês, o mês "a fechar" é sempre
// o anterior ao mês corrente.
export function previousMonth(dateStr) {
  const [y, m] = firstDayOfMonth(dateStr).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

// Primeiro dia do mês seguinte a `dateStr` (ou ao mês do próprio dateStr, se ele não for dia 1).
// Usado pelo `maxMonth` do MonthNav nas abas Metas/Online de sócio/supervisor/gerente (2026-07-21),
// que passaram a permitir ver o mês seguinte adiantado (planejar meta antes do mês virar de
// verdade), diferente do resto do app, que continua travado no mês corrente.
export function nextMonth(dateStr) {
  const [y, m] = firstDayOfMonth(dateStr).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function monthLabel(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Decide se uma tarefa está em vigor num dia específico, de acordo com a recorrência dela:
// 'daily' -> todo dia; 'weekly' -> só no dia da semana configurado (weekday, 0=domingo);
// 'once' -> só na data exata (once_date). Tarefas antigas sem recurrence_type contam como 'daily'.
// Nenhuma tarefa pode estar em vigor antes da sua start_date (dia em que foi criada) —
// isso evita que uma tarefa recém-criada apareça como pendente/atrasada em dias passados.
export function isTaskDueOn(task, dateStr) {
  if (!task) return false;
  if (task.start_date && dateStr < task.start_date) return false;
  if (task.recurrence_type === "weekly") return weekdayOf(dateStr) === task.weekday;
  if (task.recurrence_type === "once") return task.once_date === dateStr;
  return true;
}

// Divide um mês em "períodos" de acordo com a régua de ritmo de uma meta (pacing: dia/semana/
// quinzena/estagio). 'dia' não usa isso (a meta de hoje já tem lógica própria — ver
// remainingDaysInMonth); pra qualquer outra régua, retorna a lista de {start, end} (strings
// 'YYYY-MM-DD', inclusive nas duas pontas) que cobre o mês inteiro sem sobrar nem faltar dia.
// Semana = segunda a domingo, cortada nas bordas do mês (a primeira/última podem ter menos de 7
// dias) — pedido explícito do Felipe pra não vazar dias de um mês pro cálculo do outro.
export function goalPeriods(monthArg, pacing) {
  const last = daysInMonth(monthArg);
  const ym = monthArg.slice(0, 7);
  const dateOf = (day) => `${ym}-${String(day).padStart(2, "0")}`;

  if (pacing === "quinzena") {
    const periods = [{ start: dateOf(1), end: dateOf(Math.min(15, last)) }];
    if (last > 15) periods.push({ start: dateOf(16), end: dateOf(last) });
    return periods;
  }
  if (pacing === "estagio") {
    const periods = [{ start: dateOf(1), end: dateOf(Math.min(10, last)) }];
    if (last > 10) periods.push({ start: dateOf(11), end: dateOf(Math.min(20, last)) });
    if (last > 20) periods.push({ start: dateOf(21), end: dateOf(last) });
    return periods;
  }
  if (pacing === "semana") {
    const periods = [];
    let day = 1;
    while (day <= last) {
      const wd = weekdayOf(dateOf(day)); // 0=domingo..6=sábado
      const daysToSunday = wd === 0 ? 0 : 7 - wd;
      const endDay = Math.min(day + daysToSunday, last);
      periods.push({ start: dateOf(day), end: dateOf(endDay) });
      day = endDay + 1;
    }
    return periods;
  }
  return [{ start: dateOf(1), end: dateOf(last) }]; // 'dia' (ou valor desconhecido): o mês inteiro como um período só
}

// Generaliza remainingDaysInMonth pras réguas semana/quinzena/estagio: quantos períodos daquela
// régua ainda restam a partir de hoje, contando o período atual — é por isso (e só isso) que o
// "falta pra bater a meta" é dividido na hora de calcular o ritmo (mesmo padrão de
// remainingDaysInMonth/dailyGoal, só que generalizado pra uma régua maior que o dia). Mês fechado
// (todayArg fora do mês de monthArg) retorna 0, igual ao comportamento já existente de "dia".
export function remainingPeriodsInMonth(monthArg, todayArg, pacing) {
  if (!pacing || pacing === "dia") return remainingDaysInMonth(todayArg);
  if (todayArg.slice(0, 7) !== monthArg.slice(0, 7)) return 0;
  const periods = goalPeriods(monthArg, pacing);
  const idx = periods.findIndex((p) => todayArg >= p.start && todayArg <= p.end);
  if (idx === -1) return periods.length;
  return periods.length - idx;
}

const PACING_NAMES = { semana: "semana", quinzena: "quinzena", estagio: "estágio" };
const PACING_PREPOSITIONS = { semana: "nesta", quinzena: "nesta", estagio: "neste" };

// Rótulo pronto pra usar no herocard/cards de meta: "hoje" (ritmo diário) ou "nesta semana (3 de
// 4)" / "nesta quinzena (2 de 2)" / "neste estágio (2 de 3)" pras outras réguas.
export function periodLabel(monthArg, todayArg, pacing) {
  if (!pacing || pacing === "dia") return "hoje";
  const periods = goalPeriods(monthArg, pacing);
  const idx = periods.findIndex((p) => todayArg >= p.start && todayArg <= p.end);
  const name = PACING_NAMES[pacing] || pacing;
  const prep = PACING_PREPOSITIONS[pacing] || "no";
  if (idx === -1) return `${prep} ${name}`;
  return `${prep} ${name} (${idx + 1} de ${periods.length})`;
}

export const PACING_LABELS = { dia: "Dia", semana: "Semana", quinzena: "Quinzena", estagio: "Estágio" };

// Rótulos prontos pro herocard de meta (colaborador/gerente, ambas categorias) — o cabeçalho e a
// unidade usada na frase "restam N ___" mudam conforme o ritmo escolhido na meta ativa.
export const PACING_HERO_LABEL = { dia: "Meta de hoje", semana: "Meta desta semana", quinzena: "Meta desta quinzena", estagio: "Meta deste estágio" };
export const PACING_UNIT = { dia: "dia", semana: "semana", quinzena: "quinzena", estagio: "estágio" };

// Premiação extra (2026-08-06, pedido do Felipe): além de vincular a um gol, agora pode ficar
// restrita a UM período específico dentro do mês (uma semana/quinzena/estágio exatos, com datas
// gravadas em prize_period_start/end) em vez de valer o mês inteiro. `goal` só precisa ter
// prize_period_type/prize_period_start/prize_period_end (aceita a linha de sales_goals/
// consorcio_goals direto). Sem período configurado (ou 'mes') = sempre ativa, mesmo comportamento
// de antes.
export function isPrizePeriodActive(goal, today = todayStr()) {
  if (!goal || !goal.prize_period_type || goal.prize_period_type === "mes") return true;
  if (!goal.prize_period_start || !goal.prize_period_end) return true;
  return today >= goal.prize_period_start && today <= goal.prize_period_end;
}

// Texto pronto pro aviso fixo do herocard: "este mês" (padrão) ou "nesta semana"/"nesta
// quinzena"/"neste estágio" quando a premiação está restrita a um período específico.
export function prizeWindowLabel(periodType) {
  if (!periodType || periodType === "mes") return "este mês";
  const name = PACING_NAMES[periodType] || periodType;
  const prep = PACING_PREPOSITIONS[periodType] || "no";
  return `${prep} ${name}`;
}

export function greeting(d = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)
  );
  if (hour < 12) return { word: "Bom dia", Icon: Sun };
  if (hour < 18) return { word: "Boa tarde", Icon: CloudSun };
  return { word: "Boa noite", Icon: Moon };
}

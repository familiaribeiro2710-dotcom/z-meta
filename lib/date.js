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

export function greeting(d = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)
  );
  if (hour < 12) return { word: "Bom dia", Icon: Sun };
  if (hour < 18) return { word: "Boa tarde", Icon: CloudSun };
  return { word: "Boa noite", Icon: Moon };
}

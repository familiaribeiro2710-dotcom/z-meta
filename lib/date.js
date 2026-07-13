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

export function stageNumberForDate(dateStr) {
  const d = dayOfMonth(dateStr);
  if (d <= 10) return 1;
  if (d <= 20) return 2;
  return 3;
}

export function stageRangeLabel(stageNumber, dateStr) {
  const total = daysInMonth(dateStr);
  if (stageNumber === 1) return `dias 1–10`;
  if (stageNumber === 2) return `dias 11–20`;
  return `dias 21–${total}`;
}

export function monthLabel(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function yesterdayStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function greeting(d = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)
  );
  if (hour < 12) return { word: "Bom dia", Icon: Sun };
  if (hour < 18) return { word: "Boa tarde", Icon: CloudSun };
  return { word: "Boa noite", Icon: Moon };
}

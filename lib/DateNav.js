"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

function fmt(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Setinhas de dia anterior / dia seguinte. "Seguinte" fica desabilitado quando
// já está em maxDate (normalmente hoje) — não dá pra navegar pro futuro.
// `dark`: variante de cor pra uso dentro de .card-dark (fundo navy) — mesma acento
// dourado usado em .label-dark/ícones de card-dark, em vez do roxo do card claro.
export default function DateNav({ date, onChange, maxDate, dark = false }) {
  const isToday = maxDate && date === maxDate;
  const atMax = maxDate ? date >= maxDate : false;

  function shift(delta) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (maxDate && next > maxDate) return;
    onChange(next);
  }

  const btnBase = dark
    ? "border-white/20 text-white/60 hover:border-goldlight hover:text-goldlight"
    : "border-line text-muted hover:border-purple hover:text-purple";
  const btnDisabled = dark ? "border-white/10 text-white/25 opacity-60 cursor-not-allowed" : "border-line text-line opacity-50 cursor-not-allowed";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Dia anterior"
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${btnBase}`}
      >
        <ChevronLeft size={14} />
      </button>
      <span className={`text-xs font-bold whitespace-nowrap ${dark ? "text-white" : "text-navy"}`}>{fmt(date)}{isToday ? " · hoje" : ""}</span>
      <button
        type="button"
        onClick={() => shift(1)}
        disabled={atMax}
        aria-label="Dia seguinte"
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${atMax ? btnDisabled : btnBase}`}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

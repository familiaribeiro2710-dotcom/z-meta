"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

function fmt(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Setinhas de dia anterior / dia seguinte. "Seguinte" fica desabilitado quando
// já está em maxDate (normalmente hoje) — não dá pra navegar pro futuro.
export default function DateNav({ date, onChange, maxDate }) {
  const isToday = maxDate && date === maxDate;
  const atMax = maxDate ? date >= maxDate : false;

  function shift(delta) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (maxDate && next > maxDate) return;
    onChange(next);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Dia anterior"
        className="w-7 h-7 rounded-full border-2 border-line flex items-center justify-center text-muted hover:border-purple hover:text-purple transition-all"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-xs font-bold text-navy whitespace-nowrap">{fmt(date)}{isToday ? " · hoje" : ""}</span>
      <button
        type="button"
        onClick={() => shift(1)}
        disabled={atMax}
        aria-label="Dia seguinte"
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
          atMax ? "border-line text-line opacity-50 cursor-not-allowed" : "border-line text-muted hover:border-purple hover:text-purple"
        }`}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

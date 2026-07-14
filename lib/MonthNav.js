"use client";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

function fmtMonth(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Botão de mês — só permite navegar pra meses anteriores (meses seguintes não existem ainda).
export default function MonthNav({ month, onChange, maxMonth }) {
  const atMax = maxMonth ? month >= maxMonth : false;

  function shift(delta) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    if (maxMonth && next > maxMonth) return;
    onChange(next);
  }

  return (
    <div className="flex items-center gap-1 bg-white/70 rounded-full border-2 border-line pl-1 pr-2 py-1 shrink-0">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Mês anterior"
        className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-purple hover:bg-line/50 transition-all"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="text-xs font-bold text-navy whitespace-nowrap flex items-center gap-1 px-1">
        <Calendar size={12} /> {fmtMonth(month)}
      </span>
      <button
        type="button"
        onClick={() => shift(1)}
        disabled={atMax}
        aria-label="Mês seguinte"
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
          atMax ? "text-line cursor-not-allowed opacity-50" : "text-muted hover:text-purple hover:bg-line/50"
        }`}
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

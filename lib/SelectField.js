"use client";
import { ChevronDown } from "lucide-react";

// Select padronizado do app inteiro — mesmo raio de canto e cor de destaque do .input
// (2026-08-13, pedido do Felipe: campo de texto e seletor tinham raio/cor diferentes — unificado),
// seta customizada por cima de um <select> nativo "invisível" (appearance-none). Qualquer novo
// seletor do app deve usar este componente em vez de um <select className="input"> cru, pra manter
// a aparência única em todas as páginas.
export default function SelectField({ value, onChange, children, icon: Icon, className = "", selectClassName = "", disabled, ...rest }) {
  return (
    <label
      className={`flex items-center gap-1.5 bg-white border-2 border-line rounded-2xl pl-3 pr-2.5 py-1.5 shadow-soft transition-colors min-w-0 ${
        disabled ? "opacity-60 cursor-not-allowed" : "hover:border-gold/60 cursor-pointer"
      } ${className}`}
    >
      {Icon && <Icon size={14} className="text-gold shrink-0" />}
      <span className="relative min-w-0 flex-1">
        <select
          className={`appearance-none !border-0 !bg-transparent !py-0 !pl-0 !pr-4 !shadow-none !ring-0 text-xs font-bold text-navy focus:outline-none w-full min-w-0 ${
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          } ${selectClassName}`}
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown size={13} className="text-muted absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
      </span>
    </label>
  );
}

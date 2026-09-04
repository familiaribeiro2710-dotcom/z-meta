"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";

// ---------- CNPJ ----------

export function maskCNPJ(raw) {
  let d = String(raw || "").replace(/\D/g, "").slice(0, 14);
  if (d.length > 12) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
  if (d.length > 8) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
  if (d.length > 5) return d.replace(/^(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
  if (d.length > 2) return d.replace(/^(\d{2})(\d{0,3})/, "$1.$2");
  return d;
}

export function CnpjInput({ value, onChange, className = "input", ...props }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      value={value}
      onChange={(e) => onChange(maskCNPJ(e.target.value))}
      placeholder="00.000.000/0000-00"
      maxLength={18}
      {...props}
    />
  );
}

// ---------- Telefone ----------

export function maskPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "").slice(0, 11);
  if (d.length > 10) return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  if (d.length > 6) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  if (d.length > 2) return d.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
  if (d.length > 0) return d.replace(/^(\d{0,2})/, "($1");
  return d;
}

export function PhoneInput({ value, onChange, className = "input", ...props }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      value={value}
      onChange={(e) => onChange(maskPhone(e.target.value))}
      placeholder="(00) 00000-0000"
      maxLength={15}
      {...props}
    />
  );
}

// ---------- Moeda (R$) ----------
// value/onChange trabalham em reais (número); a digitação preenche os centavos da direita
// para a esquerda, no padrão de inputs monetários brasileiros (ex: bancos, maquininhas).

function digitsFromValue(v) {
  if (v === "" || v === null || v === undefined || Number.isNaN(Number(v))) return "";
  const cents = Math.round(Number(v) * 100);
  return String(cents);
}

export function CurrencyInput({ value, onChange, className = "input", placeholder, ...props }) {
  const [raw, setRaw] = useState(() => digitsFromValue(value));

  useEffect(() => {
    setRaw(digitsFromValue(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
    setRaw(digits);
    onChange(digits === "" ? "" : parseInt(digits, 10) / 100);
  }

  const display = raw === "" ? "" : (parseInt(raw, 10) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none font-semibold">R$</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={`${className} !pl-11`}
        value={display}
        onChange={handleChange}
        placeholder={placeholder || "0,00"}
        {...props}
      />
    </div>
  );
}

// ---------- Data opcional, com botão de limpar ----------
// input[type=date] nativo não tem um jeito fácil de apagar o valor no iOS (o "x" que aparece no
// Chrome desktop não existe no Safari mobile) — 2026-09-04, bug real reportado pelo Felipe: campo
// "Agendar — data" (opcional, diferente de "Data da ligação", que é obrigatório e não precisa
// disso) não tinha nenhuma forma de voltar a ficar vazio depois de escolher uma data por engano.
// Só aparece quando `value` está preenchido, pra não poluir o campo vazio com um "x" sem função.
export function ClearableDateInput({ value, onChange, className = "input date-input", ...props }) {
  return (
    <div className="relative">
      <input
        type="date"
        className={`${className} ${value ? "!pr-9" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Limpar data"
          aria-label="Limpar data"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-danger transition-colors"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

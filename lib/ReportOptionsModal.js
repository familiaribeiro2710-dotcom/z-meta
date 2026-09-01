"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useEffect } from "react";
import { FileDown, Loader2 } from "lucide-react";

// 2026-08-31, pedido do Felipe: antes de baixar o relatório mensal em PDF, o usuário escolhe quais
// seções entram no arquivo — cobre TODAS as informações que já existem no relatório (faturamento
// da loja, ranking de vendedores, faturamento/comissão por colaborador, comissão do(s) gerente(s)
// e resumo do mês). Tudo vem marcado por padrão (mesmo comportamento de sempre, só que agora
// opcional). As chaves aqui batem 1:1 com o parâmetro `options` de `downloadMonthlyReportPdf`
// (lib/monthlyReport.js) — adicionar uma seção nova ali exige adicionar a entrada aqui também.
const SECTIONS = [
  { key: "faturamentoLoja", label: "Faturamento da loja", desc: "Total vendido, meta em jogo e % de atingimento." },
  { key: "ranking", label: "Ranking de vendedores", desc: "Colocação de cada colaborador pelo total vendido no mês." },
  { key: "colaboradores", label: "Faturamento e comissão por colaborador", desc: "Vendido, % de comissão, comissão, premiações e advertências de cada um." },
  { key: "comissaoGerente", label: "Comissão do(s) gerente(s)", desc: "Base de cálculo e valor da comissão de cada gerente da loja." },
  { key: "resumo", label: "Resumo do mês", desc: "Totais de comissão, premiações e o valor geral a pagar." },
];

export function defaultReportOptions() {
  return Object.fromEntries(SECTIONS.map((s) => [s.key, true]));
}

export default function ReportOptionsModal({ open, onClose, onConfirm, loading }) {
  const [options, setOptions] = useState(defaultReportOptions());
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setOptions(defaultReportOptions());
  }, [open]);

  if (!open || !mounted) return null;

  const noneSelected = SECTIONS.every((s) => !options[s.key]);

  function toggle(key) {
    setOptions((o) => ({ ...o, [key]: !o[key] }));
  }

  function handleConfirm() {
    if (noneSelected || loading) return;
    onConfirm(options);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 p-4 sm:p-6 pt-[calc(env(safe-area-inset-top)+1rem)]"
      onClick={() => !loading && onClose()}
    >
      <div className="min-h-full flex items-start sm:items-center justify-center">
        <div className="card max-w-sm w-full my-8 sm:my-0 animate-bounce-in border-gold/30" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-extrabold text-navy flex items-center gap-2">
            <FileDown size={20} className="text-gold shrink-0" /> Relatório do mês
          </h2>
          <p className="text-sm text-muted mt-1">Escolha o que entra no PDF.</p>

          <div className="mt-4 space-y-3">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={!!options[s.key]}
                  onChange={() => toggle(s.key)}
                />
                <span>
                  <span className="block text-sm font-bold text-navy">{s.label}</span>
                  <span className="block text-xs text-muted mt-0.5">{s.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {noneSelected && <p className="text-xs text-danger mt-3">Selecione pelo menos uma seção.</p>}

          <div className="flex gap-2 mt-5">
            <button type="button" className="btn-outline flex-1" disabled={loading} onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn flex-1 flex items-center justify-center gap-1.5" disabled={loading || noneSelected} onClick={handleConfirm}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              {loading ? "Gerando…" : "Gerar PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

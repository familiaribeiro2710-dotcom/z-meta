"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarCheck } from "lucide-react";

// Modal do ritual de fechamento de mês — pergunta pro gerente/supervisor se o mês anterior está
// sem pendência (vestuário: vendas lançadas; consórcio: vendas aprovadas/sem vendido_pendente
// parado, conferido com o financeiro) e pode ser fechado. 2026-07-23, funciona nas duas
// categorias — a pergunta é sobre "está tudo certo?", não sobre lançar venda especificamente.
//
// "Sim" chama a RPC (confirm_month_closing_gerente/supervisor, ou as variantes _consorcio) — que
// só grava a confirmação e revela os premiados do ranking, sem travar nenhum lançamento futuro
// (decisão explícita do Felipe: é um ritual, não uma trava de dados). "Não" só fecha o modal sem
// gravar nada — ele volta a perguntar em toda próxima visita ao Início, também por decisão
// explícita dele (mais insistente que o padrão usual do app, de propósito).
export default function MonthClosingAskModal({ open, role, monthLabel, onConfirm, onDismiss }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  const escopo = role === "supervisor" ? "de todas as lojas que você acompanha" : "da sua equipe";

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      await onConfirm();
    } catch (e) {
      setError(e.message || "Não foi possível confirmar. Tente de novo.");
      setLoading(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 p-4 sm:p-6 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="min-h-full flex items-start sm:items-center justify-center">
        <div className="card max-w-sm w-full my-8 sm:my-0 animate-bounce-in border-purple/30">
          <div className="w-11 h-11 rounded-2xl bg-purple/10 text-purple flex items-center justify-center mb-3">
            <CalendarCheck size={22} />
          </div>
          <h2 className="text-lg font-extrabold text-navy">Fechar {monthLabel}?</h2>
          <p className="text-sm text-muted mt-2">
            {monthLabel} {escopo} está sem pendência — vendas conferidas, tudo certo? Ao confirmar, o ranking do mês fica revelado pros premiados.
          </p>
          <p className="text-[11px] text-muted mt-2">Isso não trava nada no sistema — só marca que você já conferiu.</p>
          {error && <p className="text-xs text-danger mt-2">{error}</p>}
          <div className="flex gap-2 mt-5">
            <button type="button" className="btn-outline flex-1" disabled={loading} onClick={onDismiss}>
              Ainda não
            </button>
            <button type="button" className="btn flex-1" disabled={loading} onClick={handleConfirm}>
              {loading ? "Aguarde…" : "Sim, pode fechar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

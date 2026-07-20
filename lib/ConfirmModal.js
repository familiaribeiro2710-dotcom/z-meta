"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";

// Modal de confirmação reutilizável — pedido do Felipe: toda ação de ativar/desativar/excluir
// (empresa e loja, no Master Admin) precisa de um modal de confirmação de verdade antes de
// executar, não um `window.confirm`/`window.prompt` do navegador. O aviso de "foi feito" depois
// da ação continua vindo do `useSavedNotice()` já existente (lib/SavedNotice.js) — esse
// componente aqui cobre só o passo de ANTES.
//
// `confirmText`, se informado, exige que o usuário digite exatamente esse texto (nome da
// empresa/loja) pra habilitar o botão de confirmar — mesmo nível de fricção que o
// `window.prompt` antigo tinha pra exclusão. Sem `confirmText`, é um Cancelar/Confirmar simples
// (usado pra ativar/desativar).
export default function ConfirmModal({ open, title, message, confirmLabel = "Confirmar", danger = false, confirmText, onConfirm, onCancel }) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const canConfirm = !confirmText || typed === confirmText;

  function handleCancel() {
    if (loading) return;
    setTyped("");
    setError("");
    onCancel();
  }

  async function handleConfirm() {
    if (!canConfirm || loading) return;
    setLoading(true);
    setError("");
    try {
      await onConfirm();
      setTyped("");
    } catch (e) {
      setError(e.message || "Não foi possível concluir a ação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6" onClick={handleCancel}>
      <div className={`card max-w-sm w-full animate-bounce-in ${danger ? "border-danger/30" : "border-purple/30"}`} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-extrabold text-navy flex items-center gap-2">
          {danger && <AlertTriangle className="text-danger shrink-0" size={20} />}
          {title}
        </h2>
        <p className="text-sm text-muted mt-2">{message}</p>
        {confirmText && (
          <div className="mt-3">
            <label className="label">Digite &quot;{confirmText}&quot; para confirmar</label>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn-outline flex-1" disabled={loading} onClick={handleCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className={danger ? "btn-danger flex-1" : "btn flex-1"}
            disabled={loading || !canConfirm}
            onClick={handleConfirm}
          >
            {loading ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

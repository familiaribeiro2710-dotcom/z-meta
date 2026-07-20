"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);

  // Renderizado via portal em document.body (mesma correção já aplicada em
  // lib/PushNotifications.js): esse modal pode abrir dentro do Master Admin, cujo <header>
  // (AppShell.js) usa backdrop-blur — em WebKit/Safari isso vira o containing block de
  // qualquer position:fixed dentro dele, fazendo o overlay não cobrir a tela inteira direito
  // e "flutuar"/deslocar em vez de ficar fixo. `mounted` evita acessar `document` durante SSR.
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

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

  // Overlay inteiro rolável (não só o card) — mesmo padrão de lib/PushNotifications.js: no
  // mobile, `vh` pode ser calculado contra a altura "estática" do viewport (antes do teclado
  // abrir ou da barra de endereço recolher), então centralizar com `flex items-center` sozinho
  // podia deixar o modal nascendo deslocado/instável enquanto o navegador recalculava a
  // viewport durante a digitação. Rolar o overlay inteiro garante que o modal sempre fica
  // alcançável e parado, independente disso.
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 p-4 sm:p-6" onClick={handleCancel}>
      <div className="min-h-full flex items-start sm:items-center justify-center">
        <div
          className={`card max-w-sm w-full my-8 sm:my-0 animate-bounce-in ${danger ? "border-danger/30" : "border-purple/30"}`}
          onClick={(e) => e.stopPropagation()}
        >
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
    </div>,
    document.body
  );
}

"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

// Confirmação global de "alterações salvas" — pedido do Felipe: todo botão de salvar/cadastrar/
// configuração do app precisa mostrar essa confirmação, sem cada componente precisar reimplementar
// o próprio aviso. `SavedNoticeProvider` é montado UMA vez em AppShell.js (toda tela autenticada já
// passa por ali), e qualquer componente descendente chama `useSavedNotice()` pra disparar o aviso.
//
// 2026-08-09 (pedido do Felipe, aprovado por mockup): era um modal de tela cheia com overlay escuro
// que exigia tocar em "OK" pra sumir — trocado por um toast flutuante no rodapé, some sozinho
// depois de alguns segundos (ou no toque, se quiser fechar antes). Não bloqueia mais a tela.
const SavedNoticeContext = createContext(null);
const AUTO_HIDE_MS = 2600;
const EXIT_MS = 250;

export function SavedNoticeProvider({ children }) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const hideTimeoutRef = useRef(null);
  const clearTimeoutRef = useRef(null);

  const dismiss = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setVisible(false);
    clearTimeoutRef.current = setTimeout(() => setMessage(""), EXIT_MS);
  }, []);

  const notifySaved = useCallback((msg) => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    setMessage(msg || "Alterações salvas com sucesso.");
    // rAF garante que o navegador registre o estado "escondido" antes de virar "visível" — sem
    // isso, a transição de entrada às vezes não anima (o React já monta com opacity:1 direto).
    setVisible(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    hideTimeoutRef.current = setTimeout(dismiss, AUTO_HIDE_MS);
  }, [dismiss]);

  return (
    <SavedNoticeContext.Provider value={notifySaved}>
      {children}
      {message && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-[100] flex justify-center px-4 pointer-events-none">
          <div
            role="status"
            onClick={dismiss}
            className={`pointer-events-auto flex items-center gap-2.5 bg-navy text-white rounded-full pl-3 pr-4 py-2.5 shadow-navycard cursor-pointer transition-all duration-300 ease-out ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-success/20 text-success flex items-center justify-center shrink-0">
              <CheckCircle2 size={15} />
            </span>
            <span className="text-xs font-bold">{message}</span>
          </div>
        </div>
      )}
    </SavedNoticeContext.Provider>
  );
}

// Fallback no-op caso algum componente seja usado fora do provider (ex.: telas de login, sem
// AppShell) — evita crash, só não mostra a confirmação.
const noop = () => {};

export function useSavedNotice() {
  const ctx = useContext(SavedNoticeContext);
  return ctx || noop;
}

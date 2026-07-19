"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2 } from "lucide-react";

// Confirmação global de "alterações salvas" — pedido do Felipe: todo botão de salvar/cadastrar/
// configuração do app precisa mostrar essa confirmação, sem cada componente precisar reimplementar
// o próprio modal. `SavedNoticeProvider` é montado UMA vez em AppShell.js (toda tela autenticada já
// passa por ali), e qualquer componente descendente chama `useSavedNotice()` pra disparar o modal.
const SavedNoticeContext = createContext(null);

export function SavedNoticeProvider({ children }) {
  const [message, setMessage] = useState(null);

  const notifySaved = useCallback((msg) => {
    setMessage(msg || "Alterações salvas com sucesso.");
  }, []);

  return (
    <SavedNoticeContext.Provider value={notifySaved}>
      {children}
      {message && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/70 p-6" onClick={() => setMessage(null)}>
          <div className="card max-w-xs w-full animate-bounce-in text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={26} />
            </div>
            <p className="font-bold text-navy text-sm">{message}</p>
            <button type="button" className="btn w-full mt-4" onClick={() => setMessage(null)}>OK</button>
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

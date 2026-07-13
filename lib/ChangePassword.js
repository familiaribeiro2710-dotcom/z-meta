"use client";
import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function ChangePassword({ force = false, onDone }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    if (pw.length < 6) {
      setMsg("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    setMsg("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setLoading(false);
      setMsg("Não foi possível alterar a senha.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
    }
    setLoading(false);
    setPw("");
    if (force) {
      onDone && onDone();
      return;
    }
    setMsg("Senha alterada com sucesso.");
    setOpen(false);
  }

  if (force) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-sm w-full animate-pop">
          <p className="label mb-1">🔒 Defina sua nova senha</p>
          <p className="text-xs text-muted mb-4">
            Por segurança, troque a senha temporária antes de continuar.
          </p>
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <input
              type="password"
              className="input"
              placeholder="nova senha (mín. 6 caracteres)"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "Salvando…" : "Salvar e continuar"}
            </button>
          </form>
          {msg && <p className="text-xs text-danger mt-2">{msg}</p>}
        </div>
      </main>
    );
  }

  return (
    <div className="mt-8 border-t border-line pt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs uppercase tracking-wider text-muted hover:text-ink transition-colors"
      >
        {open ? "Fechar" : "Alterar senha"}
      </button>
      {open && (
        <form onSubmit={handleSave} className="mt-3 flex flex-col sm:flex-row gap-2 max-w-sm">
          <input
            type="password"
            className="input"
            placeholder="nova senha"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
          <button type="submit" className="btn-outline whitespace-nowrap" disabled={loading}>
            {loading ? "Salvando…" : "Salvar"}
          </button>
        </form>
      )}
      {msg && <p className="text-xs text-muted mt-2">{msg}</p>}
    </div>
  );
}

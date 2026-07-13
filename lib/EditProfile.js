"use client";
import { useState } from "react";
import { User, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "./supabaseClient";
import ChangePassword from "./ChangePassword";

export default function EditProfile({ userId, currentName, currentUsername, onNameChange, onClose }) {
  const [name, setName] = useState(currentName || "");
  const [username, setUsername] = useState(currentUsername || "");
  const [saving, setSaving] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [msg, setMsg] = useState("");
  const [usernameMsg, setUsernameMsg] = useState("");

  async function saveName(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setMsg("");
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", userId);
    setSaving(false);
    if (error) {
      setMsg("Erro: " + error.message);
      return;
    }
    setMsg("Nome atualizado.");
    onNameChange && onNameChange(name.trim());
  }

  async function saveUsername(e) {
    e.preventDefault();
    if (!username.trim()) return;
    setSavingUsername(true);
    setUsernameMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/account/update-username", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ newUsername: username.trim() }),
    });
    const json = await res.json();
    setSavingUsername(false);
    if (!res.ok) {
      setUsernameMsg("Erro: " + (json.error || "não foi possível salvar."));
      return;
    }
    setUsername(json.username);
    setUsernameMsg("Usuário atualizado. Use o novo usuário no próximo login.");
  }

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-40 w-80 card animate-pop border-purple/20">
        <div className="flex items-center justify-between mb-3">
          <p className="label mb-0 flex items-center gap-1.5"><User size={14} /> Meu perfil</p>
          <button onClick={onClose} className="text-muted hover:text-navy transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={saveName} className="flex flex-col gap-2">
          <label className="label">Nome completo</label>
          <div className="flex items-center gap-2">
            <input className="input !py-1.5 !text-sm flex-1" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
        {msg && (
          <p className="text-[11px] text-muted mt-2 flex items-center gap-1.5">
            {msg.startsWith("Erro") ? <AlertTriangle size={12} className="text-danger" /> : <CheckCircle2 size={12} className="text-success" />}
            {msg}
          </p>
        )}

        <form onSubmit={saveUsername} className="flex flex-col gap-2 mt-3 pt-3 border-t border-line">
          <label className="label">Usuário de login</label>
          <div className="flex items-center gap-2">
            <input
              className="input !py-1.5 !text-sm flex-1"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <button type="submit" className="btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap" disabled={savingUsername}>
              {savingUsername ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
        {usernameMsg && (
          <p className="text-[11px] text-muted mt-2 flex items-center gap-1.5">
            {usernameMsg.startsWith("Erro") ? <AlertTriangle size={12} className="text-danger" /> : <CheckCircle2 size={12} className="text-success" />}
            {usernameMsg}
          </p>
        )}

        <ChangePassword />
      </div>
    </>
  );
}

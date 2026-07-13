"use client";
import { useState } from "react";
import { User, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "./supabaseClient";
import ChangePassword from "./ChangePassword";

export default function EditProfile({ userId, currentName, onNameChange, onClose }) {
  const [name, setName] = useState(currentName || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

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

        <ChangePassword />
      </div>
    </>
  );
}

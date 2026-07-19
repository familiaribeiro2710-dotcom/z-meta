"use client";
import { useRef, useState } from "react";
import { User, X, CheckCircle2, AlertTriangle, Camera, Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import ChangePassword from "./ChangePassword";
import { useSavedNotice } from "./SavedNotice";

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export default function EditProfile({ userId, currentName, currentUsername, currentAvatarUrl, onNameChange, onAvatarChange, onClose }) {
  const notifySaved = useSavedNotice();
  const [name, setName] = useState(currentName || "");
  const [username, setUsername] = useState(currentUsername || "");
  const [saving, setSaving] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [msg, setMsg] = useState("");
  const [usernameMsg, setUsernameMsg] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState("");
  const fileInputRef = useRef(null);

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarMsg("Erro: selecione um arquivo de imagem.");
      return;
    }
    setUploadingAvatar(true);
    setAvatarMsg("");
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${userId}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingAvatar(false);
      setAvatarMsg("Erro: " + upErr.message);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
    setUploadingAvatar(false);
    if (dbErr) {
      setAvatarMsg("Erro: " + dbErr.message);
      return;
    }
    setAvatarUrl(url);
    onAvatarChange && onAvatarChange(url);
    setAvatarMsg("Foto atualizada.");
  }

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
    notifySaved("Nome atualizado com sucesso.");
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
    notifySaved("Usuário de login atualizado. Use o novo usuário no próximo login.");
  }

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-40 w-80 max-w-[calc(100vw-1.5rem)] max-h-[80vh] overflow-y-auto card animate-pop border-purple/20">
        <div className="flex items-center justify-between mb-3">
          <p className="label mb-0 flex items-center gap-1.5"><User size={14} /> Meu perfil</p>
          <button onClick={onClose} className="text-muted hover:text-navy transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-line">
          <div
            className="relative w-14 h-14 rounded-full shrink-0 overflow-hidden cursor-pointer group border-2 border-purple/20"
            onClick={() => fileInputRef.current?.click()}
            title="Alterar foto de perfil"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white font-bold text-base"
                style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
              >
                {initials(name)}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-navy/0 group-hover:bg-navy/50 opacity-0 group-hover:opacity-100 transition-all">
              <Camera size={16} className="text-white" />
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 bg-navy/60 flex items-center justify-center">
                <Loader2 size={16} className="text-white animate-spin" />
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
          </div>
          <div>
            <p className="text-xs font-semibold text-navy">Foto de perfil</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] uppercase tracking-wider font-bold text-purple hover:text-pink transition-colors"
            >
              Clique pra alterar
            </button>
            {avatarMsg && (
              <p className="text-[11px] text-muted mt-1 flex items-center gap-1.5">
                {avatarMsg.startsWith("Erro") ? <AlertTriangle size={11} className="text-danger" /> : <CheckCircle2 size={11} className="text-success" />}
                {avatarMsg}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={saveName} className="flex flex-col gap-2">
          <label className="label">Nome completo</label>
          <div className="flex items-center gap-2 flex-wrap">
            <input className="input !py-1.5 !text-sm flex-1 min-w-[140px]" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0" disabled={saving}>
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
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="input !py-1.5 !text-sm flex-1 min-w-[140px]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <button type="submit" className="btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0" disabled={savingUsername}>
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

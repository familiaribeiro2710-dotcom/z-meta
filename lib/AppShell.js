"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Sun, Moon, SunMoon } from "lucide-react";
import { supabase } from "./supabaseClient";
import Logo from "./Logo";
import EditProfile from "./EditProfile";
import NotificationBell from "./PushNotifications";
import { SavedNoticeProvider } from "./SavedNotice";
import { useThemeToggle } from "./ThemeContext";

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// 2026-09-26 (pedido do Felipe, mockup MOCKUP_TEMA_AUTOMATICO.html, opção A): o ícone de tema
// deixou de ser um toggle claro/escuro e passou a abrir um popover com 3 opções — Claro, Escuro e
// Automático (segue o tema do aparelho, ver lib/ThemeContext.js). O popover é ancorado na borda
// direita do CONTAINER do header (não no botão), com largura limitada a 100vw-1.5rem: no celular o
// botão fica no meio da barra (sino/avatar/Sair à direita) e um popover alinhado a ele vazaria pela
// esquerda da tela em aparelhos estreitos (320–375px).
const THEME_OPTIONS = [
  { key: "light", label: "Claro", Icon: Sun },
  { key: "dark", label: "Escuro", Icon: Moon },
  { key: "system", label: "Automático", Icon: SunMoon },
];

export default function AppShell({ userName, userId, userUsername, userAvatarUrl, onNameChange, onAvatarChange, tabs, activeTab, onTabChange, children }) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const { theme, preference, setPreference } = useThemeToggle(userId);
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef(null);
  const themePopRef = useRef(null);
  const CurrentThemeIcon = (THEME_OPTIONS.find((o) => o.key === preference) || THEME_OPTIONS[2]).Icon;

  useEffect(() => {
    if (!themeOpen) return;
    function onDown(e) {
      if (themePopRef.current?.contains(e.target) || themeBtnRef.current?.contains(e.target)) return;
      setThemeOpen(false);
    }
    function onKey(e) { if (e.key === "Escape") setThemeOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [themeOpen]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <SavedNoticeProvider>
    <div className="min-h-screen">
      <header className="relative border-b-2 border-line bg-surface/90 backdrop-blur sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="relative max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <Logo size="sm" />
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              ref={themeBtnRef}
              onClick={() => setThemeOpen((v) => !v)}
              className={`p-1.5 rounded-full border transition-colors shrink-0 ${themeOpen ? "border-gold text-gold" : "border-line text-muted hover:border-gold hover:text-gold"}`}
              title="Aparência"
              aria-label="Aparência"
              aria-haspopup="true"
              aria-expanded={themeOpen}
            >
              <CurrentThemeIcon size={16} />
            </button>
            <NotificationBell userId={userId} />
            <div className="relative shrink-0">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title="Meu perfil"
              >
                {userAvatarUrl ? (
                  <img
                    src={userAvatarUrl}
                    alt={userName}
                    className="w-8 h-8 rounded-full object-cover shrink-0 border border-line"
                  />
                ) : (
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
                  >
                    {initials(userName)}
                  </div>
                )}
                <span className="text-xs text-muted hidden sm:inline font-medium max-w-[140px] truncate">{userName}</span>
              </button>
              {profileOpen && userId && (
                <EditProfile
                  userId={userId}
                  currentName={userName}
                  currentUsername={userUsername}
                  currentAvatarUrl={userAvatarUrl}
                  onNameChange={(name) => { onNameChange && onNameChange(name); }}
                  onAvatarChange={(url) => { onAvatarChange && onAvatarChange(url); }}
                  onClose={() => setProfileOpen(false)}
                />
              )}
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 text-[11px] sm:text-xs uppercase tracking-wider font-bold text-muted hover:text-pink transition-colors shrink-0 whitespace-nowrap"
            >
              <LogOut size={14} /> Sair
            </button>
          </div>
          {themeOpen && (
            <div
              ref={themePopRef}
              role="menu"
              className="absolute right-3 sm:right-4 top-full mt-1 z-30 w-[min(17rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-surface shadow-xl p-2.5 animate-fadeUp"
            >
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted px-1 pb-2">Aparência</p>
              <div className="grid grid-cols-3 gap-1.5">
                {THEME_OPTIONS.map(({ key, label, Icon }) => {
                  const selected = preference === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => { setPreference(key); setThemeOpen(false); }}
                      className={`min-w-0 flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2.5 text-[11px] font-bold transition-colors ${
                        selected ? "border-gold bg-gold/10 text-navy" : "border-line text-muted hover:text-navy hover:border-gold/50"
                      }`}
                    >
                      <Icon size={18} className="shrink-0" />
                      <span className="truncate max-w-full">{label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-muted px-1 pt-2 leading-snug">
                {preference === "system"
                  ? `Seguindo o aparelho (agora: ${theme === "dark" ? "escuro" : "claro"}).`
                  : "Fixo, independente do tema do aparelho."}
              </p>
            </div>
          )}
        </div>
        {/* 2026-08-09 (pedido do Felipe): abas com hideOnMobile (hoje só Pipeline) usam largura>=1024px
            E orientação paisagem juntos (`lg:landscape:`), não só largura. Isso faz o iPad se comportar
            como retrato=mobile / paisagem=desktop (retrato do iPad maior chega a ~834px, sempre <1024;
            paisagem começa em ~1024px) — sem essa combinação, um iPad em pé com largura >=768 já
            aparecia com a aba mesmo devendo se comportar como mobile. Efeito colateral aceito: uma
            janela de navegador desktop redimensionada abaixo de 1024px de largura volta a esconder a
            aba (era 768px antes disso) — troca deliberada, aprovada pelo Felipe. */}
        {tabs && (
          <nav className="max-w-5xl mx-auto px-2 sm:px-4 flex gap-0.5 sm:gap-6 -mb-px overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                className={`${t.hideOnMobile ? "hidden lg:landscape:flex" : "flex-1 sm:flex-none flex"} min-w-[62px] sm:min-w-0 shrink-0 flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-2 sm:py-3 text-[9px] sm:text-sm font-bold tracking-wide border-b-[3px] transition-all ${
                  activeTab === t.key
                    ? "border-transparent text-navy sm:scale-105"
                    : "border-transparent text-muted hover:text-navy"
                }`}
                style={
                  activeTab === t.key
                    ? { borderImage: "linear-gradient(90deg, #7c3aed, #ec4899) 1", borderBottomWidth: 3, borderBottomStyle: "solid" }
                    : undefined
                }
              >
                {t.Icon && <t.Icon size={14} className="shrink-0 sm:w-4 sm:h-4" />}
                <span className="truncate max-w-full leading-tight">{t.label}</span>
              </button>
            ))}
          </nav>
        )}
      </header>
      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-6 animate-fadeUp overflow-x-hidden">{children}</main>
    </div>
    </SavedNoticeProvider>
  );
}

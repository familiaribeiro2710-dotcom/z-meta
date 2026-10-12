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

  // 2026-10-12 — redesign (mockup MOCKUP_REDESIGN.html, aprovado pelo Felipe). A navegação muda
  // por aparelho, mesmas abas em todos:
  // - celular (< md): barra inferior fixa, ao alcance do polegar (rola na horizontal se tiver
  //   muita aba); abas com hideOnMobile (Pipeline) não aparecem nela.
  // - iPad em pé / janela média (md, sem ser lg paisagem): trilho lateral só com ícone + rótulo
  //   curto; hideOnMobile continua escondida (mesma régua de antes: iPad em pé = mobile).
  // - desktop / iPad deitado (lg:landscape): menu lateral completo com logo e "Sair".
  // O cabeçalho do topo fica só com aparência / sino / perfil (e o título da aba no md+).
  const activeLabel = tabs?.find((t) => t.key === activeTab)?.label;
  return (
    <SavedNoticeProvider>
    <div className="min-h-screen">
      {tabs && (
        <aside className="hidden md:flex fixed inset-y-0 left-0 z-20 w-20 lg:landscape:w-60 flex-col bg-surface border-r border-line pt-[env(safe-area-inset-top)]">
          <div className="h-16 shrink-0 flex items-center justify-center lg:landscape:justify-start lg:landscape:px-5">
            <span className="lg:landscape:hidden"><Logo size="sm" compact /></span>
            <span className="hidden lg:landscape:block"><Logo size="sm" /></span>
          </div>
          <nav className="flex-1 overflow-y-auto scrollbar-hide px-2 lg:landscape:px-3 py-2 flex flex-col gap-1">
            {tabs.map((t) => {
              const on = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => onTabChange(t.key)}
                  aria-current={on ? "page" : undefined}
                  className={`${t.hideOnMobile ? "hidden lg:landscape:flex" : "flex"} flex-col lg:landscape:flex-row items-center gap-1 lg:landscape:gap-3 rounded-xl px-1 py-2.5 lg:landscape:px-3 text-[10.5px] lg:landscape:text-sm transition-colors ${
                    on ? "bg-goldsoft text-navy font-extrabold" : "text-muted font-semibold hover:bg-paper hover:text-navy"
                  }`}
                >
                  {t.Icon && <t.Icon size={19} className={`shrink-0 ${on ? "text-gold" : ""}`} />}
                  <span className="truncate max-w-full leading-tight">{t.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="shrink-0 p-2 lg:landscape:p-3 border-t border-line">
            <button
              onClick={handleSignOut}
              className="w-full flex flex-col lg:landscape:flex-row items-center gap-1 lg:landscape:gap-3 rounded-xl px-1 py-2.5 lg:landscape:px-3 text-[10.5px] lg:landscape:text-sm font-semibold text-muted hover:bg-paper hover:text-danger transition-colors"
            >
              <LogOut size={18} className="shrink-0" /> Sair
            </button>
          </div>
        </aside>
      )}

      <div className={tabs ? "md:pl-20 lg:landscape:pl-60" : ""}>
        <header className="sticky top-0 z-10 bg-paper/85 backdrop-blur border-b border-line pt-[env(safe-area-inset-top)]">
          <div className="relative max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
            <div className={`min-w-0 ${tabs ? "md:hidden" : ""}`}><Logo size="sm" /></div>
            {tabs && <p className="hidden md:block text-lg font-extrabold tracking-tight text-navy truncate">{activeLabel}</p>}
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
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-goldsoft text-goldtext text-xs font-extrabold shrink-0">
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
              className={`${tabs ? "md:hidden" : ""} flex items-center gap-1 text-[11px] sm:text-xs font-bold text-muted hover:text-danger transition-colors shrink-0 whitespace-nowrap`}
              aria-label="Sair"
            >
              <LogOut size={15} /> <span className="hidden sm:inline">Sair</span>
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
        </header>
        <main className={`max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-6 animate-fadeUp overflow-x-hidden ${tabs ? "pb-28 md:pb-8" : ""}`}>{children}</main>
      </div>

      {tabs && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
          <div className="flex overflow-x-auto scrollbar-hide px-1">
            {tabs.filter((t) => !t.hideOnMobile).map((t) => {
              const on = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => onTabChange(t.key)}
                  aria-current={on ? "page" : undefined}
                  className={`flex-1 min-w-[64px] flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-[10.5px] font-bold transition-colors ${on ? "text-navy" : "text-muted"}`}
                >
                  {t.Icon && <t.Icon size={20} className={`shrink-0 ${on ? "text-gold" : ""}`} />}
                  <span className="truncate max-w-full leading-tight">{t.label}</span>
                  <span className={`w-1 h-1 rounded-full ${on ? "bg-gold" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
    </SavedNoticeProvider>
  );
}

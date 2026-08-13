"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "./supabaseClient";
import Logo from "./Logo";
import EditProfile from "./EditProfile";
import NotificationBell from "./PushNotifications";
import { SavedNoticeProvider } from "./SavedNotice";

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export default function AppShell({ userName, userId, userUsername, userAvatarUrl, onNameChange, onAvatarChange, tabs, activeTab, onTabChange, children }) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <SavedNoticeProvider>
    <div className="min-h-screen">
      <header className="relative border-b border-line bg-white/90 backdrop-blur sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <Logo size="sm" />
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
        </div>
        {/* 2026-08-09 (pedido do Felipe): abas com hideOnMobile (hoje só Pipeline) usam largura>=1024px
            E orientação paisagem juntos (`lg:landscape:`), não só largura. Isso faz o iPad se comportar
            como retrato=mobile / paisagem=desktop (retrato do iPad maior chega a ~834px, sempre <1024;
            paisagem começa em ~1024px) — sem essa combinação, um iPad em pé com largura >=768 já
            aparecia com a aba mesmo devendo se comportar como mobile. Efeito colateral aceito: uma
            janela de navegador desktop redimensionada abaixo de 1024px de largura volta a esconder a
            aba (era 768px antes disso) — troca deliberada, aprovada pelo Felipe. */}
        {/* 2026-08-12 (pedido do Felipe: "app inteiro com o mesmo padrão visual", conceito de
            sidebar aprovado por mockup): essa barra de abas horizontal continua sendo a navegação
            em mobile/tablet-retrato, sem NENHUMA mudança de lógica — só ganhou `lg:hidden` porque
            em telas grandes (lg+, qualquer orientação) a navegação passa a viver na sidebar vertical
            logo abaixo. A regra hideOnMobile de cada aba (Pipeline só lg+paisagem) e a cor
            roxo→rosa do indicador ativo (já aprovada antes, não mexer) são idênticas às de sempre. */}
        {tabs && (
          <nav className="lg:hidden max-w-5xl mx-auto px-2 sm:px-4 flex gap-0.5 sm:gap-6 -mb-px overflow-x-auto">
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
      <div className="lg:flex lg:items-start lg:max-w-6xl lg:mx-auto lg:gap-2 lg:px-4">
        {/* Sidebar — só telas lg+. Não toca no header/Logo/avatar/sair, que continuam exatamente
            como estão acima; aqui só vive a navegação por abas, num rail vertical fixo em vez da
            barra horizontal (essa é a mudança estrutural aprovada no mockup pra dar "cara de app
            de verdade" no desktop). */}
        {tabs && (
          <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 lg:sticky lg:top-[65px] lg:py-6 lg:pr-2 gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                className={`${t.hideOnMobile ? "hidden lg:landscape:flex" : "flex"} items-center gap-3 pl-3.5 pr-3 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all border-l-[3px] border-transparent ${
                  activeTab === t.key ? "bg-paper text-navy" : "text-muted hover:bg-paper/60 hover:text-navy"
                }`}
                style={
                  activeTab === t.key
                    ? { borderImage: "linear-gradient(180deg, #7c3aed, #ec4899) 1", borderLeftWidth: 3, borderLeftStyle: "solid" }
                    : undefined
                }
              >
                {t.Icon && <t.Icon size={16} className="shrink-0" />}
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </aside>
        )}
        <main className="flex-1 min-w-0 max-w-5xl mx-auto lg:max-w-none lg:mx-0 px-3 sm:px-4 py-5 sm:py-6 animate-fadeUp overflow-x-hidden">{children}</main>
      </div>
    </div>
    </SavedNoticeProvider>
  );
}

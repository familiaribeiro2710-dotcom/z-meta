"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "./supabaseClient";
import Logo from "./Logo";
import EditProfile from "./EditProfile";

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
    <div className="min-h-screen">
      <header className="relative border-b-2 border-line bg-white/90 backdrop-blur sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <Logo size="sm" />
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
        {tabs && (
          <nav className="max-w-5xl mx-auto px-3 sm:px-4 flex gap-2 sm:gap-6 -mb-px overflow-x-auto scrollbar-hide">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                className={`flex items-center gap-1 sm:gap-1.5 py-2.5 sm:py-3 text-[10px] sm:text-sm font-bold tracking-wide border-b-[3px] transition-all shrink-0 whitespace-nowrap ${
                  activeTab === t.key
                    ? "border-transparent text-navy scale-105"
                    : "border-transparent text-muted hover:text-navy"
                }`}
                style={
                  activeTab === t.key
                    ? { borderImage: "linear-gradient(90deg, #7c3aed, #ec4899) 1", borderBottomWidth: 3, borderBottomStyle: "solid" }
                    : undefined
                }
              >
                {t.Icon && <t.Icon size={13} className="shrink-0 sm:w-4 sm:h-4" />} {t.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-6 animate-fadeUp overflow-x-hidden">{children}</main>
    </div>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";
import Logo from "./Logo";

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export default function AppShell({ userName, tabs, activeTab, onTabChange, children }) {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-line bg-white/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-3">
            <div
              className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0"
              style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
              title={userName}
            >
              {initials(userName)}
            </div>
            <span className="text-xs text-muted hidden sm:inline font-medium">👋 {userName}</span>
            <button
              onClick={handleSignOut}
              className="text-xs uppercase tracking-wider font-bold text-muted hover:text-pink transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
        {tabs && (
          <nav className="max-w-5xl mx-auto px-4 flex gap-6 -mb-px">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                className={`py-3 text-sm font-bold tracking-wide border-b-[3px] transition-all ${
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
                {t.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6 animate-fadeUp">{children}</main>
    </div>
  );
}

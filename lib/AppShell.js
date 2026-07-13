"use client";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";
import Logo from "./Logo";

export default function AppShell({ userName, tabs, activeTab, onTabChange, children }) {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted hidden sm:inline">👋 {userName}</span>
            <button onClick={handleSignOut} className="text-xs uppercase tracking-wider text-muted hover:text-navy transition-colors">
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
                className={`py-3 text-sm font-medium tracking-wide border-b-[3px] transition-colors ${
                  activeTab === t.key
                    ? "border-gold text-navy"
                    : "border-transparent text-muted hover:text-navy"
                }`}
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

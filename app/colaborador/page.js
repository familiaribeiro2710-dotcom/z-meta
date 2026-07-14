"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Wallet, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import ColaboradorView from "../../lib/ColaboradorView";

const TABS = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "metas", label: "Metas", Icon: Wallet },
];

export default function ColaboradorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("atividades");
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== "colaborador") {
        router.replace(
          prof?.role === "master_admin"
            ? "/admin"
            : prof?.role === "gerente"
              ? "/gerente"
              : prof?.role === "socio"
                ? "/socio"
                : prof?.role === "supervisor"
                  ? "/supervisor"
                  : "/login"
        );
        return;
      }
      if (!active) return;
      setProfile(prof);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-muted gap-2">
        <Loader2 size={16} className="animate-spin" /> carregando…
      </div>
    );
  }

  if (profile.must_change_password) {
    return (
      <ChangePassword
        force
        onDone={() => setProfile((p) => ({ ...p, must_change_password: false }))}
      />
    );
  }

  return (
    <AppShell
      userName={profile.full_name}
      userId={profile.id}
      userUsername={profile.username}
      onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      <ColaboradorView key={profile.id} profile={profile} tab={tab} />
    </AppShell>
  );
}

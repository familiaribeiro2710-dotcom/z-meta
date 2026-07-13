"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import EmpresaDashboard from "../../lib/EmpresaDashboard";
import { greeting } from "../../lib/date";

export default function GestorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const greet = greeting();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== "gestor") { router.replace(prof?.role === "master_admin" ? "/admin" : "/colaborador"); return; }
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
    return <ChangePassword force onDone={() => setProfile({ ...profile, must_change_password: false })} />;
  }

  return (
    <AppShell userName={profile.full_name}>
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-navy flex items-center gap-2">
          <greet.Icon size={20} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
        </h1>
        <EmpresaDashboard empresaId={profile.empresa_id} />
        <ChangePassword />
      </div>
    </AppShell>
  );
}

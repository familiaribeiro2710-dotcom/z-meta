"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import Logo from "../lib/Logo";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      if (!active) return;
      if (!profile) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }
      if (profile.role === "master_admin") {
        router.replace("/admin");
      } else if (profile.role === "gerente") {
        router.replace("/gerente");
      } else {
        router.replace("/colaborador");
      }
    })();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Logo size="lg" />
        <p className="text-xs text-muted tracking-wide">carregando…</p>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Store, Users, Trophy } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import EmpresaDashboard from "../../lib/EmpresaDashboard";
import { greeting, todayStr, firstDayOfMonth } from "../../lib/date";

export default function GerentePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [lojaName, setLojaName] = useState("");
  const [colabCount, setColabCount] = useState(0);
  const [teamPct, setTeamPct] = useState(0);
  const greet = greeting();
  const month = firstDayOfMonth(todayStr());

  const loadStats = useCallback(async (prof) => {
    const { data: loja } = await supabase.from("lojas").select("name").eq("id", prof.loja_id).single();
    setLojaName(loja?.name || "");
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("loja_id", prof.loja_id)
      .eq("role", "colaborador");
    setColabCount(count || 0);
    const { data: pct } = await supabase.rpc("get_team_progress", { p_month: month, p_loja: prof.loja_id });
    setTeamPct(Number(pct) || 0);
  }, [month]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== "gerente") {
        router.replace(
          prof?.role === "master_admin" ? "/admin" : prof?.role === "socio" ? "/socio" : prof?.role === "supervisor" ? "/supervisor" : "/colaborador"
        );
        return;
      }
      if (!active) return;
      setProfile(prof);
      if (!prof.must_change_password) await loadStats(prof);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router, loadStats]);

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
    <AppShell
      userName={profile.full_name}
      userId={profile.id}
      userUsername={profile.username}
      onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))}
    >
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-navy flex items-center gap-2">
          <greet.Icon size={20} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
        </h1>

        <div
          className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
          style={{ background: "linear-gradient(135deg, #16a34a 0%, #4ade80 100%)", boxShadow: "0 10px 28px rgba(22,163,74,0.35)" }}
        >
          <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-2 mb-5">
            <Store size={18} className="text-white" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">Gerente · {lojaName || "sua loja"}</span>
          </div>
          <div className="relative grid grid-cols-2 gap-4">
            <div>
              <Users size={20} className="text-white" />
              <p className="text-3xl font-extrabold mt-2 text-white">{colabCount}</p>
              <p className="text-xs font-semibold mt-0.5 text-white">Colaboradores</p>
            </div>
            <div className="sm:border-l sm:border-white/25 sm:pl-4">
              <Trophy size={20} className="text-white" />
              <p className="text-3xl font-extrabold mt-2 text-white">{teamPct.toFixed(0)}%</p>
              <p className="text-xs font-semibold mt-0.5 text-white">Barra da equipe (mês)</p>
            </div>
          </div>
        </div>

        <EmpresaDashboard lojaId={profile.loja_id} empresaId={profile.empresa_id} />
      </div>
    </AppShell>
  );
}

"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2, Store, Users, Trophy, Eye, ShieldCheck } from "lucide-react";
import { supabase } from "./supabaseClient";
import AppShell from "./AppShell";
import ChangePassword from "./ChangePassword";
import EmpresaDashboard from "./EmpresaDashboard";
import { greeting, todayStr, firstDayOfMonth } from "./date";

const ROLE_CONFIG = {
  socio: {
    label: "Sócio",
    path: "/socio",
    gradient: "linear-gradient(135deg, #9ca3af 0%, #e5e7eb 100%)",
    shadow: "rgba(148,163,184,0.45)",
    textTone: "text-navy",
  },
  supervisor: {
    label: "Supervisor",
    path: "/supervisor",
    gradient: "linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)",
    shadow: "rgba(37,99,235,0.35)",
    textTone: "text-white",
  },
};

function redirectFor(role) {
  if (role === "master_admin") return "/admin";
  if (role === "gerente") return "/gerente";
  if (role === "socio") return "/socio";
  if (role === "supervisor") return "/supervisor";
  return "/colaborador";
}

export default function HierarchyHome({ role }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [lojas, setLojas] = useState([]);
  const [selectedLoja, setSelectedLoja] = useState(null);
  const greet = greeting();
  const month = firstDayOfMonth(todayStr());
  const cfg = ROLE_CONFIG[role];

  const loadStats = useCallback(async (prof) => {
    const { data: access } = await supabase.from("loja_access").select("loja_id, permission").eq("profile_id", prof.id);
    const lojaIds = (access || []).map((a) => a.loja_id);
    if (lojaIds.length === 0) { setLojas([]); return; }
    const { data: lojaRows } = await supabase.from("lojas").select("id, name").in("id", lojaIds);
    const { data: gerentes } = await supabase.from("profiles").select("id, full_name, loja_id").in("loja_id", lojaIds).eq("role", "gerente");
    const { data: colabs } = await supabase.from("profiles").select("id, loja_id").in("loja_id", lojaIds).eq("role", "colaborador");
    const enriched = await Promise.all(
      (lojaRows || []).map(async (l) => {
        const { data: pct } = await supabase.rpc("get_team_progress", { p_month: month, p_loja: l.id });
        const acc = (access || []).find((a) => a.loja_id === l.id);
        const gerente = (gerentes || []).find((g) => g.loja_id === l.id);
        const colabCount = (colabs || []).filter((c) => c.loja_id === l.id).length;
        return {
          loja_id: l.id,
          loja_name: l.name,
          permission: acc?.permission || "ver",
          gerente_name: gerente?.full_name || null,
          colab_count: colabCount,
          team_pct: Number(pct) || 0,
        };
      })
    );
    setLojas(enriched);
  }, [month]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== role) { router.replace(redirectFor(prof?.role)); return; }
      if (!active) return;
      setProfile(prof);
      if (!prof.must_change_password) await loadStats(prof);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router, loadStats, role]);

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

  if (selectedLoja) {
    return (
      <AppShell
        userName={profile.full_name}
        userId={profile.id}
        userUsername={profile.username}
        onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="text-xl font-bold text-navy flex items-center gap-2"><Store size={20} className="text-purple" /> {selectedLoja.loja_name}</h1>
            <button className="btn-outline whitespace-nowrap" onClick={() => setSelectedLoja(null)}>← Voltar</button>
          </div>
          <EmpresaDashboard lojaId={selectedLoja.loja_id} empresaId={profile.empresa_id} />
        </div>
      </AppShell>
    );
  }

  const totalColab = lojas.reduce((s, l) => s + l.colab_count, 0);
  const avgPct = lojas.length ? lojas.reduce((s, l) => s + l.team_pct, 0) / lojas.length : 0;

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
          style={{ background: cfg.gradient, boxShadow: `0 10px 28px ${cfg.shadow}` }}
        >
          <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/15" />
          <div className={`relative flex items-center gap-2 mb-5 ${cfg.textTone}`}>
            <ShieldCheck size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">{cfg.label} · {lojas.length} loja{lojas.length !== 1 ? "s" : ""}</span>
          </div>
          <div className={`relative grid grid-cols-3 gap-4 ${cfg.textTone}`}>
            <div>
              <Store size={20} />
              <p className="text-3xl font-extrabold mt-2">{lojas.length}</p>
              <p className="text-xs font-semibold mt-0.5">Lojas</p>
            </div>
            <div className="border-l border-current/20 pl-4">
              <Users size={20} />
              <p className="text-3xl font-extrabold mt-2">{totalColab}</p>
              <p className="text-xs font-semibold mt-0.5">Colaboradores</p>
            </div>
            <div className="border-l border-current/20 pl-4">
              <Trophy size={20} />
              <p className="text-3xl font-extrabold mt-2">{avgPct.toFixed(0)}%</p>
              <p className="text-xs font-semibold mt-0.5">Barra média</p>
            </div>
          </div>
        </div>

        <div className="card">
          <p className="label mb-3 flex items-center gap-1.5"><Building2 size={14} /> Suas lojas</p>
          <div className="space-y-2">
            {lojas.map((l) => (
              <div key={l.loja_id} className="border border-line rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-navy flex items-center gap-1.5"><Store size={13} className="text-teal" /> {l.loja_name}</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {l.gerente_name ? `gerente: ${l.gerente_name}` : "sem gerente"} · {l.colab_count} colaborador(es) · barra: {l.team_pct.toFixed(0)}%
                  </p>
                </div>
                {l.permission === "gerenciar" ? (
                  <button
                    className="inline-flex items-center gap-1.5 text-white rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap shadow-pop active:scale-95 hover:brightness-110 transition-all"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
                    onClick={() => setSelectedLoja(l)}
                  >
                    <Eye size={12} /> Ver dados
                  </button>
                ) : (
                  <span className="badge bg-line text-muted">apenas visualização</span>
                )}
              </div>
            ))}
            {lojas.length === 0 && <p className="text-sm text-muted">Nenhuma loja atribuída a você ainda. Fale com o Master Admin.</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

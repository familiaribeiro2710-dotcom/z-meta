"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2, Store, Users, Trophy, Eye, ShieldCheck, AlertTriangle } from "lucide-react";
import { supabase } from "./supabaseClient";
import AppShell from "./AppShell";
import ChangePassword from "./ChangePassword";
import EmpresaDashboard from "./EmpresaDashboard";
import ProgressBar from "./ProgressBar";
import { calcIndividualPct, calcTeamPct } from "./scoring";
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
  const [scoreboard, setScoreboard] = useState([]);
  const [selectedLoja, setSelectedLoja] = useState(null);
  const greet = greeting();
  const month = firstDayOfMonth(todayStr());
  const cfg = ROLE_CONFIG[role];

  const loadStats = useCallback(async (prof) => {
    const { data: access } = await supabase.from("loja_access").select("loja_id, permission").eq("profile_id", prof.id);
    const lojaIds = (access || []).map((a) => a.loja_id);
    if (lojaIds.length === 0) { setLojas([]); setScoreboard([]); return; }

    const { data: lojaRows } = await supabase.from("lojas").select("id, name").in("id", lojaIds);
    const { data: gerentes } = await supabase.from("profiles").select("id, full_name, loja_id").in("loja_id", lojaIds).eq("role", "gerente");
    const { data: colabs } = await supabase
      .from("profiles")
      .select("id, full_name, loja_id, active")
      .in("loja_id", lojaIds)
      .eq("role", "colaborador")
      .order("full_name");
    const { data: settingsRows } = await supabase.from("app_settings").select("loja_id, warning_penalty_points").in("loja_id", lojaIds);

    const penaltyByLoja = {};
    (settingsRows || []).forEach((s) => { penaltyByLoja[s.loja_id] = s.warning_penalty_points ?? 10; });

    const nextMonth = new Date(month + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    const { data: completions } = await supabase
      .from("task_completions")
      .select("task_id, completed, completion_date, tasks!inner(employee_id, loja_id)")
      .in("tasks.loja_id", lojaIds)
      .gte("completion_date", month)
      .lt("completion_date", nextMonthStr);

    const { data: allWarnings } = await supabase
      .from("warnings")
      .select("employee_id, loja_id")
      .in("loja_id", lojaIds)
      .gte("warning_date", month)
      .lt("warning_date", nextMonthStr);

    const lojaNameById = {};
    (lojaRows || []).forEach((l) => { lojaNameById[l.id] = l.name; });

    const board = (colabs || [])
      .filter((emp) => emp.active !== false)
      .map((emp) => {
        const rows = (completions || []).filter((c) => c.tasks.employee_id === emp.id);
        const expected = rows.length;
        const completed = rows.filter((r) => r.completed).length;
        const wCount = (allWarnings || []).filter((w) => w.employee_id === emp.id).length;
        const penalty = penaltyByLoja[emp.loja_id] ?? 10;
        const pct = calcIndividualPct({ completed, expected, warningsCount: wCount, penaltyPerWarning: penalty });
        return { employee: emp, lojaName: lojaNameById[emp.loja_id] || "—", expected, completed, warnings: wCount, pct };
      });
    setScoreboard(board);

    const enriched = (lojaRows || []).map((l) => {
      const acc = (access || []).find((a) => a.loja_id === l.id);
      const gerente = (gerentes || []).find((g) => g.loja_id === l.id);
      const colabCount = (colabs || []).filter((c) => c.loja_id === l.id).length;
      const lojaBoard = board.filter((b) => b.employee.loja_id === l.id);
      return {
        loja_id: l.id,
        loja_name: l.name,
        permission: acc?.permission || "ver",
        gerente_name: gerente?.full_name || null,
        colab_count: colabCount,
        team_pct: calcTeamPct(lojaBoard.map((b) => b.pct)),
      };
    });
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
          <EmpresaDashboard lojaId={selectedLoja.loja_id} empresaId={profile.empresa_id} viewerRole={role} />
        </div>
      </AppShell>
    );
  }

  const totalColab = lojas.reduce((s, l) => s + l.colab_count, 0);
  const combinedPct = calcTeamPct(scoreboard.map((b) => b.pct));

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
            <span className="text-xs font-bold uppercase tracking-wider">{cfg.label} · todas as lojas juntas</span>
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
              <p className="text-3xl font-extrabold mt-2">{combinedPct.toFixed(0)}%</p>
              <p className="text-xs font-semibold mt-0.5">Barra combinada</p>
            </div>
          </div>
        </div>

        <div className="card">
          <p className="label mb-3 flex items-center gap-1.5"><Trophy size={14} /> Barra geral combinada — {lojas.length} loja{lojas.length !== 1 ? "s" : ""}</p>
          <ProgressBar pct={combinedPct} />
        </div>

        <div className="card overflow-x-auto">
          <p className="label mb-3 flex items-center gap-1.5"><Users size={14} /> Colaboradores — todas as lojas juntas ({scoreboard.length})</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-line">
                <th className="pb-2">Colaborador</th>
                <th className="pb-2">Loja</th>
                <th className="pb-2">Tarefas</th>
                <th className="pb-2">Advertências</th>
                <th className="pb-2 w-40">%</th>
              </tr>
            </thead>
            <tbody>
              {scoreboard.map((b) => (
                <tr key={b.employee.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 font-medium text-navy">{b.employee.full_name}</td>
                  <td className="py-2.5 text-muted flex items-center gap-1.5"><Store size={12} className="text-teal" /> {b.lojaName}</td>
                  <td className="py-2.5 text-muted">{b.completed}/{b.expected}</td>
                  <td className="py-2.5 text-muted">
                    {b.warnings > 0 ? <span className="flex items-center gap-1"><AlertTriangle size={13} className="text-warn" /> {b.warnings}</span> : "—"}
                  </td>
                  <td className="py-2.5"><ProgressBar pct={b.pct} showLabel={false} height="h-2.5" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {scoreboard.length === 0 && <p className="text-sm text-muted py-2">Nenhum colaborador nas lojas atribuídas a você ainda.</p>}
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

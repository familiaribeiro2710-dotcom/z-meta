"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import EmpresaDashboard from "../../lib/EmpresaDashboard";
import { greeting, todayStr, firstDayOfMonth, monthLabel } from "../../lib/date";

const PLANOS = [
  { value: "trial", label: "Trial" },
  { value: "pago", label: "Pago" },
  { value: "cancelado", label: "Cancelado" },
];

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  if (d.getFullYear() < 1980) return Infinity; // epoch = nunca teve atividade
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [overview, setOverview] = useState(null);
  const [health, setHealth] = useState([]);
  const [sortKey, setSortKey] = useState("risco");
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);

  const [empresaName, setEmpresaName] = useState("");
  const [gestorName, setGestorName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);

  const greet = greeting();
  const month = firstDayOfMonth(todayStr());

  const loadAll = useCallback(async () => {
    const { data: overviewRows } = await supabase.rpc("admin_overview");
    setOverview((overviewRows && overviewRows[0]) || null);
    const { data: healthRows } = await supabase.rpc("admin_empresas_health", { p_month: month });
    setHealth(healthRows || []);
  }, [month]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== "master_admin") { router.replace("/"); return; }
      if (!active) return;
      setProfile(prof);
      await loadAll();
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router, loadAll]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-empresa", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ empresaName, gestorName, password }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setMsg(`✅ Empresa criada! Login do gestor → usuário: ${json.username}`);
    setEmpresaName(""); setGestorName(""); setPassword("");
    await loadAll();
  }

  async function updatePlano(empresaId, plano) {
    await supabase.from("empresas").update({ plano }).eq("id", empresaId);
    await loadAll();
  }

  const sortedHealth = useMemo(() => {
    const rows = [...health];
    if (sortKey === "risco") {
      rows.sort((a, b) => daysSince(b.last_activity) - daysSince(a.last_activity));
    } else if (sortKey === "recente") {
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortKey === "nome") {
      rows.sort((a, b) => a.empresa_name.localeCompare(b.empresa_name));
    } else if (sortKey === "desempenho") {
      rows.sort((a, b) => Number(a.team_pct) - Number(b.team_pct));
    }
    return rows;
  }, [health, sortKey]);

  const growthBuckets = useMemo(() => {
    const buckets = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), count: 0 });
    }
    health.forEach((row) => {
      const key = String(row.created_at).slice(0, 7);
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.count += 1;
    });
    return buckets;
  }, [health]);

  const maxGrowth = Math.max(1, ...growthBuckets.map((b) => b.count));

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-xs text-muted">carregando… ⏳</div>;
  }

  if (profile.must_change_password) {
    return <ChangePassword force onDone={() => setProfile({ ...profile, must_change_password: false })} />;
  }

  if (selectedEmpresa) {
    return (
      <AppShell userName={profile.full_name}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-navy">🏢 {selectedEmpresa.name}</h1>
              <p className="text-xs text-muted mt-1">👑 Visualizando como Master Admin — dados completos desta empresa</p>
            </div>
            <button className="btn-outline whitespace-nowrap" onClick={() => setSelectedEmpresa(null)}>
              ← Voltar para empresas
            </button>
          </div>
          <EmpresaDashboard empresaId={selectedEmpresa.id} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell userName={profile.full_name}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-navy">{greet.emoji} {greet.word}, {profile.full_name.split(" ")[0]}!</h1>
          <p className="text-xs text-muted mt-1">👑 Master Admin — gestão de empresas clientes do Z Meta</p>
        </div>

        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="🏢 Empresas ativas" value={overview.empresas_ativas} sub={`${overview.total_empresas} no total`} />
            <MetricCard label="👥 Colaboradores" value={overview.total_colaboradores} sub="em toda a plataforma" />
            <MetricCard label="🌱 Novas (30 dias)" value={overview.empresas_novas_30d} sub="crescimento recente" />
            <MetricCard
              label="⚠️ Esquecidas"
              value={overview.empresas_esquecidas}
              sub="sem atividade há 7+ dias"
              danger={Number(overview.empresas_esquecidas) > 0}
            />
          </div>
        )}

        <div className="card">
          <p className="label mb-3">📈 Empresas cadastradas por mês</p>
          <div className="flex items-end gap-3 h-28">
            {growthBuckets.map((b) => (
              <div key={b.key} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-xs text-muted mb-1">{b.count}</span>
                <div
                  className="w-full bg-gold rounded-t-md transition-all"
                  style={{ height: `${Math.max(4, (b.count / maxGrowth) * 88)}px` }}
                />
                <span className="text-[11px] text-muted mt-1.5 capitalize">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <p className="label mb-3">➕ Nova empresa</p>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Nome da empresa</label>
              <input className="input" value={empresaName} onChange={(e) => setEmpresaName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Nome do gestor</label>
              <input className="input" value={gestorName} onChange={(e) => setGestorName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Senha temporária</label>
              <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="sm:col-span-3">
              <button className="btn" type="submit" disabled={creating}>
                {creating ? "Criando…" : "Criar empresa + gestor"}
              </button>
            </div>
          </form>
          {msg && <p className="text-xs text-muted mt-2">{msg}</p>}
        </div>

        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="label mb-0">🏢 Empresas ({health.length}) — {monthLabel(month)}</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: "risco", label: "mais em risco" },
                { key: "recente", label: "mais recente" },
                { key: "desempenho", label: "pior desempenho" },
                { key: "nome", label: "nome" },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortKey(s.key)}
                  className={`text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full border transition-all ${
                    sortKey === s.key ? "bg-navy text-white border-navy" : "border-line text-muted hover:border-navy hover:text-navy"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {sortedHealth.map((row) => {
              const stale = daysSince(row.last_activity);
              const neverActive = stale === Infinity;
              const alerts = [];
              if (Number(row.tasks_count) === 0) alerts.push("sem tarefas cadastradas");
              if (Number(row.goals_count) === 0) alerts.push("sem meta do mês");
              if (row.gestor_pending_password) alerts.push("gestor não trocou a senha");
              if (!row.gestor_name) alerts.push("sem gestor cadastrado");

              return (
                <div key={row.empresa_id} className={`border rounded-xl p-3.5 ${neverActive || stale >= 7 ? "border-danger/40 bg-danger/5" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-navy text-sm">
                        {row.empresa_name}
                        {!row.active && <span className="ml-2 text-[10px] uppercase text-danger">inativa</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {row.gestor_name ? `gestor: ${row.gestor_name} (${row.gestor_username})` : "sem gestor"} · {row.colaboradores_count} colaborador(es)
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {neverActive ? "nunca teve atividade" : `última atividade há ${stale} dia(s)`}
                        {" · "}barra do mês: {Number(row.team_pct).toFixed(0)}% (meta {Number(row.team_threshold).toFixed(0)}%)
                      </p>
                      {alerts.length > 0 && (
                        <p className="text-[11px] text-warn mt-1">⚠️ {alerts.join(" · ")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        className="input !py-1 !text-xs w-auto"
                        value={row.plano}
                        onChange={(e) => updatePlano(row.empresa_id, e.target.value)}
                      >
                        {PLANOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <button
                        className="text-xs uppercase tracking-wider text-muted hover:text-navy font-medium whitespace-nowrap"
                        onClick={() => setSelectedEmpresa({ id: row.empresa_id, name: row.empresa_name })}
                      >
                        ver dados →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {sortedHealth.length === 0 && <p className="text-sm text-muted py-2">Nenhuma empresa cadastrada ainda.</p>}
          </div>
        </div>

        <ChangePassword />
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value, sub, danger }) {
  return (
    <div className="card">
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${danger ? "text-danger" : "text-navy"}`}>{value ?? 0}</p>
      <p className="text-[11px] text-muted mt-0.5">{sub}</p>
    </div>
  );
}

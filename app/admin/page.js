"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Crown,
  Building2,
  Users,
  Sprout,
  AlertTriangle,
  TrendingUp,
  Plus,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  User,
  KeyRound,
  Power,
  Trash2,
  Eye,
  Camera,
  Pencil,
  Check,
  X,
} from "lucide-react";
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
  const [allProfiles, setAllProfiles] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [editingEmpresaId, setEditingEmpresaId] = useState(null);
  const [editingEmpresaName, setEditingEmpresaName] = useState("");
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
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["gestor", "colaborador"])
      .order("full_name");
    setAllProfiles(profileRows || []);
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
    setMsg(`Empresa criada! Login do gestor → usuário: ${json.username}`);
    setEmpresaName(""); setGestorName(""); setPassword("");
    await loadAll();
  }

  async function updatePlano(empresaId, plano) {
    await supabase.from("empresas").update({ plano }).eq("id", empresaId);
    await loadAll();
  }

  async function saveEmpresaName(empresaId) {
    const trimmed = editingEmpresaName.trim();
    if (!trimmed) return;
    await supabase.from("empresas").update({ name: trimmed }).eq("id", empresaId);
    setEditingEmpresaId(null);
    await loadAll();
  }

  async function toggleEmpresaActive(row) {
    const next = !row.active;
    if (!next && !window.confirm(`Desativar "${row.empresa_name}"? O gestor e todos os colaboradores dessa empresa perdem o acesso até você reativar.`)) return;
    await supabase.from("empresas").update({ active: next }).eq("id", row.empresa_id);
    await loadAll();
  }

  async function deleteEmpresa(row) {
    const typed = window.prompt(
      `Isso vai apagar "${row.empresa_name}" e TODOS os dados dela (gestor, colaboradores, tarefas, metas, histórico) para sempre. Digite o nome da empresa para confirmar:`
    );
    if (typed !== row.empresa_name) {
      if (typed !== null) alert("Nome não confere. Nada foi excluído.");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/delete-empresa", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ empresaId: row.empresa_id }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert("Erro ao excluir: " + (json.error || "não foi possível excluir."));
      return;
    }
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
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-muted gap-2">
        <Loader2 size={16} className="animate-spin" /> carregando…
      </div>
    );
  }

  if (profile.must_change_password) {
    return <ChangePassword force onDone={() => setProfile({ ...profile, must_change_password: false })} />;
  }

  if (selectedEmpresa) {
    return (
      <AppShell
        userName={profile.full_name}
        userId={profile.id}
        onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-navy flex items-center gap-2"><Building2 size={20} className="text-purple" /> {selectedEmpresa.name}</h1>
              <p className="text-xs text-muted mt-1 flex items-center gap-1.5"><Crown size={13} className="text-gold" /> Visualizando como Master Admin — dados completos desta empresa</p>
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
    <AppShell
      userName={profile.full_name}
      userId={profile.id}
      onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-navy flex items-center gap-2">
            <greet.Icon size={20} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
          </h1>
          <p className="text-xs text-muted mt-1 flex items-center gap-1.5"><Crown size={13} className="text-gold" /> Master Admin — gestão de empresas clientes do Z Meta</p>
        </div>

        {overview && (
          <div
            className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
            style={{ background: "linear-gradient(135deg, #c9a15a 0%, #e4c789 100%)", boxShadow: "0 10px 28px rgba(201,161,90,0.4)" }}
          >
            <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/10" />
            <div className="relative flex items-center gap-2 mb-5">
              <Crown size={18} className="text-navy" />
              <span className="text-xs font-bold uppercase tracking-wider text-navy">Master Admin · Visão geral</span>
            </div>
            <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-4">
              <HeroStat Icon={Building2} value={overview.empresas_ativas} label="Empresas ativas" sub={`${overview.total_empresas} no total`} />
              <HeroStat Icon={Users} value={overview.total_colaboradores} label="Colaboradores" sub="em toda a plataforma" divider />
              <HeroStat Icon={Sprout} value={overview.empresas_novas_30d} label="Novas (30 dias)" sub="crescimento recente" divider />
              <HeroStat
                Icon={AlertTriangle}
                value={overview.empresas_esquecidas}
                label="Esquecidas"
                sub="sem atividade há 7+ dias"
                divider
                danger={Number(overview.empresas_esquecidas) > 0}
              />
            </div>
          </div>
        )}

        <div className="card">
          <p className="label mb-3 flex items-center gap-1.5"><TrendingUp size={14} /> Empresas cadastradas por mês</p>
          <div className="flex items-end gap-3 h-28">
            {growthBuckets.map((b) => (
              <div key={b.key} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-xs text-muted mb-1">{b.count}</span>
                <div
                  className="w-full rounded-t-xl transition-all"
                  style={{ height: `${Math.max(4, (b.count / maxGrowth) * 88)}px`, background: "linear-gradient(180deg, #ec4899, #7c3aed)" }}
                />
                <span className="text-[11px] text-muted mt-1.5 capitalize">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <p className="label mb-3 flex items-center gap-1.5"><Plus size={14} /> Nova empresa</p>
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
          {msg && (
            <p className="text-xs text-muted mt-2 flex items-center gap-1.5">
              {msg.startsWith("Erro") ? <AlertTriangle size={13} className="text-danger" /> : <CheckCircle2 size={13} className="text-success" />}
              {msg}
            </p>
          )}
        </div>

        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="label mb-0 flex items-center gap-1.5"><Building2 size={14} /> Empresas ({health.length}) — {monthLabel(month)}</p>
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

              const isExpanded = !!expanded[row.empresa_id];
              return (
                <div
                  key={row.empresa_id}
                  className={`border rounded-xl p-3.5 cursor-pointer transition-colors ${
                    neverActive || stale >= 7 ? "border-danger/40 bg-danger/5" : "border-line hover:border-purple/40"
                  } ${!row.active ? "opacity-60" : ""}`}
                  onClick={() => setExpanded((e) => ({ ...e, [row.empresa_id]: !e[row.empresa_id] }))}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <EmpresaAvatar empresaId={row.empresa_id} logoUrl={row.logo_url} name={row.empresa_name} onChanged={loadAll} />
                      </div>
                      <div>
                        {editingEmpresaId === row.empresa_id ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="input !py-1 !text-sm !w-auto"
                              value={editingEmpresaName}
                              onChange={(e) => setEditingEmpresaName(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEmpresaName(row.empresa_id);
                                if (e.key === "Escape") setEditingEmpresaId(null);
                              }}
                            />
                            <button
                              className="p-1.5 rounded-lg border border-success text-success hover:bg-success/10 transition-colors"
                              onClick={() => saveEmpresaName(row.empresa_id)}
                              title="Salvar"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              className="p-1.5 rounded-lg border border-line text-muted hover:border-navy hover:text-navy transition-colors"
                              onClick={() => setEditingEmpresaId(null)}
                              title="Cancelar"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <p className="font-semibold text-navy text-sm flex items-center gap-1.5">
                            {row.empresa_name}
                            <button
                              className="text-muted hover:text-purple transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingEmpresaId(row.empresa_id);
                                setEditingEmpresaName(row.empresa_name);
                              }}
                              title="Editar nome da empresa"
                            >
                              <Pencil size={12} />
                            </button>
                            {isExpanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                            {!row.active && <span className="text-[10px] uppercase text-danger font-bold">inativa</span>}
                          </p>
                        )}
                        <p className="text-xs text-muted">
                          {row.gestor_name ? `gestor: ${row.gestor_name} (${row.gestor_username})` : "sem gestor"} · {row.colaboradores_count} colaborador(es)
                        </p>
                        <p className="text-[11px] text-muted mt-0.5">
                          {neverActive ? "nunca teve atividade" : `última atividade há ${stale} dia(s)`}
                          {" · "}barra do mês: {Number(row.team_pct).toFixed(0)}% (meta {Number(row.team_threshold).toFixed(0)}%)
                        </p>
                        {alerts.length > 0 && (
                          <p className="text-[11px] text-warn mt-1 flex items-center gap-1"><AlertTriangle size={12} /> {alerts.join(" · ")}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="input !py-1 !text-xs w-auto"
                        value={row.plano}
                        onChange={(e) => updatePlano(row.empresa_id, e.target.value)}
                      >
                        {PLANOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <button
                        className="inline-flex items-center gap-1.5 text-white rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shadow-pop active:scale-95 hover:brightness-110 transition-all"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
                        onClick={() => setSelectedEmpresa({ id: row.empresa_id, name: row.empresa_name })}
                      >
                        <Eye size={13} /> Ver dados
                      </button>
                      <button
                        title={row.active ? "Desativar empresa" : "Ativar empresa"}
                        onClick={() => toggleEmpresaActive(row)}
                        className={`p-1.5 rounded-lg border transition-colors ${row.active ? "border-line text-muted hover:border-warn hover:text-warn" : "border-success text-success"}`}
                      >
                        <Power size={13} />
                      </button>
                      <button
                        title="Excluir empresa"
                        onClick={() => deleteEmpresa(row)}
                        className="p-1.5 rounded-lg border border-line text-muted hover:border-danger hover:text-danger transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <EquipeList
                        profiles={allProfiles.filter((p) => p.empresa_id === row.empresa_id)}
                        onChanged={loadAll}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {sortedHealth.length === 0 && <p className="text-sm text-muted py-2">Nenhuma empresa cadastrada ainda.</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function EmpresaAvatar({ empresaId, logoUrl, name, onChanged }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const initials = (name || "?").trim().charAt(0).toUpperCase();

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Selecione um arquivo de imagem.");
      return;
    }
    setUploading(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${empresaId}/logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("empresa-logos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploading(false);
      alert("Erro ao enviar imagem: " + upErr.message);
      return;
    }
    const { data } = supabase.storage.from("empresa-logos").getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from("empresas").update({ logo_url: url }).eq("id", empresaId);
    setUploading(false);
    onChanged && onChanged();
  }

  return (
    <div
      className="relative w-11 h-11 rounded-full shrink-0 overflow-hidden cursor-pointer group border-2 border-purple/20"
      onClick={() => inputRef.current?.click()}
      title="Alterar logotipo da empresa"
    >
      {logoUrl ? (
        <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-white font-bold text-sm"
          style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
        >
          {initials}
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-navy/0 group-hover:bg-navy/50 opacity-0 group-hover:opacity-100 transition-all">
        <Camera size={14} className="text-white" />
      </div>
      {uploading && (
        <div className="absolute inset-0 bg-navy/60 flex items-center justify-center">
          <Loader2 size={14} className="text-white animate-spin" />
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function HeroStat({ Icon, value, label, sub, divider, danger }) {
  const tone = danger ? "text-[#7a1f1f]" : "text-navy";
  return (
    <div className={divider ? "sm:border-l sm:border-navy/15 sm:pl-4" : ""}>
      <Icon size={20} className={tone} />
      <p className={`text-3xl font-extrabold mt-2 ${tone}`}>{value ?? 0}</p>
      <p className={`text-xs font-semibold mt-0.5 ${tone}`}>{label}</p>
      <p className={`text-[11px] mt-0.5 ${danger ? "text-[#7a1f1f]/80" : "text-navy/65"}`}>{sub}</p>
    </div>
  );
}

function EquipeList({ profiles, onChanged }) {
  const [openId, setOpenId] = useState(null);
  const gestores = profiles.filter((p) => p.role === "gestor");
  const colaboradores = profiles.filter((p) => p.role === "colaborador");

  return (
    <div className="mt-3 pt-3 border-t border-line grid sm:grid-cols-2 gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted font-bold mb-2 flex items-center gap-1.5">
          <ShieldCheck size={13} /> Gestores ({gestores.length})
        </p>
        {gestores.length === 0 && <p className="text-xs text-muted">Nenhum gestor cadastrado.</p>}
        <ul className="space-y-2">
          {gestores.map((g) => (
            <li key={g.id}>
              <button
                onClick={() => setOpenId(openId === g.id ? null : g.id)}
                className="w-full text-xs flex items-center justify-between gap-2 hover:text-purple transition-colors"
              >
                <span className="text-navy font-medium">{g.full_name} <span className="text-muted font-normal">({g.username})</span></span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {g.must_change_password && (
                    <span className="badge bg-warn/15 text-warn"><KeyRound size={10} /> senha pendente</span>
                  )}
                  {openId === g.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>
              {openId === g.id && <EditUser user={g} onChanged={onChanged} onClose={() => setOpenId(null)} />}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted font-bold mb-2 flex items-center gap-1.5">
          <User size={13} /> Colaboradores ({colaboradores.length})
        </p>
        {colaboradores.length === 0 && <p className="text-xs text-muted">Nenhum colaborador cadastrado.</p>}
        <ul className="space-y-2">
          {colaboradores.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setOpenId(openId === c.id ? null : c.id)}
                className="w-full text-xs flex items-center justify-between gap-2 hover:text-purple transition-colors"
              >
                <span className={`font-medium ${c.active ? "text-navy" : "text-muted line-through"}`}>
                  {c.full_name} <span className="text-muted font-normal">({c.username})</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {c.must_change_password && (
                    <span className="badge bg-warn/15 text-warn"><KeyRound size={10} /> senha pendente</span>
                  )}
                  {openId === c.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>
              {openId === c.id && <EditUser user={c} onChanged={onChanged} onClose={() => setOpenId(null)} />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EditUser({ user, onChanged, onClose }) {
  const [name, setName] = useState(user.full_name);
  const [username, setUsername] = useState(user.username || "");
  const [msg, setMsg] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function call(body) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/update-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ employeeId: user.id, ...body }),
    });
    return { ok: res.ok, json: await res.json() };
  }

  async function saveName(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingName(true);
    setMsg("");
    const { ok, json } = await call({ fullName: name.trim() });
    setSavingName(false);
    if (!ok) {
      setMsg("Erro: " + (json.error || "não foi possível salvar."));
      return;
    }
    setMsg("Nome atualizado.");
    onChanged && onChanged();
  }

  async function saveUsername(e) {
    e.preventDefault();
    if (!username.trim()) return;
    setSavingUsername(true);
    setMsg("");
    const { ok, json } = await call({ newUsername: username.trim() });
    setSavingUsername(false);
    if (!ok) {
      setMsg("Erro: " + (json.error || "não foi possível salvar."));
      return;
    }
    setMsg("Usuário de login atualizado.");
    onChanged && onChanged();
  }

  async function resetPassword() {
    if (!window.confirm(`Redefinir a senha de ${user.full_name} para 123456789?`)) return;
    setResetting(true);
    setMsg("");
    const { ok, json } = await call({ resetPassword: true });
    setResetting(false);
    if (!ok) {
      setMsg("Erro: " + (json.error || "não foi possível redefinir."));
      return;
    }
    setMsg("Senha redefinida para 123456789 — a pessoa deve trocar no próximo acesso.");
    onChanged && onChanged();
  }

  return (
    <div className="mt-2 mb-1 p-3 rounded-xl bg-purple/5 border border-purple/15 space-y-3">
      <form onSubmit={saveName} className="flex items-center gap-2">
        <input className="input !py-1.5 !text-xs flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap" disabled={savingName}>
          {savingName ? "Salvando…" : "Salvar nome"}
        </button>
      </form>
      <form onSubmit={saveUsername} className="flex items-center gap-2">
        <input
          className="input !py-1.5 !text-xs flex-1"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="usuário de login"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button type="submit" className="btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap" disabled={savingUsername}>
          {savingUsername ? "Salvando…" : "Salvar usuário"}
        </button>
      </form>
      <button
        onClick={resetPassword}
        className="flex items-center gap-1.5 text-xs font-bold text-danger hover:text-red-700 transition-colors"
        disabled={resetting}
      >
        <KeyRound size={13} /> {resetting ? "Redefinindo…" : "Redefinir senha para 123456789"}
      </button>
      {msg && (
        <p className="text-[11px] text-muted flex items-center gap-1.5">
          {msg.startsWith("Erro") ? <AlertTriangle size={12} className="text-danger" /> : <CheckCircle2 size={12} className="text-success" />}
          {msg}
        </p>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Crown,
  Building2,
  Store,
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
  Search,
  Filter,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import EmpresaDashboard from "../../lib/EmpresaDashboard";
import { CnpjInput } from "../../lib/MaskedInputs";
import { greeting, todayStr, firstDayOfMonth } from "../../lib/date";

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
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedLoja, setSelectedLoja] = useState(null);

  const [empresaName, setEmpresaName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);

  const greet = greeting();
  const month = firstDayOfMonth(todayStr());

  const loadAll = useCallback(async () => {
    const { data: overviewRows } = await supabase.rpc("admin_overview");
    setOverview((overviewRows && overviewRows[0]) || null);
    const { data: healthRows } = await supabase.rpc("admin_lojas_health", { p_month: month });
    setHealth(healthRows || []);
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["gerente", "colaborador"])
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
      body: JSON.stringify({ empresaName, cnpj, telefone, email }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setMsg("Empresa criada! Agora cadastre uma loja e um gerente dentro dela.");
    setEmpresaName(""); setCnpj(""); setTelefone(""); setEmail("");
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
    if (!next && !window.confirm(`Desativar "${row.empresa_name}"? Gerentes e colaboradores dessa empresa perdem o acesso até você reativar.`)) return;
    await supabase.from("empresas").update({ active: next }).eq("id", row.empresa_id);
    await loadAll();
  }

  async function deleteEmpresa(row) {
    const typed = window.prompt(
      `Isso vai apagar "${row.empresa_name}" e TODOS os dados dela (lojas, gerentes, colaboradores, tarefas, metas, histórico) para sempre. Digite o nome da empresa para confirmar:`
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

  const empresasGrouped = useMemo(() => {
    const map = new Map();
    health.forEach((row) => {
      if (!map.has(row.empresa_id)) {
        map.set(row.empresa_id, {
          empresa_id: row.empresa_id,
          empresa_name: row.empresa_name,
          plano: row.plano,
          active: row.active,
          created_at: row.empresa_created_at,
          logo_url: row.logo_url,
          lojas: [],
        });
      }
      if (row.loja_id) map.get(row.empresa_id).lojas.push(row);
    });
    let list = Array.from(map.values());

    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.empresa_name.toLowerCase().includes(q));

    list.forEach((e) => {
      e._worstStale = e.lojas.length ? Math.max(...e.lojas.map((l) => daysSince(l.last_activity))) : Infinity;
      e._worstPct = e.lojas.length ? Math.min(...e.lojas.map((l) => Number(l.team_pct))) : 0;
      e._colabTotal = e.lojas.reduce((s, l) => s + Number(l.colaboradores_count), 0);
    });

    if (sortKey === "risco") list.sort((a, b) => b._worstStale - a._worstStale);
    else if (sortKey === "recente") list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sortKey === "nome") list.sort((a, b) => a.empresa_name.localeCompare(b.empresa_name));
    else if (sortKey === "desempenho") list.sort((a, b) => a._worstPct - b._worstPct);

    return list;
  }, [health, sortKey, search]);

  const growthBuckets = useMemo(() => {
    const uniqueEmpresas = new Map();
    health.forEach((row) => { if (!uniqueEmpresas.has(row.empresa_id)) uniqueEmpresas.set(row.empresa_id, row); });

    const buckets = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), count: 0 });
    }
    Array.from(uniqueEmpresas.values()).forEach((row) => {
      const key = String(row.empresa_created_at).slice(0, 7);
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
            <div>
              <h1 className="text-xl font-bold text-navy flex items-center gap-2"><Store size={20} className="text-purple" /> {selectedLoja.lojaName}</h1>
              <p className="text-xs text-muted mt-1 flex items-center gap-1.5"><Crown size={13} className="text-gold" /> Visualizando como Master Admin — dados completos desta loja</p>
            </div>
            <button className="btn-outline whitespace-nowrap" onClick={() => setSelectedLoja(null)}>
              ← Voltar para empresas
            </button>
          </div>
          <EmpresaDashboard lojaId={selectedLoja.lojaId} empresaId={selectedLoja.empresaId} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      userName={profile.full_name}
      userId={profile.id}
      userUsername={profile.username}
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
          <p className="inline-flex items-center gap-1.5 whitespace-nowrap m-0 mb-3 text-xs uppercase tracking-wider text-muted font-bold">
            <TrendingUp size={14} className="shrink-0" /> Empresas cadastradas por mês
          </p>
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
          <p className="inline-flex items-center gap-1.5 whitespace-nowrap m-0 mb-3 text-xs uppercase tracking-wider text-muted font-bold">
            <Plus size={14} className="shrink-0" /> Nova empresa
          </p>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nome da empresa</label>
              <input className="input" value={empresaName} onChange={(e) => setEmpresaName(e.target.value)} required />
            </div>
            <div>
              <label className="label">CNPJ</label>
              <CnpjInput value={cnpj} onChange={setCnpj} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <label className="label">E-mail principal</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@empresa.com" />
            </div>
            <div className="sm:col-span-2">
              <button className="btn" type="submit" disabled={creating}>
                {creating ? "Criando…" : "Criar empresa"}
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
          <div className="flex items-center justify-between mb-3 flex-nowrap gap-2">
            <p className="inline-flex items-center gap-1.5 whitespace-nowrap m-0 text-xs uppercase tracking-wider text-muted font-bold">
              <Building2 size={14} className="shrink-0" /> Empresas
            </p>
            <div className="relative shrink-0">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={`p-2 rounded-full border transition-all ${
                  filterOpen ? "bg-navy text-white border-navy" : "border-line text-muted hover:border-navy hover:text-navy"
                }`}
                title="Ordenar empresas"
              >
                <Filter size={15} />
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-40 w-56 card !p-2 animate-pop border-purple/20">
                    {[
                      { key: "risco", label: "mais em risco" },
                      { key: "recente", label: "mais recente" },
                      { key: "desempenho", label: "pior desempenho" },
                      { key: "nome", label: "nome" },
                    ].map((s) => (
                      <button
                        key={s.key}
                        onClick={() => { setSortKey(s.key); setFilterOpen(false); }}
                        className={`w-full text-left text-xs px-3 py-2 rounded-xl transition-all flex items-center justify-between gap-2 ${
                          sortKey === s.key ? "bg-purple/10 text-purple font-bold" : "text-muted hover:bg-paper hover:text-navy"
                        }`}
                      >
                        {s.label}
                        {sortKey === s.key && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="relative mb-4">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input !pl-10"
              placeholder="Buscar empresa pelo nome…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            {empresasGrouped.length === 0 && search.trim() && (
              <p className="text-sm text-muted py-2">Nenhuma empresa encontrada para &ldquo;{search.trim()}&rdquo;.</p>
            )}
            {empresasGrouped.map((row) => {
              const stale = row._worstStale;
              const neverActive = stale === Infinity;
              const isExpanded = !!expanded[row.empresa_id];
              return (
                <div
                  key={row.empresa_id}
                  className={`border rounded-xl p-3.5 cursor-pointer transition-colors ${
                    row.lojas.length > 0 && (neverActive || stale >= 7) ? "border-danger/40 bg-danger/5" : "border-line hover:border-purple/40"
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
                          {row.lojas.length} loja{row.lojas.length !== 1 ? "s" : ""} · {row._colabTotal} colaborador(es) no total
                        </p>
                        <p className="text-[11px] text-muted mt-0.5">
                          {row.lojas.length === 0
                            ? "nenhuma loja cadastrada ainda"
                            : neverActive
                              ? "nenhuma loja teve atividade ainda"
                              : `loja mais parada: há ${stale} dia(s)`}
                        </p>
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
                      <LojasList
                        empresaId={row.empresa_id}
                        lojas={row.lojas}
                        allProfiles={allProfiles}
                        onChanged={loadAll}
                        onOpenDados={setSelectedLoja}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {empresasGrouped.length === 0 && !search.trim() && <p className="text-sm text-muted py-2">Nenhuma empresa cadastrada ainda.</p>}
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

function LojasList({ empresaId, lojas, allProfiles, onChanged, onOpenDados }) {
  const [addingLoja, setAddingLoja] = useState(false);
  const [lojaName, setLojaName] = useState("");
  const [creating, setCreating] = useState(false);
  const [openLojaId, setOpenLojaId] = useState(null);

  async function createLoja(e) {
    e.preventDefault();
    if (!lojaName.trim()) return;
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-loja", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ empresaId, lojaName: lojaName.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      setLojaName("");
      setAddingLoja(false);
      onChanged();
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted font-bold flex items-center gap-1.5">
          <Store size={13} /> Lojas ({lojas.length})
        </p>
        <button
          onClick={() => setAddingLoja((v) => !v)}
          className="text-[11px] uppercase tracking-wider font-bold text-purple hover:text-pink transition-colors flex items-center gap-1"
        >
          <Plus size={12} /> nova loja
        </button>
      </div>
      {addingLoja && (
        <form onSubmit={createLoja} className="flex items-center gap-2">
          <input
            className="input !py-1.5 !text-xs flex-1"
            placeholder="nome da loja"
            value={lojaName}
            onChange={(e) => setLojaName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap" disabled={creating}>
            {creating ? "Criando…" : "Criar"}
          </button>
        </form>
      )}
      {lojas.length === 0 && <p className="text-xs text-muted">Nenhuma loja cadastrada ainda.</p>}
      <div className="space-y-2">
        {lojas.map((l) => (
          <LojaCard
            key={l.loja_id}
            loja={l}
            empresaId={empresaId}
            allProfiles={allProfiles}
            onChanged={onChanged}
            onOpenDados={onOpenDados}
            isOpen={openLojaId === l.loja_id}
            onToggle={() => setOpenLojaId(openLojaId === l.loja_id ? null : l.loja_id)}
          />
        ))}
      </div>
    </div>
  );
}

function LojaCard({ loja, empresaId, allProfiles, onChanged, onOpenDados, isOpen, onToggle }) {
  const [addingGerente, setAddingGerente] = useState(false);
  const [gerenteName, setGerenteName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");
  const [openUserId, setOpenUserId] = useState(null);

  const colaboradores = allProfiles.filter((p) => p.loja_id === loja.loja_id && p.role === "colaborador");
  const stale = daysSince(loja.last_activity);
  const neverActive = stale === Infinity;

  const alerts = [];
  if (!loja.gerente_id) alerts.push("sem gerente cadastrado");
  else if (loja.gerente_pending_password) alerts.push("gerente não trocou a senha");
  if (Number(loja.tasks_count) === 0) alerts.push("sem tarefas cadastradas");
  if (Number(loja.goals_count) === 0) alerts.push("sem meta do mês");

  async function createGerente(e) {
    e.preventDefault();
    if (!gerenteName.trim() || !password) return;
    setCreating(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-gerente", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ empresaId, lojaId: loja.loja_id, gerenteName: gerenteName.trim(), password }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    setMsg(`Gerente criado! Usuário: ${json.username}`);
    setGerenteName(""); setPassword(""); setAddingGerente(false);
    onChanged();
  }

  return (
    <div className="border border-line rounded-xl p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-navy flex items-center gap-1.5">
            <Store size={13} className="text-teal" /> {loja.loja_name}
            {!loja.loja_active && <span className="text-[10px] uppercase text-danger font-bold">inativa</span>}
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            {loja.gerente_name ? `gerente: ${loja.gerente_name} (${loja.gerente_username})` : "sem gerente"} · {loja.colaboradores_count} colaborador(es)
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            {neverActive ? "nunca teve atividade" : `última atividade há ${stale} dia(s)`}
            {" · "}barra do mês: {Number(loja.team_pct || 0).toFixed(0)}% (meta {Number(loja.team_threshold || 95).toFixed(0)}%)
          </p>
          {alerts.length > 0 && (
            <p className="text-[11px] text-warn mt-1 flex items-center gap-1"><AlertTriangle size={12} /> {alerts.join(" · ")}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="inline-flex items-center gap-1.5 text-white rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap shadow-pop active:scale-95 hover:brightness-110 transition-all"
            style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
            onClick={() => onOpenDados({ lojaId: loja.loja_id, lojaName: loja.loja_name, empresaId })}
          >
            <Eye size={12} /> Ver dados
          </button>
          <button onClick={onToggle} className="p-1.5 rounded-lg border border-line text-muted hover:border-navy hover:text-navy transition-colors">
            {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 pt-3 border-t border-line space-y-3">
          {loja.gerente_id ? (
            <div>
              <button
                onClick={() => setOpenUserId(openUserId === loja.gerente_id ? null : loja.gerente_id)}
                className="w-full text-xs flex items-center justify-between gap-2 hover:text-purple transition-colors"
              >
                <span className="text-navy font-medium flex items-center gap-1.5">
                  <ShieldCheck size={12} /> {loja.gerente_name} <span className="text-muted font-normal">({loja.gerente_username})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {loja.gerente_pending_password && (
                    <span className="badge bg-warn/15 text-warn"><KeyRound size={10} /> senha pendente</span>
                  )}
                  {openUserId === loja.gerente_id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>
              {openUserId === loja.gerente_id && (
                <EditUser
                  user={{ id: loja.gerente_id, full_name: loja.gerente_name, username: loja.gerente_username }}
                  onChanged={onChanged}
                  onClose={() => setOpenUserId(null)}
                />
              )}
            </div>
          ) : (
            <div>
              <button
                onClick={() => setAddingGerente((v) => !v)}
                className="text-[11px] uppercase tracking-wider font-bold text-purple hover:text-pink transition-colors flex items-center gap-1"
              >
                <Plus size={12} /> cadastrar gerente
              </button>
              {addingGerente && (
                <form onSubmit={createGerente} className="grid sm:grid-cols-2 gap-2 mt-2">
                  <input
                    className="input !py-1.5 !text-xs"
                    placeholder="nome do gerente"
                    value={gerenteName}
                    onChange={(e) => setGerenteName(e.target.value)}
                  />
                  <input
                    className="input !py-1.5 !text-xs"
                    placeholder="senha temporária"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="submit" className="btn-outline !py-1.5 !text-xs sm:col-span-2" disabled={creating}>
                    {creating ? "Criando…" : "Criar gerente"}
                  </button>
                </form>
              )}
              {msg && (
                <p className="text-[11px] text-muted mt-1 flex items-center gap-1.5">
                  {msg.startsWith("Erro") ? <AlertTriangle size={11} className="text-danger" /> : <CheckCircle2 size={11} className="text-success" />}
                  {msg}
                </p>
              )}
            </div>
          )}

          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5 flex items-center gap-1.5">
              <User size={12} /> Colaboradores ({colaboradores.length})
            </p>
            <ul className="space-y-1.5">
              {colaboradores.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setOpenUserId(openUserId === c.id ? null : c.id)}
                    className="w-full text-xs flex items-center justify-between gap-2 hover:text-purple transition-colors"
                  >
                    <span className={`font-medium ${c.active ? "text-navy" : "text-muted line-through"}`}>
                      {c.full_name} <span className="text-muted font-normal">({c.username})</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {c.must_change_password && (
                        <span className="badge bg-warn/15 text-warn"><KeyRound size={10} /> senha pendente</span>
                      )}
                      {openUserId === c.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </span>
                  </button>
                  {openUserId === c.id && <EditUser user={c} onChanged={onChanged} onClose={() => setOpenUserId(null)} />}
                </li>
              ))}
              {colaboradores.length === 0 && <p className="text-xs text-muted">Nenhum colaborador cadastrado ainda.</p>}
            </ul>
          </div>
        </div>
      )}
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

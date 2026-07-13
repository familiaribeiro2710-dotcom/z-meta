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
  ChevronRight,
  ChevronLeft,
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
  Calendar,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import EmpresaDashboard from "../../lib/EmpresaDashboard";
import { CnpjInput, PhoneInput } from "../../lib/MaskedInputs";
import { greeting, todayStr, firstDayOfMonth } from "../../lib/date";

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
  const [lojaAccess, setLojaAccess] = useState([]);
  const [sortKey, setSortKey] = useState("risco");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedLoja, setSelectedLoja] = useState(null);
  const [selectedEmpresaDetail, setSelectedEmpresaDetail] = useState(null);

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
      .in("role", ["gerente", "colaborador", "socio", "supervisor"])
      .order("full_name");
    setAllProfiles(profileRows || []);
    const { data: accessRows } = await supabase.from("loja_access").select("*");
    setLojaAccess(accessRows || []);
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

  const allEmpresas = useMemo(() => {
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
          cnpj: row.cnpj,
          telefone: row.telefone,
          email: row.email,
          lojas: [],
        });
      }
      if (row.loja_id) map.get(row.empresa_id).lojas.push(row);
    });
    const list = Array.from(map.values());
    list.forEach((e) => {
      e._worstStale = e.lojas.length ? Math.max(...e.lojas.map((l) => daysSince(l.last_activity))) : Infinity;
      e._worstPct = e.lojas.length ? Math.min(...e.lojas.map((l) => Number(l.team_pct))) : 0;
      e._colabTotal = e.lojas.reduce((s, l) => s + Number(l.colaboradores_count), 0);
    });
    return list;
  }, [health]);

  const empresasGrouped = useMemo(() => {
    let list = allEmpresas;

    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.empresa_name.toLowerCase().includes(q));

    list = [...list];
    if (sortKey === "risco") list.sort((a, b) => b._worstStale - a._worstStale);
    else if (sortKey === "recente") list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sortKey === "nome") list.sort((a, b) => a.empresa_name.localeCompare(b.empresa_name));
    else if (sortKey === "desempenho") list.sort((a, b) => a._worstPct - b._worstPct);

    return list;
  }, [allEmpresas, sortKey, search]);

  const empresaDetail = selectedEmpresaDetail ? allEmpresas.find((e) => e.empresa_id === selectedEmpresaDetail) : null;

  useEffect(() => {
    if (selectedEmpresaDetail && !allEmpresas.find((e) => e.empresa_id === selectedEmpresaDetail)) {
      setSelectedEmpresaDetail(null);
    }
  }, [allEmpresas, selectedEmpresaDetail]);

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

  if (selectedEmpresaDetail && !selectedLoja) {
    return (
      <AppShell
        userName={profile.full_name}
        userId={profile.id}
        userUsername={profile.username}
        onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))}
      >
        {empresaDetail ? (
          <EmpresaDetail
            empresa={empresaDetail}
            allProfiles={allProfiles}
            lojaAccess={lojaAccess}
            onBack={() => setSelectedEmpresaDetail(null)}
            onChanged={loadAll}
            onOpenLojaDados={setSelectedLoja}
            onToggleActive={toggleEmpresaActive}
            onDelete={deleteEmpresa}
          />
        ) : (
          <p className="text-sm text-muted">Empresa não encontrada.</p>
        )}
      </AppShell>
    );
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
              <PhoneInput value={telefone} onChange={setTelefone} />
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
              return (
                <div
                  key={row.empresa_id}
                  className={`border rounded-xl p-3.5 cursor-pointer transition-colors ${
                    row.lojas.length > 0 && (neverActive || stale >= 7) ? "border-danger/40 bg-danger/5" : "border-line hover:border-purple/40"
                  } ${!row.active ? "opacity-60" : ""}`}
                  onClick={() => setSelectedEmpresaDetail(row.empresa_id)}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <EmpresaAvatar empresaId={row.empresa_id} logoUrl={row.logo_url} name={row.empresa_name} onChanged={loadAll} />
                      </div>
                      <div>
                        <p className="font-semibold text-navy text-sm flex items-center gap-1.5">
                          {row.empresa_name}
                          <ChevronRight size={14} className="text-muted" />
                          {!row.active && <span className="text-[10px] uppercase text-danger font-bold">inativa</span>}
                        </p>
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
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap" title="Data de cadastro">
                        <Calendar size={13} />
                        {row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR") : "—"}
                      </span>
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

const ROLE_META = {
  socio: { label: "Sócio", color: "#6b7280", bg: "rgba(148,163,184,0.18)" },
  supervisor: { label: "Supervisor", color: "#2563eb", bg: "rgba(37,99,235,0.12)" },
};

function EmpresaDetail({ empresa, allProfiles, lojaAccess, onBack, onChanged, onOpenLojaDados, onToggleActive, onDelete }) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(empresa.empresa_name);
  const [editingContact, setEditingContact] = useState(false);
  const [cnpjVal, setCnpjVal] = useState(empresa.cnpj || "");
  const [telVal, setTelVal] = useState(empresa.telefone || "");
  const [emailVal, setEmailVal] = useState(empresa.email || "");
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => { if (!editingName) setNameVal(empresa.empresa_name); }, [empresa.empresa_name, editingName]);
  useEffect(() => {
    if (!editingContact) {
      setCnpjVal(empresa.cnpj || "");
      setTelVal(empresa.telefone || "");
      setEmailVal(empresa.email || "");
    }
  }, [empresa.cnpj, empresa.telefone, empresa.email, editingContact]);

  async function saveName() {
    const trimmed = nameVal.trim();
    if (!trimmed) return;
    await supabase.from("empresas").update({ name: trimmed }).eq("id", empresa.empresa_id);
    setEditingName(false);
    onChanged();
  }

  async function saveContact(e) {
    e.preventDefault();
    setSavingContact(true);
    await supabase
      .from("empresas")
      .update({ cnpj: cnpjVal || null, telefone: telVal || null, email: emailVal || null })
      .eq("id", empresa.empresa_id);
    setSavingContact(false);
    setEditingContact(false);
    onChanged();
  }

  const people = allProfiles.filter(
    (p) => p.empresa_id === empresa.empresa_id && (p.role === "socio" || p.role === "supervisor")
  );
  const stale = empresa._worstStale;
  const neverActive = stale === Infinity;

  return (
    <div className="space-y-6">
      <button className="text-xs font-bold text-muted hover:text-navy flex items-center gap-1.5" onClick={onBack}>
        <ChevronLeft size={14} /> Voltar para empresas
      </button>

      <div className="card space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <EmpresaAvatar empresaId={empresa.empresa_id} logoUrl={empresa.logo_url} name={empresa.empresa_name} onChanged={onChanged} />
            <div>
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    className="input !py-1 !text-lg font-bold !w-auto"
                    value={nameVal}
                    onChange={(e) => setNameVal(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                  />
                  <button className="p-1.5 rounded-lg border border-success text-success hover:bg-success/10 transition-colors" onClick={saveName}>
                    <Check size={14} />
                  </button>
                  <button
                    className="p-1.5 rounded-lg border border-line text-muted hover:border-navy hover:text-navy transition-colors"
                    onClick={() => setEditingName(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <h1 className="text-xl font-bold text-navy flex items-center gap-2">
                  {empresa.empresa_name}
                  <button className="text-muted hover:text-purple transition-colors" onClick={() => setEditingName(true)} title="Editar nome">
                    <Pencil size={14} />
                  </button>
                  {!empresa.active && <span className="text-[10px] uppercase text-danger font-bold">inativa</span>}
                </h1>
              )}
              <p className="text-xs text-muted mt-1 flex items-center gap-1.5">
                <Calendar size={13} /> cadastrada em {empresa.created_at ? new Date(empresa.created_at).toLocaleDateString("pt-BR") : "—"}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                {empresa.lojas.length} loja{empresa.lojas.length !== 1 ? "s" : ""} · {empresa._colabTotal} colaborador(es)
                {empresa.lojas.length > 0 && (neverActive ? " · nenhuma loja teve atividade ainda" : ` · loja mais parada: há ${stale} dia(s)`)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              title={empresa.active ? "Desativar empresa" : "Ativar empresa"}
              onClick={() => onToggleActive(empresa)}
              className={`p-2 rounded-lg border transition-colors ${empresa.active ? "border-line text-muted hover:border-warn hover:text-warn" : "border-success text-success"}`}
            >
              <Power size={15} />
            </button>
            <button
              title="Excluir empresa"
              onClick={() => onDelete(empresa)}
              className="p-2 rounded-lg border border-line text-muted hover:border-danger hover:text-danger transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-line">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider text-muted font-bold">Dados da empresa</p>
            {!editingContact && (
              <button
                className="text-[11px] uppercase tracking-wider font-bold text-purple hover:text-pink transition-colors flex items-center gap-1"
                onClick={() => setEditingContact(true)}
              >
                <Pencil size={11} /> editar
              </button>
            )}
          </div>
          {editingContact ? (
            <form onSubmit={saveContact} className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="label">CNPJ</label>
                <CnpjInput value={cnpjVal} onChange={setCnpjVal} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <PhoneInput value={telVal} onChange={setTelVal} />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input type="email" className="input" value={emailVal} onChange={(e) => setEmailVal(e.target.value)} />
              </div>
              <div className="sm:col-span-3 flex items-center gap-2">
                <button type="submit" className="btn-outline !py-1.5 !text-xs" disabled={savingContact}>
                  {savingContact ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" className="text-[11px] text-muted hover:text-navy" onClick={() => setEditingContact(false)}>
                  cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[11px] text-muted">CNPJ</p>
                <p className="text-navy font-medium">{empresa.cnpj || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Telefone</p>
                <p className="text-navy font-medium">{empresa.telefone || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">E-mail</p>
                <p className="text-navy font-medium">{empresa.email || "—"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddUserCard empresaId={empresa.empresa_id} lojas={empresa.lojas} onChanged={onChanged} />

      <div className="card">
        <HierarquiaList lojas={empresa.lojas} people={people} lojaAccess={lojaAccess} onChanged={onChanged} />
      </div>

      <div className="card">
        <LojasList
          empresaId={empresa.empresa_id}
          lojas={empresa.lojas}
          allProfiles={allProfiles}
          onChanged={onChanged}
          onOpenDados={onOpenLojaDados}
        />
      </div>
    </div>
  );
}

const NEW_USER_ROLES = [
  { key: "socio", label: "Sócio" },
  { key: "supervisor", label: "Supervisor" },
  { key: "gerente", label: "Gerente" },
  { key: "colaborador", label: "Colaborador" },
];

function AddUserCard({ empresaId, lojas, onChanged }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(null);

  function close() {
    setOpen(false);
    setRole(null);
  }
  function done() {
    close();
    onChanged();
  }

  return (
    <div className="card">
      {!open ? (
        <button className="btn" onClick={() => setOpen(true)}>
          <Plus size={15} /> Cadastrar novo usuário
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wider text-muted font-bold">Novo usuário — escolha o papel</p>
            <button className="text-muted hover:text-navy transition-colors" onClick={close}>
              <X size={15} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {NEW_USER_ROLES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRole(r.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                  role === r.key ? "bg-navy text-white border-navy" : "border-line text-muted hover:border-navy hover:text-navy"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {(role === "socio" || role === "supervisor") && (
            <AddHierarchyForm role={role} empresaId={empresaId} lojas={lojas} onDone={done} onCancel={close} />
          )}
          {role === "gerente" && <AddGerenteForm empresaId={empresaId} lojas={lojas} onDone={done} onCancel={close} />}
          {role === "colaborador" && <AddColaboradorForm empresaId={empresaId} lojas={lojas} onDone={done} onCancel={close} />}
        </div>
      )}
    </div>
  );
}

function AddGerenteForm({ empresaId, lojas, onDone, onCancel }) {
  const [lojaId, setLojaId] = useState(lojas[0]?.loja_id || "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!lojaId || !name.trim() || !password) {
      setMsg("Erro: preencha loja, nome e senha.");
      return;
    }
    setCreating(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-gerente", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ empresaId, lojaId, gerenteName: name.trim(), password }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    onDone();
  }

  if (lojas.length === 0) {
    return (
      <p className="text-xs text-muted flex items-center justify-between gap-2">
        Cadastre uma loja antes de incluir um gerente.
        <button type="button" onClick={onCancel} className="text-muted hover:text-navy"><X size={13} /></button>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid sm:grid-cols-3 gap-2 items-end">
      <div>
        <label className="label">Loja</label>
        <select className="input !py-1.5 !text-xs" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
          {lojas.map((l) => (
            <option key={l.loja_id} value={l.loja_id}>
              {l.loja_name}{l.gerente_id ? " (já tem gerente)" : ""}
            </option>
          ))}
        </select>
      </div>
      <input className="input !py-1.5 !text-xs" placeholder="nome do gerente" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input !py-1.5 !text-xs" placeholder="senha temporária" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="sm:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn-outline !py-1.5 !text-xs" disabled={creating}>
          {creating ? "Criando…" : "Criar gerente"}
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] text-muted hover:text-navy">cancelar</button>
      </div>
      {msg && (
        <p className="sm:col-span-3 text-[11px] text-muted flex items-center gap-1.5">
          {msg.startsWith("Erro") ? <AlertTriangle size={11} className="text-danger" /> : <CheckCircle2 size={11} className="text-success" />}
          {msg}
        </p>
      )}
    </form>
  );
}

function AddColaboradorForm({ empresaId, lojas, onDone, onCancel }) {
  const [lojaId, setLojaId] = useState(lojas[0]?.loja_id || "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!lojaId || !name.trim() || !password) {
      setMsg("Erro: preencha loja, nome e senha.");
      return;
    }
    setCreating(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ fullName: name.trim(), password, empresaId, lojaId }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    onDone();
  }

  if (lojas.length === 0) {
    return (
      <p className="text-xs text-muted flex items-center justify-between gap-2">
        Cadastre uma loja antes de incluir um colaborador.
        <button type="button" onClick={onCancel} className="text-muted hover:text-navy"><X size={13} /></button>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid sm:grid-cols-3 gap-2 items-end">
      <div>
        <label className="label">Loja</label>
        <select className="input !py-1.5 !text-xs" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
          {lojas.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.loja_name}</option>)}
        </select>
      </div>
      <input className="input !py-1.5 !text-xs" placeholder="nome do colaborador" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input !py-1.5 !text-xs" placeholder="senha temporária" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="sm:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn-outline !py-1.5 !text-xs" disabled={creating}>
          {creating ? "Criando…" : "Criar colaborador"}
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] text-muted hover:text-navy">cancelar</button>
      </div>
      {msg && (
        <p className="sm:col-span-3 text-[11px] text-muted flex items-center gap-1.5">
          {msg.startsWith("Erro") ? <AlertTriangle size={11} className="text-danger" /> : <CheckCircle2 size={11} className="text-success" />}
          {msg}
        </p>
      )}
    </form>
  );
}

function HierarquiaList({ lojas, people, lojaAccess, onChanged }) {
  const [openPersonId, setOpenPersonId] = useState(null);

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-muted font-bold flex items-center gap-1.5">
        <ShieldCheck size={13} /> Sócios e supervisores ({people.length})
      </p>

      {people.length === 0 && <p className="text-xs text-muted">Nenhum sócio ou supervisor cadastrado ainda.</p>}

      <div className="space-y-1.5">
        {people.map((p) => {
          const meta = ROLE_META[p.role] || {};
          const access = lojaAccess.filter((a) => a.profile_id === p.id);
          return (
            <div key={p.id}>
              <button
                onClick={() => setOpenPersonId(openPersonId === p.id ? null : p.id)}
                className="w-full text-xs flex items-center justify-between gap-2 hover:text-purple transition-colors"
              >
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="badge" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                  <span className={`font-medium ${p.active === false ? "text-muted line-through" : "text-navy"}`}>{p.full_name}</span>
                  <span className="text-muted">({p.username})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {p.must_change_password && <span className="badge bg-warn/15 text-warn"><KeyRound size={10} /> senha pendente</span>}
                  {openPersonId === p.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>
              {openPersonId === p.id && (
                <div className="mt-1.5">
                  <p className="text-[11px] text-muted mb-1.5 flex flex-wrap gap-1.5">
                    {access.length === 0 && "sem lojas atribuídas"}
                    {access.map((a) => {
                      const loja = lojas.find((l) => l.loja_id === a.loja_id);
                      return (
                        <span key={a.loja_id} className="badge bg-teal/10 text-teal">
                          <Store size={10} /> {loja?.loja_name || "loja"} · {a.permission === "gerenciar" ? "gerenciar" : "ver"}
                        </span>
                      );
                    })}
                  </p>
                  <EditUser user={p} onChanged={onChanged} onClose={() => setOpenPersonId(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddHierarchyForm({ role, empresaId, lojas, onDone, onCancel }) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [access, setAccess] = useState({});
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  const label = role === "socio" ? "sócio" : "supervisor";

  function toggleLoja(lojaId) {
    setAccess((a) => {
      const next = { ...a };
      if (next[lojaId]) delete next[lojaId];
      else next[lojaId] = "ver";
      return next;
    });
  }

  function setPermission(lojaId, permission) {
    setAccess((a) => ({ ...a, [lojaId]: permission }));
  }

  async function submit(e) {
    e.preventDefault();
    const selected = Object.entries(access).map(([lojaId, permission]) => ({ lojaId, permission }));
    if (!fullName.trim() || !password || selected.length === 0) {
      setMsg("Erro: preencha nome, senha e selecione ao menos uma loja.");
      return;
    }
    setCreating(true);
    setMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-hierarchy", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ role, empresaId, fullName: fullName.trim(), password, lojaAccess: selected }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setMsg("Erro: " + (json.error || "não foi possível criar."));
      return;
    }
    onDone();
  }

  if (lojas.length === 0) {
    return (
      <div className="p-3 rounded-xl bg-paper border border-line text-xs text-muted flex items-center justify-between gap-2">
        Cadastre uma loja antes de incluir um {label}.
        <button type="button" onClick={onCancel} className="text-muted hover:text-navy"><X size={13} /></button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="p-3 rounded-xl bg-purple/5 border border-purple/15 space-y-3">
      <div className="grid sm:grid-cols-2 gap-2">
        <input className="input !py-1.5 !text-xs" placeholder={`nome do ${label}`} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <input className="input !py-1.5 !text-xs" placeholder="senha temporária" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5">Lojas com acesso</p>
        <div className="space-y-1.5">
          {lojas.map((l) => {
            const perm = access[l.loja_id];
            return (
              <div key={l.loja_id} className="flex items-center justify-between gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!perm} onChange={() => toggleLoja(l.loja_id)} />
                  {l.loja_name}
                </label>
                {perm && (
                  <div className="flex items-center gap-1">
                    {["ver", "gerenciar"].map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => setPermission(l.loja_id, opt)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                          perm === opt ? "bg-navy text-white border-navy" : "border-line text-muted hover:border-navy"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-outline !py-1.5 !text-xs" disabled={creating}>
          {creating ? "Criando…" : `Criar ${label}`}
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] text-muted hover:text-navy">cancelar</button>
      </div>
      {msg && (
        <p className="text-[11px] text-muted flex items-center gap-1.5">
          {msg.startsWith("Erro") ? <AlertTriangle size={11} className="text-danger" /> : <CheckCircle2 size={11} className="text-success" />}
          {msg}
        </p>
      )}
    </form>
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
    <div className="space-y-3">
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

function LojaCard({ loja, allProfiles, onChanged, onOpenDados, empresaId, isOpen, onToggle }) {
  const [openUserId, setOpenUserId] = useState(null);

  const colaboradores = allProfiles.filter((p) => p.loja_id === loja.loja_id && p.role === "colaborador");
  const stale = daysSince(loja.last_activity);
  const neverActive = stale === Infinity;

  const alerts = [];
  if (!loja.gerente_id) alerts.push("sem gerente cadastrado");
  else if (loja.gerente_pending_password) alerts.push("gerente não trocou a senha");
  if (Number(loja.tasks_count) === 0) alerts.push("sem tarefas cadastradas");
  if (Number(loja.goals_count) === 0) alerts.push("sem meta do mês");

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
            <p className="text-xs text-muted">Nenhum gerente cadastrado nesta loja ainda. Use "Cadastrar novo usuário" no topo da página.</p>
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

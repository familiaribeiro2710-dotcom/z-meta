"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import EmpresaDashboard from "../../lib/EmpresaDashboard";
import { greeting } from "../../lib/date";

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [gestores, setGestores] = useState([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);

  const [empresaName, setEmpresaName] = useState("");
  const [gestorName, setGestorName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);

  const greet = greeting();

  const loadAll = useCallback(async () => {
    const { data: empresasRows } = await supabase
      .from("empresas")
      .select("*")
      .order("created_at", { ascending: false });
    setEmpresas(empresasRows || []);
    const { data: gestorRows } = await supabase.from("profiles").select("*").eq("role", "gestor");
    setGestores(gestorRows || []);
  }, []);

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

        <div className="card">
          <p className="label mb-3">🏢 Empresas ({empresas.length})</p>
          <ul className="divide-y divide-line">
            {empresas.map((emp) => {
              const gestor = gestores.find((g) => g.empresa_id === emp.id);
              return (
                <li key={emp.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-navy">{emp.name}</p>
                    <p className="text-xs text-muted">
                      {gestor ? `gestor: ${gestor.full_name} (usuário: ${gestor.username})` : "— nenhum gestor cadastrado —"}
                    </p>
                  </div>
                  <button
                    className="text-xs uppercase tracking-wider text-muted hover:text-navy font-medium"
                    onClick={() => setSelectedEmpresa(emp)}
                  >
                    ver / gerenciar dados →
                  </button>
                </li>
              );
            })}
            {empresas.length === 0 && <p className="text-sm text-muted py-2">Nenhuma empresa cadastrada ainda.</p>}
          </ul>
        </div>

        <ChangePassword />
      </div>
    </AppShell>
  );
}

"use client";
import { useState, useEffect, useCallback } from "react";
import { ListChecks, ChevronDown, ChevronUp, Pencil, Check, X, Plus } from "lucide-react";
import { supabase } from "./supabaseClient";
import SelectField from "./SelectField";
import ConfirmModal from "./ConfirmModal";
import { useSavedNotice } from "./SavedNotice";

// 2026-09-24 (pedido do Felipe): "lista de origem" do lead virou dado de verdade (tabela
// `crm_lead_listas` + `crm_leads.lista_id`) em vez de texto entre parênteses no nome do cliente
// ("Fulano (Lista fria)"). Lista é configuração da EMPRESA (mesmo nível de
// consorcio_produto_categorias): RLS deixa ler qualquer um da empresa e criar/editar só
// master/sócio/supervisor/gerente. FK composta (lista_id, empresa_id) garante no banco que um lead
// nunca aponta pra lista de OUTRA empresa. Sem DELETE — lista sai de uso via `active=false`
// (arquivar), pra não perder a origem dos leads que já estão nela.
//
// Tudo que mexe com lista mora aqui (hook, seletor com "+ Nova lista", card de gerenciar) pra não
// duplicar a mesma lógica em Pipeline/LeadsTab/ColaboradorViewConsorcio.

export const SEM_LISTA = "__sem_lista__";

export function useLeadListas(empresaId) {
  const [listas, setListas] = useState([]);
  const reload = useCallback(async () => {
    if (!empresaId) { setListas([]); return; }
    const { data } = await supabase.from("crm_lead_listas").select("*").eq("empresa_id", empresaId).order("nome");
    setListas(data || []);
  }, [empresaId]);
  useEffect(() => { reload(); }, [reload]);
  return { listas, reload };
}

// Retorna a lista criada (ou a já existente com o mesmo nome, ignorando maiúsculas/espaços —
// o índice único do banco já bloqueia duplicata, aqui só evita mostrar erro à toa).
export async function createLeadLista(empresaId, nome, listasAtuais = []) {
  const clean = nome.trim().replace(/\s+/g, " ");
  if (!clean) return { error: "Digite o nome da lista." };
  const existing = listasAtuais.find((l) => l.nome.trim().toLowerCase() === clean.toLowerCase());
  if (existing) return { lista: existing };
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("crm_lead_listas")
    .insert({ empresa_id: empresaId, nome: clean, created_by: session?.user?.id || null })
    .select()
    .single();
  if (error) return { error: error.code === "23505" ? "Já existe uma lista com esse nome." : "Não foi possível criar a lista." };
  return { lista: data };
}

// Filtro "Lista" (Pipeline / aba Leads). value "" = todas, SEM_LISTA = leads sem lista.
export function ListaFilterSelect({ listas, value, onChange, className = "", selectClassName = "" }) {
  if (!listas.length) return null;
  return (
    <SelectField value={value} onChange={(e) => onChange(e.target.value)} icon={ListChecks} className={className} selectClassName={selectClassName}>
      <option value="">Todas as listas</option>
      {listas.map((l) => (
        <option key={l.id} value={l.id}>{l.nome}{l.active ? "" : " (arquivada)"}</option>
      ))}
      <option value={SEM_LISTA}>Sem lista</option>
    </SelectField>
  );
}

export function matchesListaFilter(lead, filterValue) {
  if (!filterValue) return true;
  if (filterValue === SEM_LISTA) return !lead.lista_id;
  return lead.lista_id === filterValue;
}

// Seletor de lista no cadastro de lead. `canCreate` libera o "+ Nova lista" inline (gestores);
// colaborador só escolhe entre as ativas.
export function ListaPicker({ empresaId, listas, value, onChange, onCreated, canCreate = false }) {
  const [creating, setCreating] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ativas = listas.filter((l) => l.active);

  async function handleCreate() {
    setSaving(true);
    setError("");
    const { lista, error: err } = await createLeadLista(empresaId, novoNome, listas);
    setSaving(false);
    if (err) { setError(err); return; }
    if (onCreated) await onCreated();
    onChange(lista.id);
    setCreating(false);
    setNovoNome("");
  }

  if (creating) {
    return (
      <div>
        <div className="flex gap-2">
          <input
            className="input flex-1 min-w-0"
            placeholder="ex: Anúncios - Instagram"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
            maxLength={60}
            autoFocus
          />
          <button type="button" className="btn whitespace-nowrap" disabled={saving || !novoNome.trim()} onClick={handleCreate}>{saving ? "Salvando…" : "Criar"}</button>
          <button type="button" className="btn-outline" onClick={() => { setCreating(false); setNovoNome(""); setError(""); }} aria-label="Cancelar"><X size={15} /></button>
        </div>
        {error && <p className="text-[11px] font-bold text-danger mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <SelectField className="flex-1" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— sem lista —</option>
        {ativas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </SelectField>
      {canCreate && (
        <button type="button" className="btn-outline whitespace-nowrap inline-flex items-center gap-1" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nova
        </button>
      )}
    </div>
  );
}

// Card "Listas de leads" — criar, renomear, arquivar/reativar. Mesmo visual do card
// "Categorias de produto" do Funil (ConsorcioDashboard.js).
export function LeadListasManager({ empresaId }) {
  const notifySaved = useSavedNotice();
  const { listas, reload } = useLeadListas(empresaId);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!open || !empresaId) return;
    (async () => {
      const { data } = await supabase.from("crm_leads").select("lista_id").eq("empresa_id", empresaId).not("lista_id", "is", null);
      const c = {};
      (data || []).forEach((r) => { c[r.lista_id] = (c[r.lista_id] || 0) + 1; });
      setCounts(c);
    })();
  }, [open, empresaId, listas]);

  async function add(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { error: err } = await createLeadLista(empresaId, nome, listas);
    setSaving(false);
    if (err) { setError(err); return; }
    setNome("");
    notifySaved("Lista criada com sucesso.");
    await reload();
  }

  async function saveEdit(lista) {
    const clean = editNome.trim().replace(/\s+/g, " ");
    if (!clean) return;
    setSavingEdit(true);
    const { error: err } = await supabase.from("crm_lead_listas").update({ nome: clean }).eq("id", lista.id);
    setSavingEdit(false);
    if (err) { setError(err.code === "23505" ? "Já existe uma lista com esse nome." : "Não foi possível salvar."); return; }
    setEditingId(null);
    setError("");
    notifySaved("Lista atualizada com sucesso.");
    await reload();
  }

  async function toggle(lista) {
    const next = !lista.active;
    await supabase.from("crm_lead_listas").update({ active: next }).eq("id", lista.id);
    notifySaved(`Lista "${lista.nome}" ${next ? "reativada" : "arquivada"} com sucesso.`);
    await reload();
  }

  return (
    <div className="card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2">
        <p className="label mb-0 flex items-center gap-1.5"><ListChecks size={14} /> Listas de leads</p>
        {open ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <form onSubmit={add} className="flex gap-2">
            <input className="input flex-1 min-w-0" placeholder="ex: Anúncios - Instagram" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
            <button className="btn whitespace-nowrap" type="submit" disabled={saving || !nome.trim()}>{saving ? "Salvando…" : "Adicionar"}</button>
          </form>
          {error && <p className="text-xs font-bold text-danger">{error}</p>}
          {listas.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma lista criada ainda.</p>
          ) : (
            <ul className="divide-y divide-line">
              {listas.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  {editingId === l.id ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input className="input !py-1 !text-sm flex-1 min-w-0" value={editNome} onChange={(e) => setEditNome(e.target.value)} maxLength={60} autoFocus />
                      <button type="button" onClick={() => saveEdit(l)} disabled={savingEdit} className="p-1.5 rounded-lg text-success hover:bg-success/10 transition-colors shrink-0" title="Salvar" aria-label="Salvar"><Check size={15} /></button>
                      <button type="button" onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-muted hover:bg-line/60 transition-colors shrink-0" title="Cancelar" aria-label="Cancelar"><X size={15} /></button>
                    </div>
                  ) : (
                    <>
                      <span className={`truncate ${l.active ? "text-navy" : "text-muted line-through"}`}>{l.nome}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] text-muted whitespace-nowrap mr-1">{counts[l.id] || 0} lead(s)</span>
                        <button type="button" onClick={() => { setEditingId(l.id); setEditNome(l.nome); }} className="p-1.5 rounded-lg text-muted hover:text-navy hover:bg-line/60 transition-colors" title="Renomear" aria-label="Renomear"><Pencil size={13} /></button>
                        <button type="button" onClick={() => setConfirmToggle(l)} className="text-[11px] font-bold uppercase tracking-wider text-muted hover:text-gold px-1">
                          {l.active ? "arquivar" : "reativar"}
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ConfirmModal
        open={!!confirmToggle}
        title={`${confirmToggle?.active ? "Arquivar" : "Reativar"} "${confirmToggle?.nome || ""}"?`}
        message={confirmToggle?.active
          ? "A lista some das opções de cadastro. Os leads que já estão nela continuam com essa origem e aparecem no filtro."
          : "A lista volta a aparecer nas opções de cadastro de lead."}
        confirmLabel={confirmToggle?.active ? "Arquivar" : "Reativar"}
        danger={!!confirmToggle?.active}
        onConfirm={async () => { await toggle(confirmToggle); setConfirmToggle(null); }}
        onCancel={() => setConfirmToggle(null)}
      />
    </div>
  );
}

export function ListaChip({ nome }) {
  if (!nome) return null;
  return <span className="inline-block max-w-full truncate text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-white/10 text-white/70">{nome}</span>;
}

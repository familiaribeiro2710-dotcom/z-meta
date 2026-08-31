"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ListTodo, Check, Loader2, Zap } from "lucide-react";
import { supabase } from "./supabaseClient";
import { todayStr, isTaskDueOn } from "./date";

// Modal compartilhado (2026-08-31, pedido do Felipe): clicar no número "Atividades pendentes" do
// herocard (gerente/supervisor/sócio, vestuário e consórcio) abre a lista de verdade das tarefas
// de hoje ainda não concluídas, com opção de já marcar como feita ali mesmo — sem precisar entrar
// aba por aba/colaborador por colaborador em "Colaboradores" pra achar quem está pendente.
//
// Escopo vem de fora via `empIds` (já resolvido por cada tela: teamEmps do gerente, ou os
// colaboradores da loja selecionada no caso de sócio/supervisor) + `employeeNameById` (map
// id -> nome, só pra exibir "Fulano — título da tarefa"). O componente busca as tarefas por conta
// própria (não reaproveita o `pendingToday` já calculado no hero, que é só a contagem) — mesma
// regra de negócio de sempre: só tarefas ATIVAS que realmente valem HOJE (`isTaskDueOn`), cruzadas
// com `task_completions` de hoje.
//
// Tarefa tipo 'contatos' (exclusiva de consórcio, sincronizada automaticamente pelo trigger
// `sync_contatos_completions` a partir de `crm_leads`) aparece na lista mas SEM checkbox — dar
// check nela manualmente não faz sentido (o próprio banco marca sozinho conforme o colaborador
// registra ligações) e já é bloqueado no back caso alguém tente. Mostra só um selo "Automático".
//
// RLS já permite gerente marcar tarefa da própria equipe e sócio/supervisor de qualquer loja que
// gerenciem (`completions_insert`/`completions_update` em task_completions, via
// `is_gerente()+is_my_team_member()` ou `can_manage_loja()`) — não precisou de nenhuma migration
// nova pra essa feature, só UI.
export default function PendingActivitiesModal({ open, onClose, empIds = [], employeeNameById = {}, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load() {
    if (!empIds.length) { setItems([]); return; }
    setLoading(true);
    try {
      const today = todayStr();
      const { data: activeTasks } = await supabase
        .from("tasks")
        .select("id, title, task_type, employee_id, recurrence_type, weekday, once_date, start_date")
        .in("employee_id", empIds)
        .eq("active", true);
      const dueToday = (activeTasks || []).filter((t) => isTaskDueOn(t, today));
      const taskIds = dueToday.map((t) => t.id);
      let doneTaskIds = new Set();
      if (taskIds.length) {
        const { data: todayRows } = await supabase
          .from("task_completions")
          .select("task_id, completed")
          .in("task_id", taskIds)
          .eq("completion_date", today);
        doneTaskIds = new Set((todayRows || []).filter((r) => r.completed).map((r) => r.task_id));
      }
      const pending = dueToday
        .filter((t) => !doneTaskIds.has(t.id))
        .map((t) => ({
          id: t.id,
          title: t.title,
          task_type: t.task_type || "checklist",
          employee_id: t.employee_id,
          employee_name: employeeNameById[t.employee_id] || "Colaborador",
        }))
        .sort((a, b) => a.employee_name.localeCompare(b.employee_name) || a.title.localeCompare(b.title));
      setItems(pending);
    } finally {
      setLoading(false);
    }
  }

  async function markDone(item) {
    if (item.task_type === "contatos" || savingId) return;
    setSavingId(item.id);
    try {
      const today = todayStr();
      await supabase.from("task_completions").upsert(
        { task_id: item.id, completion_date: today, completed: true, completed_at: new Date().toISOString() },
        { onConflict: "task_id,completion_date" }
      );
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onChanged?.();
    } finally {
      setSavingId(null);
    }
  }

  function handleClose() {
    onChanged?.();
    onClose();
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 p-4 sm:p-6 pt-[calc(env(safe-area-inset-top)+1rem)]"
      onClick={handleClose}
    >
      <div className="min-h-full flex items-start sm:items-center justify-center">
        <div className="card max-w-md w-full my-8 sm:my-0 animate-bounce-in border-gold/30" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-extrabold text-navy flex items-center gap-2">
            <ListTodo size={20} className="text-gold shrink-0" /> Atividades pendentes hoje
          </h2>
          <p className="text-sm text-muted mt-1">Marque como feita direto por aqui, sem precisar abrir cada colaborador.</p>

          <div className="mt-4 max-h-[55vh] overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <p className="text-sm text-muted flex items-center gap-2 py-6 justify-center"><Loader2 size={16} className="animate-spin" /> Carregando…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted flex items-center gap-1.5 py-6 justify-center">
                <Check size={16} className="text-success" /> Nenhuma atividade pendente hoje. Tudo em dia!
              </p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy truncate">{item.title}</p>
                    <p className="text-[11px] text-muted truncate">{item.employee_name}</p>
                  </div>
                  {item.task_type === "contatos" ? (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted bg-paper border border-line rounded-full px-2 py-1 flex items-center gap-1">
                      <Zap size={11} /> Automático
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => markDone(item)}
                      disabled={savingId === item.id}
                      className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-success border-2 border-success/40 rounded-full px-3 py-1.5 hover:bg-success/10 transition-colors disabled:opacity-50"
                    >
                      {savingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Marcar feito
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <button type="button" className="btn-outline w-full mt-5" onClick={handleClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

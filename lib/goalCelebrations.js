import { supabase } from "./supabaseClient";
import { todayStr, previousMonth } from "./date";

// Helper compartilhado dos modais de "bateu a meta" (individual/loja/online) — ColaboradorView.js,
// ColaboradorViewConsorcio.js, GerenteView.js, GerenteViewConsorcio.js. 2026-09-03, bug real
// corrigido: antes a checagem de "já vi essa comemoração" vivia no localStorage, uma flag por
// DISPOSITIVO — colaborador trocando de aparelho (ou usando um tablet compartilhado da loja, ou
// limpando o cache) nunca tinha a flag naquele navegador, então toda meta já batida no mês
// disparava de uma vez, mesmo tendo sido batida dias atrás. Agora fica em goal_celebration_seen
// (banco), por profile_id de verdade — funciona igual em qualquer aparelho.
//
// `achievedGoals` já vem filtrado (só quem bateu a meta) — essa função só separa quem ainda não
// tinha sido visto e grava a marca de visto pros que vão entrar na fila de comemoração agora.
export async function filterNewlyAchievedGoals({ profileId, month, kind, achievedGoals }) {
  if (!achievedGoals || !achievedGoals.length) return [];
  const { data: seenRows } = await supabase
    .from("goal_celebration_seen")
    .select("goal_id")
    .eq("profile_id", profileId)
    .eq("month", month)
    .eq("kind", kind)
    .in("goal_id", achievedGoals.map((g) => g.id));
  const seenIds = new Set((seenRows || []).map((r) => r.goal_id));
  const newly = achievedGoals.filter((g) => !seenIds.has(g.id));
  if (newly.length) {
    await supabase.from("goal_celebration_seen").upsert(
      newly.map((g) => ({ profile_id: profileId, month, kind, goal_id: g.id })),
      { onConflict: "profile_id,month,kind,goal_id", ignoreDuplicates: true }
    );
  }
  return newly;
}

// Modal "a loja bateu a meta" — 2026-09-30, bug real corrigido: antes disparava no meio do mês,
// avaliado sobre o estado da tela (goalsList + hero.soldLoja do mês SELECIONADO). Trocando de mês
// e voltando, as metas do mês corrente chegavam antes do soldLoja (vários awaits entre um
// setState e outro) e eram comparadas com o vendido do mês ANTERIOR — loja com R$269k "batia" a
// Hiper Meta de R$350k. Regra nova (decisão do Felipe): esse modal só dispara DEPOIS que o mês
// fecha no calendário, uma única vez por pessoa/mês/nível, no primeiro acesso dela. Avalia
// sempre o mês anterior ao corrente com fetch próprio (nunca estado de tela), então mudar o mês
// selecionado não interfere. Cada view passa os próprios loaders pra manter a MESMA definição
// de "vendido da loja" que já usa no herocard.
export async function closedMonthStoreGoalCelebrations({ profileId, loadGoals, loadSold }) {
  const month = previousMonth(todayStr());
  const goals = (await loadGoals(month)) || [];
  if (!goals.length) return [];
  const sold = Number(await loadSold(month)) || 0;
  const achieved = goals.filter((g) => sold >= Number(g.store_total || 0));
  const newly = await filterNewlyAchievedGoals({ profileId, month, kind: "loja", achievedGoals: achieved });
  return newly.map((g) => ({ ...g, month }));
}

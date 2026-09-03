import { supabase } from "./supabaseClient";

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

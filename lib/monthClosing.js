import { supabase } from "./supabaseClient";
import { previousMonth, todayStr, monthLabel } from "./date";

// Helpers compartilhados do ritual de fechamento de mês (GerenteView.js, HierarchyHome.js
// role=supervisor, ColaboradorView.js) — exclusivo do segmento vestuário. Mantidos num só lugar
// pra não duplicar a mesma query em 3 arquivos.

// Mês "a fechar": sempre o anterior ao mês corrente (America/Sao_Paulo), do dia 1 até o fim do
// mês corrente inteiro — não é só no dia 1, o gerente/supervisor continua sendo perguntado até
// confirmar, por decisão explícita do Felipe.
export function closingTargetMonth() {
  return previousMonth(todayStr());
}

export function closingTargetMonthLabel() {
  return monthLabel(closingTargetMonth());
}

// true se essa pessoa (gerente ou supervisor) ainda não confirmou o fechamento do mês alvo.
export async function needsClosingAsk(profileId) {
  const month = closingTargetMonth();
  const { data } = await supabase
    .from("monthly_closing_confirmations")
    .select("id")
    .eq("profile_id", profileId)
    .eq("month", month)
    .maybeSingle();
  return !data;
}

// Linhas de premiação ainda não vistas por essa pessoa, pro mês alvo e escopo (colaborador ou
// gerente). Normalmente 0 ou 1 linha (cada pessoa só ganha uma posição por mês/escopo).
export async function unseenClosingWinners(profileId, scope) {
  const month = closingTargetMonth();
  const { data } = await supabase
    .from("monthly_closing_winners")
    .select("id, position, sold")
    .eq("profile_id", profileId)
    .eq("month", month)
    .eq("scope", scope)
    .is("seen_at", null)
    .order("position", { ascending: true });
  return data || [];
}

export async function markClosingWinnerSeen(winnerId) {
  await supabase.from("monthly_closing_winners").update({ seen_at: new Date().toISOString() }).eq("id", winnerId);
}

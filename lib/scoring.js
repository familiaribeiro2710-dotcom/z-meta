export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// % individual do mês: tarefas concluídas / esperadas, menos desconto fixo por advertência.
export function calcIndividualPct({ completed, expected, warningsCount, penaltyPerWarning }) {
  const base = expected > 0 ? (completed / expected) * 100 : 100;
  const withPenalty = base - warningsCount * penaltyPerWarning;
  return clamp(withPenalty, 0, 100);
}

export function calcTeamPct(individualPcts) {
  if (!individualPcts.length) return 0;
  const sum = individualPcts.reduce((a, b) => a + b, 0);
  return clamp(sum / individualPcts.length, 0, 100);
}

export function formatBRL(n) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPct(n) {
  return `${(n || 0).toFixed(1)}%`;
}

// Metas são níveis (Meta, Super Meta, Hiper Meta…), NÃO somam. O valor "em jogo" pra barra de
// progresso / meta de hoje é sempre o próximo nível ainda não batido; uma vez que todos os níveis
// já foram batidos, fica valendo o último deles (não some, e não volta a ser R$0).
// `sortedTotals` precisa estar em ordem crescente (do menor pro maior valor).
export function currentGoalTarget(sortedTotals, sold) {
  const totals = (sortedTotals || []).map(Number).filter((n) => !Number.isNaN(n));
  if (!totals.length) return 0;
  const next = totals.find((t) => Number(sold || 0) < t);
  return next !== undefined ? next : totals[totals.length - 1];
}

import { Trophy, Flame, TrendingUp, Zap, Rocket } from "lucide-react";

export function motivationalMessage(pct) {
  if (pct >= 100) return { text: "Perfeito! Dia impecável.", Icon: Trophy };
  if (pct >= 80) return { text: "Mandando bem! Continua assim.", Icon: Flame };
  if (pct >= 50) return { text: "Na média, dá pra melhorar hoje.", Icon: TrendingUp };
  if (pct > 0) return { text: "Bora acelerar, o dia ainda não acabou.", Icon: Zap };
  return { text: "Ainda não começou hoje — vamos!", Icon: Rocket };
}

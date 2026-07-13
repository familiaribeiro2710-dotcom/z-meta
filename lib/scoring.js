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

import { Trophy, Flame, TrendingUp, Zap, Rocket } from "lucide-react";

export function motivationalMessage(pct) {
  if (pct >= 100) return { text: "Perfeito! Dia impecável.", Icon: Trophy };
  if (pct >= 80) return { text: "Mandando bem! Continua assim.", Icon: Flame };
  if (pct >= 50) return { text: "Na média, dá pra melhorar hoje.", Icon: TrendingUp };
  if (pct > 0) return { text: "Bora acelerar, o dia ainda não acabou.", Icon: Zap };
  return { text: "Ainda não começou hoje — vamos!", Icon: Rocket };
}

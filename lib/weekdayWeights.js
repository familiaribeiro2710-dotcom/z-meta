"use client";
// 2026-10-06/12 (pedido do Felipe): meta da LOJA distribuída pelo peso do dia da semana — só
// vestuário. Dias que historicamente vendem mais (ex.: sábado) pedem mais; a meta INDIVIDUAL do
// colaborador continua linear, sem mudança nenhuma.
// - Pesos: por loja, últimos 90 dias de venda (RPC get_loja_weekday_weights, que também devolve a
//   chave `app_settings.weekday_weights_enabled` e os dias de uso).
// - Só fica disponível com 60+ dias de uso (contados do 1º lançamento de venda da loja).
// - Só gerente pra cima liga/desliga (card na aba Metas → Metas do mês).
// Se a RPC não existir (migração ainda não aplicada) ou falhar, tudo cai no cálculo linear antigo.
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "./supabaseClient";
import { todayStr, goalPeriods, weekdayOf, daysInMonth } from "./date";
import { useSavedNotice } from "./SavedNotice";

export const WEEKDAY_WEIGHTS_MIN_DAYS = 60;
const DOW_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Seg → Dom
const BAR_MAX_PX = 90; // altura da maior barra no gráfico (área útil de 112px, sobra pro rótulo de %)

function parseWeekdayWeights(raw) {
  const avgs = Array(7).fill(0);
  (raw?.by_dow || []).forEach((r) => { avgs[Number(r.dow)] = Number(r.avg) || 0; });
  const sum = avgs.reduce((s, a) => s + a, 0);
  const daysOfUse = Number(raw?.days_of_use) || 0;
  const available = daysOfUse >= WEEKDAY_WEIGHTS_MIN_DAYS && sum > 0;
  const enabled = !!raw?.enabled;
  return {
    loaded: true,
    error: false,
    enabled,
    available,
    active: enabled && available,
    daysOfUse,
    daysToUnlock: Math.max(0, WEEKDAY_WEIGHTS_MIN_DAYS - daysOfUse),
    // peso relativo ao dia médio (média dos 7 = 1); dia sem venda no histórico = 0
    weights: sum > 0 ? avgs.map((a) => a / (sum / 7)) : null,
    // fatia de uma semana típica (soma = 1) — é o que o gráfico mostra
    shares: sum > 0 ? avgs.map((a) => a / sum) : null,
  };
}

const EMPTY = { loaded: false, error: false, enabled: false, available: false, active: false, daysOfUse: 0, daysToUnlock: WEEKDAY_WEIGHTS_MIN_DAYS, weights: null, shares: null };

export function useWeekdayWeights(lojaId, today = todayStr()) {
  const [state, setState] = useState(EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!lojaId) { setState(EMPTY); return; }
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_loja_weekday_weights", { p_loja: lojaId, p_today: today });
      if (!alive) return;
      setState(error || !data ? { ...EMPTY, loaded: true, error: true } : parseWeekdayWeights(data));
    })();
    return () => { alive = false; };
  }, [lojaId, today, reloadKey]);
  return { ...state, reload: () => setReloadKey((k) => k + 1) };
}

function addDay(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Fração do que falta da meta do mês que cabe ao período atual (hoje, no ritmo "dia"; o resto da
// semana/quinzena/estágio atual nas outras réguas), pesada pelo dia da semana. Substitui o
// `1 / remaining` do cálculo linear. null = sem peso utilizável → quem chama cai no linear.
export function weightedPeriodShare(monthArg, todayArg, pacing, weights) {
  if (!weights || !todayArg || todayArg.slice(0, 7) !== monthArg.slice(0, 7)) return null;
  const last = `${monthArg.slice(0, 7)}-${String(daysInMonth(monthArg)).padStart(2, "0")}`;
  let periodEnd = todayArg;
  if (pacing && pacing !== "dia") {
    const p = goalPeriods(monthArg, pacing).find((x) => todayArg >= x.start && todayArg <= x.end);
    periodEnd = p ? p.end : last;
  }
  let num = 0;
  let den = 0;
  for (let d = todayArg; d <= last; d = addDay(d)) {
    const w = weights[weekdayOf(d)] || 0;
    den += w;
    if (d <= periodEnd) num += w;
  }
  return den > 0 ? num / den : null;
}

export function WeekdayWeightsCard({ lojaId, ww, canToggle }) {
  const notifySaved = useSavedNotice();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  if (!lojaId || !ww?.loaded || ww.error) return null;

  async function toggle() {
    if (!canToggle || saving) return;
    setSaving(true);
    setErr("");
    const { error } = await supabase.from("app_settings").update({ weekday_weights_enabled: !ww.enabled }).eq("loja_id", lojaId);
    setSaving(false);
    if (error) { setErr("Não foi possível salvar. Tente de novo."); return; }
    notifySaved();
    ww.reload();
  }

  const maxShare = ww.shares ? Math.max(...ww.shares) : 0;
  const avgShare = 1 / 7;

  return (
    <div className="card">
      <p className="label mb-1">Ritmo da meta da loja</p>
      {!ww.available ? (
        <div className="flex gap-3 items-start mt-2 rounded-xl bg-paper p-3">
          <Lock size={16} className="text-muted shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-navy">Disponível em {ww.daysToUnlock} dia{ww.daysToUnlock !== 1 ? "s" : ""}</p>
            <p className="text-[11px] text-muted mt-0.5">Precisamos de {WEEKDAY_WEIGHTS_MIN_DAYS} dias de vendas da loja pra calcular o peso de cada dia com segurança. Hoje: {ww.daysOfUse} dia{ww.daysOfUse !== 1 ? "s" : ""}.</p>
            <div className="h-1.5 rounded-full bg-line mt-2 overflow-hidden">
              <div className="h-full bg-gold rounded-full" style={{ width: `${Math.min(100, (ww.daysOfUse / WEEKDAY_WEIGHTS_MIN_DAYS) * 100)}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 mt-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-navy">Distribuir pelo peso do dia da semana</p>
              <p className="text-[11px] text-muted mt-0.5">Dias que vendem mais pedem mais. Vale só pra meta da loja — a meta individual continua igual.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={ww.enabled}
              aria-label="Distribuir a meta da loja pelo peso do dia da semana"
              onClick={toggle}
              disabled={!canToggle || saving}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${ww.enabled ? "bg-gold" : "bg-line"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${ww.enabled ? "translate-x-5" : ""}`} />
            </button>
          </div>
          {err && <p className="text-xs text-danger mt-2">{err}</p>}

          <div className={`mt-4 transition-opacity ${ww.enabled ? "" : "opacity-50"}`}>
            <div className="relative flex items-end gap-1.5 h-32 pt-4">
              <div className="absolute left-0 right-0 border-t border-dashed border-muted/50" style={{ bottom: `${(avgShare / maxShare) * BAR_MAX_PX}px` }} />
              {DISPLAY_ORDER.map((dow) => {
                const share = ww.shares[dow];
                const isTop = share === maxShare;
                return (
                  <div key={dow} className="relative z-10 flex-1 h-full flex flex-col items-center justify-end">
                    <span className="text-[10px] font-extrabold text-navy mb-0.5">{(share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                    <div className={`w-full rounded-t-md ${isTop ? "bg-gold" : "bg-navy"}`} style={{ height: `${(share / maxShare) * BAR_MAX_PX}px` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1">
              {DISPLAY_ORDER.map((dow) => <span key={dow} className="flex-1 text-center text-[10px] font-bold text-muted">{DOW_SHORT[dow]}</span>)}
            </div>
            <p className="text-[11px] text-muted mt-2">Quanto cada dia representa numa semana típica da loja. Tracejado = dia médio (14,3%). Base: últimos 90 dias de venda, recalculado todo dia.</p>
          </div>
        </>
      )}
    </div>
  );
}

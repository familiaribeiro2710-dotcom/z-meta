"use client";
// 2026-10-12 redesign (mockup MOCKUP_REDESIGN.html): barra única do mês dentro do herocard, com
// as camadas (Meta / Super Meta / Hiper Meta…) marcadas — mostra de relance onde a loja (ou o
// colaborador) está e quanto falta pra próxima camada ainda não batida. Feita pra fundo navy
// (.hero-card). `tiers` = [{ name, total }] em qualquer ordem.
import { formatBRL } from "./scoring";

function shortK(v) {
  return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
}

export default function TierBar({ sold, tiers, soldLabel = "Vendido no mês" }) {
  const list = (tiers || []).filter((t) => Number(t.total) > 0).sort((a, b) => Number(a.total) - Number(b.total));
  if (!list.length) return null;
  const top = Number(list[list.length - 1].total);
  const max = top * 1.04;
  const s = Number(sold || 0);
  const next = list.find((t) => s < Number(t.total));
  return (
    <div className="relative mt-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap text-[11.5px] font-semibold text-white/65 mb-2">
        <span>{soldLabel} <b className="text-white font-extrabold">{formatBRL(s)}</b></span>
        <span>
          {next
            ? <>faltam <b className="text-white font-extrabold">{formatBRL(Number(next.total) - s)}</b> p/ {next.name}</>
            : <b className="text-goldlight font-extrabold">Todas as camadas batidas</b>}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (s / max) * 100)}%`, background: "linear-gradient(90deg, #c9a15a, #e4c789)" }} />
        {list.map((t) => (
          <span key={t.name + t.total} className="absolute -top-1 -bottom-1 w-0.5 rounded bg-white/35" style={{ left: `${(Number(t.total) / max) * 100}%` }} />
        ))}
      </div>
      <div className="flex gap-x-4 gap-y-1.5 flex-wrap mt-3 text-[11.5px] font-semibold text-white/60">
        {list.map((t) => {
          const hit = s >= Number(t.total);
          const isNext = t === next;
          return (
            <span key={t.name + t.total} className="flex items-center gap-1.5 whitespace-nowrap">
              <i className={`w-2 h-2 rounded-full border-[1.5px] ${hit ? "bg-goldlight border-goldlight" : isNext ? "border-goldlight" : "border-white/40"}`} />
              {t.name} <b className="text-white font-extrabold">{shortK(Number(t.total))}</b>
            </span>
          );
        })}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import Led from "./Led";

export function tierFor(pct, threshold) {
  const t = threshold != null ? threshold : 80;
  if (pct >= t) return { gradient: "linear-gradient(90deg, #84cc16, #0d9488)", led: "green" };
  if (pct >= t * 0.5) return { gradient: "linear-gradient(90deg, #f97316, #ec4899)", led: "yellow" };
  return { gradient: "linear-gradient(90deg, #dc2626, #ec4899)", led: "red" };
}

// 2026-07-23: a barra (e o número do rótulo) contam do zero até o valor real toda vez que o
// componente monta, em vez de já aparecer preenchida. Como os dashboards remontam esse
// componente a cada troca de aba (`{tab === "x" && <EmpresaDashboard />}`), o efeito repete
// sozinho toda vez que a tela é reaberta, sem precisar de nenhum gatilho extra. Em atualizações
// posteriores (troca de mês, novo dado chegando) anima suavemente do valor anterior pro novo —
// nunca reseta pra zero de novo, pra não piscar a cada refresh de dado.
export default function ProgressBar({ pct, height = "h-3.5", showLabel = true, threshold }) {
  const target = Math.max(0, Math.min(100, pct || 0));
  const { gradient, led } = tierFor(target, threshold);

  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const prevRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    const from = mountedRef.current ? prevRef.current : 0;
    const to = target;
    mountedRef.current = true;
    const start = performance.now();
    const duration = 900;
    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = from + (to - from) * eased;
      setDisplay(val);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setDisplay(to);
        prevRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <div>
      <div className={`w-full ${height} bg-line rounded-full overflow-hidden`}>
        <div
          className="h-full rounded-full"
          style={{ width: `${display}%`, background: gradient }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between items-center text-[11px] text-muted mt-1.5 font-medium">
          <span className="flex items-center gap-1.5"><Led color={led} /> {display.toFixed(1)}%</span>
          {threshold != null && <span>meta: {threshold}%</span>}
        </div>
      )}
    </div>
  );
}

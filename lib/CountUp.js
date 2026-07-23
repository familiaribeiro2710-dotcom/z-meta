"use client";
import { useEffect, useRef, useState } from "react";

// Anima um número de 0 (na primeira montagem) ou do valor anterior (em atualizações seguintes)
// até `value`, com desaceleração suave — mesmo padrão de ProgressBar.js, deliberadamente
// consistente. Formata com toLocaleString("pt-BR") pra separador de milhar igual ao resto do
// app (formatBRL já cuida do "R$"/decimais em valores monetários — aqui é só o número).
//
// Importante: NÃO usar dentro de AutoFitText.js. AutoFitText mede scrollWidth/clientWidth do
// texto real pra encolher a fonte, e um número mudando a cada frame faria essa medição/ajuste
// rodar continuamente durante a animação (jank visível, fonte "tremendo" de tamanho). Para os
// números grandes de herocard que já usam AutoFitText, o efeito de abertura fica só no
// reveal-up (fade/slide, puro opacity+transform) do card em volta — não no valor em si.
export default function CountUp({ value, duration = 900, decimals = 0, prefix = "", suffix = "", currency = false }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const prevRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    const from = mountedRef.current ? prevRef.current : 0;
    const to = target;
    mountedRef.current = true;
    const start = performance.now();
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
  }, [target, duration]);

  if (currency) {
    // Mesmo formato de formatBRL() (lib/scoring.js) — "R$ 1.234,56" — pra ficar idêntico ao
    // valor final estático depois que a animação termina.
    return <>{display.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</>;
  }

  const formatted = decimals === 0
    ? Math.round(display).toLocaleString("pt-BR")
    : display.toFixed(decimals);

  return <>{prefix}{formatted}{suffix}</>;
}

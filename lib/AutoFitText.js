"use client";
import { useLayoutEffect, useRef, useState } from "react";

// Regra geral do app: nenhum valor/texto de tamanho variável (moeda, percentual, contador, nome)
// pode quebrar em duas linhas nem vazar do card — em vez disso, a fonte encolhe automaticamente
// até caber numa linha só. Necessário porque empresas diferentes têm metas de R$ 10.000 a
// R$ 1.000.000+, e o mesmo layout precisa dar conta de qualquer um desses tamanhos, em qualquer
// dashboard, em qualquer tela (mobile ou desktop).
//
// Como funciona: mede a largura natural do texto (scrollWidth) contra a largura disponível do
// contêiner (clientWidth). Se não couber, faz uma estimativa proporcional rápida e depois
// CONFIRMA de verdade — reduzindo px a px e remedindo scrollWidth em cada passo — até realmente
// caber (ou bater no mínimo). Isso corrige na hora qualquer erro da estimativa (kerning,
// hinting, fonte ainda não carregada etc.), em vez de confiar cegamente numa fórmula linear.
// Reage a mudanças de conteúdo e de tamanho do contêiner (ResizeObserver) — inclusive ao
// redimensionar a janela ou girar o celular — e reforça o cálculo de novo quando a fonte do
// app (Inter, via @fontsource) termina de carregar, caso a primeira medição tenha rodado cedo
// demais e usado a fonte de fallback do navegador.
export default function AutoFitText({ children, className = "", as: Tag = "span", minPx = 10 }) {
  const wrapRef = useRef(null);
  const [fontSize, setFontSize] = useState(null); // null = usa o tamanho natural definido via className

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    function fit() {
      // volta ao tamanho natural antes de medir, senão a medição herda o ajuste da rodada anterior
      el.style.fontSize = "";
      const containerWidth = el.clientWidth;
      if (!containerWidth) return;
      const naturalFontSize = parseFloat(getComputedStyle(el).fontSize) || 16;
      const naturalTextWidth = el.scrollWidth;
      if (!naturalTextWidth || naturalTextWidth <= containerWidth) {
        setFontSize(null);
        return;
      }

      // estimativa rápida (proporcional, com 5% de margem de segurança)...
      let size = Math.max(minPx, Math.floor(naturalFontSize * (containerWidth / naturalTextWidth) * 0.95));
      el.style.fontSize = `${size}px`;
      // ...e confirmação de verdade: remede o scrollWidth REAL depois de aplicar o tamanho (força
      // reflow síncrono) e continua reduzindo px a px enquanto ainda não couber. Convergindo pelo
      // valor medido de verdade em vez de só confiar na fórmula, o resultado sempre bate com a
      // fonte que está realmente ativa nesse instante — não importa se é a fonte de fallback (antes
      // da Inter carregar) ou a Inter de verdade.
      let guard = 24;
      while (el.scrollWidth > containerWidth && size > minPx && guard-- > 0) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
      setFontSize(size);
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) fit();
      });
    }

    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, minPx]);

  return (
    <Tag
      ref={wrapRef}
      className={`block max-w-full whitespace-nowrap overflow-hidden ${className}`}
      style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
    >
      {children}
    </Tag>
  );
}

"use client";
import { useLayoutEffect, useRef, useState } from "react";

// Regra geral do app: nenhum valor/texto de tamanho variável (moeda, percentual, contador, nome)
// pode quebrar em duas linhas nem vazar do card — em vez disso, a fonte encolhe automaticamente
// até caber numa linha só. Necessário porque empresas diferentes têm metas de R$ 10.000 a
// R$ 1.000.000+, e o mesmo layout precisa dar conta de qualquer um desses tamanhos, em qualquer
// dashboard, em qualquer tela (mobile ou desktop).
//
// Como funciona: mede a largura natural do texto (scrollWidth) contra a largura disponível do
// contêiner (clientWidth). Se não couber, calcula um font-size proporcional que faz caber, com uma
// margem de segurança de 3%, respeitando um tamanho mínimo (minPx) pra nunca ficar ilegível.
// Reagе a mudanças de conteúdo e de tamanho do contêiner (ResizeObserver) — inclusive ao redimensionar
// a janela ou girar o celular.
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
      const naturalFontSize = parseFloat(getComputedStyle(el).fontSize) || 16;
      const textWidth = el.scrollWidth;
      if (!containerWidth || !textWidth || textWidth <= containerWidth) {
        setFontSize(null);
        return;
      }
      const target = Math.max(minPx, Math.floor(naturalFontSize * (containerWidth / textWidth) * 0.97));
      setFontSize(target);
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
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

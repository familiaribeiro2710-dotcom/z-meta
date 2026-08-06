// 2026-08-06 — logo atualizada pra identidade navy+gold (2026-07). Antes usava um gradiente
// roxo→rosa (#7c3aed→#ec4899) que era resquício da paleta anterior ao rebrand — o resto do app
// inteiro já roda em navy+gold há semanas, mas a marca em si (o elemento mais repetido: header,
// footer, tela de login, imagem de compartilhamento) continuava na paleta antiga. Ver
// CLAUDE.md seção 7: roxo→rosa agora é reservado só pra comemoração (.btn-hype/.gradient-text),
// nunca pra marca. Anel externo navy, anel interno + centro + seta em gold — mesmo traço/proporção
// de antes, só a cor mudou.
export default function Logo({ size = "md" }) {
  const dims = { sm: 30, md: 38, lg: 56 }[size] || 38;
  const text = { sm: "text-base", md: "text-xl", lg: "text-3xl" }[size] || "text-xl";
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width={dims} height={dims} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="56" fill="none" stroke="#12203a" strokeWidth="7" />
        <circle cx="60" cy="60" r="38" fill="none" stroke="#c9a15a" strokeWidth="7" />
        <circle cx="60" cy="60" r="15" fill="#c9a15a" />
        <path d="M22 98 L100 20" stroke="#f5f3ee" strokeWidth="10" strokeLinecap="round" />
        <path d="M22 98 L100 20" stroke="#12203a" strokeWidth="4" strokeLinecap="round" />
        <path d="M100 20 L82 24 L96 38 Z" fill="#c9a15a" />
      </svg>
      <span className={`font-extrabold tracking-tight ${text} text-navy`}>Z META</span>
    </div>
  );
}

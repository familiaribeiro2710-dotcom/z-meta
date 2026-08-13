/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#12203a",
        navylight: "#1c2e4d",
        gold: "#c9a15a",
        goldlight: "#e4c789",
        paper: "#f5f3ee",
        line: "#e7e3d9",
        muted: "#7d7a6f",
        success: "#16a34a",
        warn: "#d97706",
        danger: "#dc2626",
        // paleta vibrante (gamificação)
        purple: "#7c3aed",
        purplelight: "#c4b5fd",
        blue: "#2563eb",
        bluelight: "#93c5fd",
        orange: "#f97316",
        orangelight: "#fdba74",
        pink: "#ec4899",
        pinklight: "#f9a8d4",
        teal: "#0d9488",
        teallight: "#5eead4",
        lime: "#84cc16",
      },
      fontFamily: {
        sans: ["Inter", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        // 2026-08-12: bordas de .card/.input ficaram mais finas (border-2 → border), então a
        // sombra passa a carregar mais a sensação de profundidade — valores levemente mais
        // presentes que antes, ainda sutis (não é "cartão flutuando", é "cartão de app nativo").
        soft: "0 1px 2px rgba(18,32,58,0.05), 0 6px 16px rgba(18,32,58,0.06)",
        card: "0 4px 12px rgba(18,32,58,0.06), 0 14px 32px rgba(18,32,58,0.10)",
        pop: "0 8px 24px rgba(124,58,237,0.18)",
        // nova identidade: dourado vira a sombra de destaque padrão (botão/ação principal);
        // "pop" (roxo→rosa) fica reservada só pros botões de comemoração (.btn-hype).
        popgold: "0 8px 22px rgba(201,161,90,0.35)",
        navycard: "0 4px 20px rgba(0,0,0,0.25)",
      },
      borderRadius: {
        // 2026-08-12 (pedido do Felipe: padronizar cantos/bordas em todo o app — "visual fraco",
        // cantos inconsistentes entre componentes). 3xl era 1.75rem (28px) — cantos grandes demais,
        // contribuindo pra sensação de wireframe/maquete em vez de app de verdade. Reduzido pra
        // 1.25rem (20px): ainda claramente "cartão arredondado", mas mais contido/moderno. Como
        // TODO .card e toda a maioria dos cartões ad hoc do app usam a classe rounded-3xl (ou .card,
        // que consome esse token), essa única mudança já re-estiliza o app inteiro sem tocar em
        // cada arquivo individualmente.
        "3xl": "1.25rem",
        "4xl": "2.25rem",
      },
    },
  },
  plugins: [],
};

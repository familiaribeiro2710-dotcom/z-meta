/** @type {import('tailwindcss').Config} */

// Tokens que precisam flipar entre claro/escuro viram CSS variables (definidas em
// app/globals.css, :root e :root.dark) em vez de hex fixo. `navy` continua sendo o texto/
// primário padrão do app (flipa pra claro no dark mode) — quem precisa ficar SEMPRE escuro
// (headers, hero cards, botões sobre fundo dourado) usa o novo token fixo `navyfixed`.
function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variableName}) / ${opacityValue})`;
    }
    return `rgb(var(${variableName}))`;
  };
}

module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: withOpacity("--color-navy"),
        navyfixed: "#12203a",
        navylight: "#1c2e4d",
        gold: "#c9a15a",
        goldlight: "#e4c789",
        paper: withOpacity("--color-paper"),
        line: withOpacity("--color-line"),
        muted: withOpacity("--color-muted"),
        surface: withOpacity("--color-surface"),
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
        soft: "0 2px 10px rgba(18,32,58,0.06)",
        card: "0 4px 20px rgba(18,32,58,0.08)",
        pop: "0 8px 24px rgba(124,58,237,0.18)",
        // nova identidade: dourado vira a sombra de destaque padrão (botão/ação principal);
        // "pop" (roxo→rosa) fica reservada só pros botões de comemoração (.btn-hype).
        popgold: "0 8px 22px rgba(201,161,90,0.35)",
        navycard: "0 4px 20px rgba(0,0,0,0.25)",
      },
      borderRadius: {
        "3xl": "1.75rem",
        "4xl": "2.25rem",
      },
    },
  },
  plugins: [],
};

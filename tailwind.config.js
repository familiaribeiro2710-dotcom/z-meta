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
        soft: "0 2px 10px rgba(18,32,58,0.06)",
        card: "0 4px 20px rgba(18,32,58,0.08)",
        pop: "0 8px 24px rgba(124,58,237,0.18)",
      },
      borderRadius: {
        "3xl": "1.75rem",
        "4xl": "2.25rem",
      },
    },
  },
  plugins: [],
};

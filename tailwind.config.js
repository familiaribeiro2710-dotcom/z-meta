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
      },
      fontFamily: {
        sans: ["Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 10px rgba(18,32,58,0.06)",
        card: "0 4px 20px rgba(18,32,58,0.08)",
      },
    },
  },
  plugins: [],
};

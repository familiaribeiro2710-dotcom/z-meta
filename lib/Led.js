// Indicador estilo LED — bolinha com brilho, usada no lugar dos emojis
// de status (🟢🟡🔴) em barras de progresso, alertas e listas de risco.
const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  purple: "#7c3aed",
  gray: "#a8a29e",
};

export default function Led({ color = "green", size = 8, pulse = false }) {
  const hex = COLORS[color] || color;
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${pulse ? "animate-pulse" : ""}`}
      style={{
        width: size,
        height: size,
        background: hex,
        boxShadow: `0 0 6px 1px ${hex}99, 0 0 0 2px ${hex}22`,
      }}
    />
  );
}

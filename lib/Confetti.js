"use client";

const COLORS = ["#7c3aed", "#ec4899", "#f97316", "#0d9488", "#2563eb", "#c9a15a", "#84cc16"];

export default function Confetti({ count = 70 }) {
  const pieces = Array.from({ length: count }, (_, i) => {
    const left = Math.random() * 100;
    const color = COLORS[i % COLORS.length];
    const size = 6 + Math.random() * 7;
    const duration = 1.8 + Math.random() * 1.6;
    const delay = Math.random() * 0.5;
    const rounded = Math.random() > 0.5;
    return { id: i, left, color, size, duration, delay, rounded };
  });

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[60]" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.4,
            backgroundColor: p.color,
            borderRadius: p.rounded ? "9999px" : "2px",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

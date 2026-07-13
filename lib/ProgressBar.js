export function tierFor(pct, threshold) {
  const t = threshold != null ? threshold : 80;
  if (pct >= t) return { gradient: "linear-gradient(90deg, #84cc16, #0d9488)", emoji: "🟢" };
  if (pct >= t * 0.5) return { gradient: "linear-gradient(90deg, #f97316, #ec4899)", emoji: "🟡" };
  return { gradient: "linear-gradient(90deg, #dc2626, #ec4899)", emoji: "🔴" };
}

export default function ProgressBar({ pct, height = "h-3.5", showLabel = true, threshold }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const { gradient, emoji } = tierFor(clamped, threshold);
  return (
    <div>
      <div className={`w-full ${height} bg-line rounded-full overflow-hidden`}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${clamped}%`, background: gradient }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-[11px] text-muted mt-1.5 font-medium">
          <span>{emoji} {clamped.toFixed(1)}%</span>
          {threshold != null && <span>meta: {threshold}%</span>}
        </div>
      )}
    </div>
  );
}

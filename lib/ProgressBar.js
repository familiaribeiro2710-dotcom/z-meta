export function tierFor(pct, threshold) {
  const t = threshold != null ? threshold : 80;
  if (pct >= t) return { color: "bg-success", emoji: "🟢" };
  if (pct >= t * 0.5) return { color: "bg-warn", emoji: "🟡" };
  return { color: "bg-danger", emoji: "🔴" };
}

export default function ProgressBar({ pct, height = "h-3", showLabel = true, threshold }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const { color, emoji } = tierFor(clamped, threshold);
  return (
    <div>
      <div className={`w-full ${height} bg-line rounded-full overflow-hidden`}>
        <div
          className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-[11px] text-muted mt-1.5">
          <span>{emoji} {clamped.toFixed(1)}%</span>
          {threshold != null && <span>meta: {threshold}%</span>}
        </div>
      )}
    </div>
  );
}

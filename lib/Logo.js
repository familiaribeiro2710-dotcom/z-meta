export default function Logo({ size = "md" }) {
  const dims = { sm: 30, md: 38, lg: 56 }[size] || 38;
  const text = { sm: "text-base", md: "text-xl", lg: "text-3xl" }[size] || "text-xl";
  const gradId = `zmetaGrad-${size}`;
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width={dims} height={dims} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7c3aed" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="56" fill="none" stroke={`url(#${gradId})`} strokeWidth="7" />
        <circle cx="60" cy="60" r="38" fill="none" stroke={`url(#${gradId})`} strokeWidth="7" />
        <circle cx="60" cy="60" r="15" fill={`url(#${gradId})`} />
        <path d="M22 98 L100 20" stroke="#f5f3ee" strokeWidth="10" strokeLinecap="round" />
        <path d="M22 98 L100 20" stroke={`url(#${gradId})`} strokeWidth="4" strokeLinecap="round" />
        <path d="M100 20 L82 24 L96 38 Z" fill={`url(#${gradId})`} />
      </svg>
      <span className={`font-extrabold tracking-tight ${text} gradient-text`}>Z META</span>
    </div>
  );
}

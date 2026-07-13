export default function Logo({ size = "md" }) {
  const dims = { sm: 30, md: 38, lg: 56 }[size] || 38;
  const text = { sm: "text-base", md: "text-xl", lg: "text-3xl" }[size] || "text-xl";
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width={dims} height={dims} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="56" fill="none" stroke="#12203a" strokeWidth="7" />
        <circle cx="60" cy="60" r="38" fill="none" stroke="#12203a" strokeWidth="7" />
        <circle cx="60" cy="60" r="15" fill="#c9a15a" />
        <path d="M22 98 L100 20" stroke="#f5f3ee" strokeWidth="10" strokeLinecap="round" />
        <path d="M22 98 L100 20" stroke="#12203a" strokeWidth="4" strokeLinecap="round" />
        <path d="M100 20 L82 24 L96 38 Z" fill="#12203a" />
      </svg>
      <span className={`font-extrabold tracking-tight ${text} text-navy`}>Z META</span>
    </div>
  );
}

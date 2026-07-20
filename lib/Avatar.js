"use client";

// Mesmo padrão de avatar usado no header (AppShell.js): foto cadastrada (avatar_url) se existir,
// senão um círculo com gradiente dourado e as iniciais do nome — reaproveitado em qualquer lista
// de usuários do app (ex: aba Colaboradores, Rankings) pra manter a identidade visual do app
// (nova identidade 2026-07: dourado é a cor de destaque padrão, ver app/globals.css .btn).
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export default function Avatar({ name, avatarUrl, size = 32, className = "" }) {
  const px = `${size}px`;
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`rounded-full object-cover shrink-0 border border-line ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full text-navy font-bold shrink-0 ${className}`}
      style={{ width: px, height: px, fontSize: size <= 28 ? "10px" : "12px", background: "linear-gradient(135deg, #e4c789, #c9a15a)" }}
    >
      {initials(name)}
    </div>
  );
}

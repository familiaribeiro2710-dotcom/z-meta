"use client";

// Mesmo padrão de avatar usado no header (AppShell.js): foto cadastrada (avatar_url) se existir,
// senão um círculo com gradiente roxo/rosa e as iniciais do nome — reaproveitado em qualquer lista
// de usuários do app (ex: aba Colaboradores) pra manter a mesma identidade visual do perfil.
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
      className={`flex items-center justify-center rounded-full text-white font-bold shrink-0 ${className}`}
      style={{ width: px, height: px, fontSize: size <= 28 ? "10px" : "12px", background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
    >
      {initials(name)}
    </div>
  );
}

export function slugBase(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .join("");
}

// gera um username único consultando a tabela profiles com o client admin (service role)
export async function generateUniqueUsername(admin, fullName) {
  const base = slugBase(fullName) || "usuario";
  let candidate = base;
  let n = 1;
  for (;;) {
    const { data } = await admin.from("profiles").select("id").eq("username", candidate).maybeSingle();
    if (!data) return candidate;
    n += 1;
    candidate = `${base}${n}`;
  }
}

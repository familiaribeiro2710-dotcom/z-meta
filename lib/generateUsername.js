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

// resolve o username a usar na criação de uma conta: se a pessoa escolheu um, valida e
// garante unicidade; senão, gera automaticamente a partir do nome completo.
// lança Error com mensagem amigável em caso de usuário inválido/duplicado.
export async function resolveUsername(admin, { username, fallbackName }) {
  if (username && String(username).trim()) {
    const clean = slugBase(username);
    if (!clean) {
      throw new Error("Usuário de login inválido.");
    }
    const { data: existing } = await admin.from("profiles").select("id").eq("username", clean).maybeSingle();
    if (existing) {
      throw new Error("Esse nome de usuário já está em uso.");
    }
    return clean;
  }
  return generateUniqueUsername(admin, fallbackName);
}

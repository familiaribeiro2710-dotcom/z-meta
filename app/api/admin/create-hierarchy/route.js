import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { resolveUsername } from "../../../../lib/generateUsername";

const ALLOWED_ROLES = ["socio", "supervisor"];
const DEFAULT_PASSWORD = "123456789";

export async function POST(req) {
  try {
    const body = await req.json();
    const { role, empresaId, fullName, password, lojaAccess, username: desiredUsername } = body || {};

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    }

    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("role, empresa_id")
      .eq("id", userData.user.id)
      .single();

    const isMasterAdmin = callerProfile?.role === "master_admin";
    const isSocio = callerProfile?.role === "socio";

    if (!callerProfile || (!isMasterAdmin && !isSocio)) {
      return NextResponse.json({ error: "Apenas o sócio ou o Master Admin podem cadastrar sócios e supervisores." }, { status: 403 });
    }

    // sócio só cadastra supervisores (nunca outro sócio) e sempre dentro da própria empresa —
    // o empresaId enviado pelo cliente é ignorado nesse caso, por segurança.
    if (isSocio && role !== "supervisor") {
      return NextResponse.json({ error: "Sócio só pode cadastrar supervisores." }, { status: 403 });
    }
    const targetEmpresaId = isMasterAdmin ? empresaId : callerProfile.empresa_id;

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Papel inválido." }, { status: 400 });
    }
    if (!targetEmpresaId || !fullName) {
      return NextResponse.json({ error: "Preencha empresa e nome." }, { status: 400 });
    }
    // senha é opcional — se não vier, usa a senha padrão do sistema (mesmo padrão de colaborador/gerente).
    const finalPassword = password || DEFAULT_PASSWORD;
    if (String(finalPassword).length < 6) {
      return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }
    const access = Array.isArray(lojaAccess) ? lojaAccess.filter((a) => a && a.lojaId) : [];
    if (access.length === 0) {
      return NextResponse.json({ error: "Selecione ao menos uma loja." }, { status: 400 });
    }
    for (const a of access) {
      if (!["ver", "gerenciar"].includes(a.permission)) {
        return NextResponse.json({ error: "Permissão inválida." }, { status: 400 });
      }
    }

    const admin = getSupabaseAdmin();

    const lojaIds = access.map((a) => a.lojaId);
    const { data: lojas } = await admin.from("lojas").select("id, empresa_id").in("id", lojaIds);
    if (!lojas || lojas.length !== lojaIds.length || lojas.some((l) => l.empresa_id !== targetEmpresaId)) {
      return NextResponse.json({ error: "Uma ou mais lojas selecionadas são inválidas para essa empresa." }, { status: 400 });
    }

    let username;
    try {
      username = await resolveUsername(admin, { username: desiredUsername, fallbackName: fullName });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const email = `${username}@zmeta.local`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
    });
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }

    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      full_name: fullName,
      role,
      username,
      empresa_id: targetEmpresaId,
      loja_id: null,
      must_change_password: true,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    const accessRows = access.map((a) => ({
      profile_id: created.user.id,
      loja_id: a.lojaId,
      permission: a.permission,
    }));
    const { error: accessErr } = await admin.from("loja_access").insert(accessRows);
    if (accessErr) {
      await admin.from("profiles").delete().eq("id", created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: accessErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, userId: created.user.id, username, defaultPassword: password ? undefined : DEFAULT_PASSWORD });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { generateUniqueUsername } from "../../../../lib/generateUsername";

const ALLOWED_ROLES = ["socio", "supervisor"];

export async function POST(req) {
  try {
    const body = await req.json();
    const { role, empresaId, fullName, password, lojaAccess } = body || {};

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
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "master_admin") {
      return NextResponse.json({ error: "Apenas o Master Admin pode cadastrar sócios e supervisores." }, { status: 403 });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Papel inválido." }, { status: 400 });
    }
    if (!empresaId || !fullName || !password) {
      return NextResponse.json({ error: "Preencha empresa, nome e senha." }, { status: 400 });
    }
    if (String(password).length < 6) {
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
    if (!lojas || lojas.length !== lojaIds.length || lojas.some((l) => l.empresa_id !== empresaId)) {
      return NextResponse.json({ error: "Uma ou mais lojas selecionadas são inválidas para essa empresa." }, { status: 400 });
    }

    const username = await generateUniqueUsername(admin, fullName);
    const email = `${username}@zmeta.local`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
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
      empresa_id: empresaId,
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

    return NextResponse.json({ ok: true, userId: created.user.id, username });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { generateUniqueUsername } from "../../../../lib/generateUsername";

export async function POST(req) {
  try {
    const body = await req.json();
    const { fullName, password, empresaId } = body || {};

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
    const isGestor = callerProfile?.role === "gestor" && !!callerProfile.empresa_id;

    if (!callerProfile || (!isMasterAdmin && !isGestor)) {
      return NextResponse.json(
        { error: "Apenas o gestor ou o Master Admin podem cadastrar colaboradores." },
        { status: 403 }
      );
    }

    const targetEmpresaId = isMasterAdmin ? empresaId : callerProfile.empresa_id;
    if (!targetEmpresaId) {
      return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
    }

    if (!fullName || !password) {
      return NextResponse.json({ error: "Preencha nome e senha." }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json(
        { error: "A senha precisa ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
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
      role: "colaborador",
      username,
      empresa_id: targetEmpresaId,
      must_change_password: true,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: created.user.id, username });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

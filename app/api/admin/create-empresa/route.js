import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { generateUniqueUsername } from "../../../../lib/generateUsername";

export async function POST(req) {
  try {
    const body = await req.json();
    const { empresaName, gestorName, password } = body || {};

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
      return NextResponse.json(
        { error: "Apenas o Master Admin pode cadastrar novos gestores." },
        { status: 403 }
      );
    }

    if (!empresaName || !gestorName || !password) {
      return NextResponse.json({ error: "Preencha empresa, nome do gestor e senha." }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json(
        { error: "A senha precisa ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: empresa, error: empresaErr } = await admin
      .from("empresas")
      .insert({ name: empresaName.trim(), created_by: userData.user.id })
      .select()
      .single();
    if (empresaErr) {
      return NextResponse.json({ error: empresaErr.message }, { status: 400 });
    }

    const username = await generateUniqueUsername(admin, gestorName);
    const email = `${username}@zmeta.local`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      await admin.from("empresas").delete().eq("id", empresa.id);
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }

    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      full_name: gestorName,
      role: "gestor",
      username,
      empresa_id: empresa.id,
      must_change_password: true,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      await admin.from("empresas").delete().eq("id", empresa.id);
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    await admin.from("app_settings").insert({
      empresa_id: empresa.id,
      warning_penalty_points: 10,
      team_threshold_pct: 95,
      monthly_prize: 1000,
    });

    return NextResponse.json({ ok: true, empresaId: empresa.id, username });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { slugBase } from "../../../../lib/generateUsername";

export async function POST(req) {
  try {
    const body = await req.json();
    const { newUsername } = body || {};
    if (!newUsername) {
      return NextResponse.json({ error: "Informe o novo usuário." }, { status: 400 });
    }

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

    const clean = slugBase(newUsername);
    if (!clean) {
      return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("username", clean)
      .neq("id", userData.user.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Esse nome de usuário já está em uso." }, { status: 400 });
    }

    const { error: emailErr } = await admin.auth.admin.updateUserById(userData.user.id, {
      email: `${clean}@zmeta.local`,
      email_confirm: true,
    });
    if (emailErr) {
      return NextResponse.json({ error: emailErr.message }, { status: 400 });
    }

    const { error: unameErr } = await admin
      .from("profiles")
      .update({ username: clean })
      .eq("id", userData.user.id);
    if (unameErr) {
      return NextResponse.json({ error: unameErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, username: clean });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

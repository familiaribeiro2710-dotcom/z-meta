import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req) {
  try {
    const body = await req.json();
    const { empresaId, lojaName } = body || {};

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
      return NextResponse.json({ error: "Apenas o Master Admin pode cadastrar lojas." }, { status: 403 });
    }

    if (!empresaId || !lojaName || !lojaName.trim()) {
      return NextResponse.json({ error: "Informe a empresa e o nome da loja." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: empresa } = await admin.from("empresas").select("id").eq("id", empresaId).single();
    if (!empresa) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    }

    const { data: loja, error: lojaErr } = await admin
      .from("lojas")
      .insert({ empresa_id: empresaId, name: lojaName.trim(), created_by: userData.user.id })
      .select()
      .single();
    if (lojaErr) {
      return NextResponse.json({ error: lojaErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, lojaId: loja.id });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

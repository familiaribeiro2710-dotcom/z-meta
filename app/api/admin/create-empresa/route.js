import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req) {
  try {
    const body = await req.json();
    const { empresaName, cnpj, telefone, email, categoriaId } = body || {};

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
        { error: "Apenas o Master Admin pode cadastrar novas empresas." },
        { status: 403 }
      );
    }

    if (!empresaName || !empresaName.trim()) {
      return NextResponse.json({ error: "Informe o nome da empresa." }, { status: 400 });
    }
    if (!categoriaId) {
      return NextResponse.json({ error: "Selecione a categoria da empresa." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: categoria, error: categoriaErr } = await admin
      .from("categorias_empresa")
      .select("id")
      .eq("id", categoriaId)
      .eq("active", true)
      .single();
    if (categoriaErr || !categoria) {
      return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
    }

    const { data: empresa, error: empresaErr } = await admin
      .from("empresas")
      .insert({
        name: empresaName.trim(),
        cnpj: cnpj?.trim() || null,
        telefone: telefone?.trim() || null,
        email: email?.trim() || null,
        categoria_id: categoriaId,
        created_by: userData.user.id,
      })
      .select()
      .single();
    if (empresaErr) {
      return NextResponse.json({ error: empresaErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, empresaId: empresa.id });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

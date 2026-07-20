import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req) {
  try {
    const body = await req.json();
    const { lojaId } = body || {};
    if (!lojaId) {
      return NextResponse.json({ error: "Informe a loja." }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // client com a sessão do próprio Master Admin — necessário para que
    // auth.uid() resolva corretamente dentro da função SQL (security definer)
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
      return NextResponse.json({ error: "Apenas o Master Admin pode excluir lojas." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    // coleta os usuários (auth) dessa loja antes de apagar as linhas no banco
    const { data: lojaProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("loja_id", lojaId);

    const { error: rpcErr } = await callerClient.rpc("admin_delete_loja", { p_loja: lojaId });
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    }

    for (const p of lojaProfiles || []) {
      try {
        await admin.auth.admin.deleteUser(p.id);
      } catch {
        // segue mesmo se algum usuário específico falhar ao remover do auth
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

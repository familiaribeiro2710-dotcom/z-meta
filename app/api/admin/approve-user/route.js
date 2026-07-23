import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

// Só o Master Admin aprova um cadastro pendente. A checagem de papel aqui é redundante com o
// trigger enforce_pending_approval_master_only (defesa em profundidade), mas continua necessária
// pra devolver um erro 403 claro em vez de um "sucesso" silencioso que na prática não mudou nada.
export async function POST(req) {
  try {
    const body = await req.json();
    const { employeeId } = body || {};
    if (!employeeId) {
      return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
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

    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (callerProfile?.role !== "master_admin") {
      return NextResponse.json({ error: "Apenas o Master Admin pode aprovar cadastros." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    const { data: target } = await admin
      .from("profiles")
      .select("id, full_name, role, pending_approval, created_by")
      .eq("id", employeeId)
      .single();

    if (!target || !target.pending_approval) {
      return NextResponse.json({ error: "Cadastro não encontrado ou já resolvido." }, { status: 404 });
    }

    const { error: updErr } = await admin.from("profiles").update({ pending_approval: false }).eq("id", employeeId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    if (target.created_by) {
      await admin.rpc("push_notify", {
        p_profile_id: target.created_by,
        p_title: "Cadastro aprovado",
        p_body: `${target.full_name} foi aprovado pelo Master Admin e já pode acessar o Z Meta.`,
        p_url: "/",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

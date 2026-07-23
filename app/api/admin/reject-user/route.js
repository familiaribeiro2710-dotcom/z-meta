import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

// Só o Master Admin recusa um cadastro pendente. Recusar exclui por completo (login + perfil),
// nunca deixa um registro "recusado" pra trás — decisão do Felipe. loja_access (se o papel for
// supervisor/administrativo) é limpo sozinho via ON DELETE CASCADE.
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
      return NextResponse.json({ error: "Apenas o Master Admin pode recusar cadastros." }, { status: 403 });
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

    const { error: delErr } = await admin.from("profiles").delete().eq("id", employeeId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
    await admin.auth.admin.deleteUser(employeeId);

    if (target.created_by) {
      await admin.rpc("push_notify", {
        p_profile_id: target.created_by,
        p_title: "Cadastro recusado",
        p_body: `O cadastro de ${target.full_name} foi recusado pelo Master Admin.`,
        p_url: "/",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

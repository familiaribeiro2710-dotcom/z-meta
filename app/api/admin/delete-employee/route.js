import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req) {
  try {
    const body = await req.json();
    const { employeeId } = body || {};
    if (!employeeId) {
      return NextResponse.json({ error: "Informe o colaborador." }, { status: 400 });
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
      .select("role, empresa_id, loja_id")
      .eq("id", userData.user.id)
      .single();

    // 2026-08-04 (pedido do Felipe): excluir um usuário passou a ser exclusivo do Master Admin —
    // gerente/sócio/supervisor não excluem mais de forma alguma (antes podiam, dentro do próprio
    // escopo). No front, o botão continua visível pra esses papéis, mas cai num modal de "fale com
    // o suporte" em vez de chamar essa rota — esse bloqueio aqui é a garantia de verdade, pra não
    // depender só da UI.
    const isMasterAdmin = callerProfile?.role === "master_admin";
    if (!callerProfile || !isMasterAdmin) {
      return NextResponse.json(
        { error: "Apenas o Master Admin pode excluir um usuário. Entre em contato com o suporte." },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: target } = await admin
      .from("profiles")
      .select("id, role, empresa_id, loja_id, gerente_id")
      .eq("id", employeeId)
      .single();

    if (!target || !["colaborador", "gerente"].includes(target.role)) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const { error: profileDeleteErr } = await admin.from("profiles").delete().eq("id", employeeId);
    if (profileDeleteErr) {
      return NextResponse.json({ error: profileDeleteErr.message }, { status: 400 });
    }

    await admin.auth.admin.deleteUser(employeeId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

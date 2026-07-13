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
      .select("role, empresa_id")
      .eq("id", userData.user.id)
      .single();

    const isMasterAdmin = callerProfile?.role === "master_admin";
    const isGestor = callerProfile?.role === "gestor" && !!callerProfile.empresa_id;
    if (!callerProfile || (!isMasterAdmin && !isGestor)) {
      return NextResponse.json(
        { error: "Apenas o gestor ou o Master Admin podem excluir colaboradores." },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: target } = await admin
      .from("profiles")
      .select("id, role, empresa_id")
      .eq("id", employeeId)
      .single();

    if (!target || target.role !== "colaborador") {
      return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
    }
    if (isGestor && target.empresa_id !== callerProfile.empresa_id) {
      return NextResponse.json({ error: "Esse colaborador não pertence à sua empresa." }, { status: 403 });
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

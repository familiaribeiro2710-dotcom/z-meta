import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { hierarquiaCanManageLoja } from "../../../../lib/serverPermissions";

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

    const isMasterAdmin = callerProfile?.role === "master_admin";
    const isGerente = callerProfile?.role === "gerente" && !!callerProfile.loja_id;
    const isHierarquia = callerProfile?.role === "supervisor" || callerProfile?.role === "socio";
    if (!callerProfile || (!isMasterAdmin && !isGerente && !isHierarquia)) {
      return NextResponse.json(
        { error: "Apenas o gerente, supervisor, sócio ou o Master Admin podem excluir colaboradores." },
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
    // gerente só exclui colaboradores da própria equipe — nunca outro gerente
    if (isGerente && (target.role !== "colaborador" || target.gerente_id !== callerProfile.id)) {
      return NextResponse.json({ error: "Esse colaborador não pertence à sua equipe." }, { status: 403 });
    }
    // excluir um gerente só pode master admin, supervisor ou sócio (nunca outro gerente)
    if (target.role === "gerente" && !isMasterAdmin && !isHierarquia) {
      return NextResponse.json({ error: "Apenas supervisor, sócio ou Master Admin podem excluir um gerente." }, { status: 403 });
    }
    if (isHierarquia) {
      const allowed = await hierarquiaCanManageLoja({
        callerClient,
        callerProfile,
        userId: userData.user.id,
        lojaId: target.loja_id,
        lojaEmpresaId: target.empresa_id,
      });
      if (!allowed) {
        return NextResponse.json({ error: "Você não tem permissão de gerenciar essa loja." }, { status: 403 });
      }
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

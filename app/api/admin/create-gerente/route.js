import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { resolveUsername } from "../../../../lib/generateUsername";
import { hierarquiaCanManageLoja } from "../../../../lib/serverPermissions";

export async function POST(req) {
  try {
    const body = await req.json();
    const { empresaId, lojaId, gerenteName, password, username: desiredUsername, teamEmployeeIds } = body || {};

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
    const isHierarquia = callerProfile?.role === "supervisor" || callerProfile?.role === "socio";

    if (!callerProfile || (!isMasterAdmin && !isHierarquia)) {
      return NextResponse.json({ error: "Apenas supervisor, sócio ou o Master Admin podem cadastrar gerentes." }, { status: 403 });
    }

    const targetEmpresaId = isMasterAdmin ? empresaId : callerProfile.empresa_id;
    if (!targetEmpresaId || !lojaId || !gerenteName || !password) {
      return NextResponse.json({ error: "Preencha empresa, loja, nome do gerente e senha." }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: loja } = await admin.from("lojas").select("id, empresa_id").eq("id", lojaId).single();
    if (!loja || loja.empresa_id !== targetEmpresaId) {
      return NextResponse.json({ error: "Loja inválida para essa empresa." }, { status: 400 });
    }

    if (isHierarquia) {
      const allowed = await hierarquiaCanManageLoja({
        callerClient,
        callerProfile,
        userId: userData.user.id,
        lojaId,
        lojaEmpresaId: loja.empresa_id,
      });
      if (!allowed) {
        return NextResponse.json({ error: "Você não tem permissão de gerenciar essa loja." }, { status: 403 });
      }
    }

    // valida que os colaboradores escolhidos pra equipe já pertencem a essa loja
    const teamIds = Array.isArray(teamEmployeeIds) ? teamEmployeeIds.filter(Boolean) : [];
    if (teamIds.length) {
      const { data: teamRows } = await admin
        .from("profiles")
        .select("id, role, loja_id")
        .in("id", teamIds);
      const invalid = (teamRows || []).some((r) => r.role !== "colaborador" || r.loja_id !== lojaId);
      if (invalid || (teamRows || []).length !== teamIds.length) {
        return NextResponse.json({ error: "Um ou mais colaboradores selecionados não pertencem a essa loja." }, { status: 400 });
      }
    }

    let username;
    try {
      username = await resolveUsername(admin, { username: desiredUsername, fallbackName: gerenteName });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const email = `${username}@zmeta.local`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }

    const pendingApproval = !isMasterAdmin;
    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      full_name: gerenteName,
      role: "gerente",
      username,
      empresa_id: targetEmpresaId,
      loja_id: lojaId,
      must_change_password: true,
      created_by: userData.user.id,
      pending_approval: pendingApproval,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    if (teamIds.length) {
      await admin.from("profiles").update({ gerente_id: created.user.id }).in("id", teamIds);
    }

    // garante uma linha de configurações para a loja (não duplica se já existir)
    const { data: existingSettings } = await admin
      .from("app_settings")
      .select("loja_id")
      .eq("loja_id", lojaId)
      .maybeSingle();
    if (!existingSettings) {
      await admin.from("app_settings").insert({
        loja_id: lojaId,
        empresa_id: targetEmpresaId,
        warning_penalty_points: 10,
        team_threshold_pct: 95,
        monthly_prize: 1000,
      });
    }

    return NextResponse.json({ ok: true, gerenteId: created.user.id, username, pending: pendingApproval });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

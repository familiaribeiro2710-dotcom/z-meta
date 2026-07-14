import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { slugBase } from "../../../../lib/generateUsername";

const DEFAULT_PASSWORD = "123456789";

export async function POST(req) {
  try {
    const body = await req.json();
    const { employeeId, fullName, resetPassword, newUsername, newGerenteId, newActive } = body || {};
    if (!employeeId) {
      return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
    }
    if (!fullName && !resetPassword && !newUsername && newGerenteId === undefined && newActive === undefined) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
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
        { error: "Apenas o gerente, supervisor, sócio ou o Master Admin podem editar usuários." },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: target } = await admin
      .from("profiles")
      .select("id, role, empresa_id, loja_id, gerente_id")
      .eq("id", employeeId)
      .single();

    if (!target || !["colaborador", "gerente", "socio", "supervisor"].includes(target.role)) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    // gerente só pode editar colaboradores da própria equipe — nunca outro gerente, sócio, supervisor nem colaborador de outra equipe
    if (isGerente && (target.role !== "colaborador" || target.gerente_id !== callerProfile.id)) {
      return NextResponse.json({ error: "Você só pode editar colaboradores da sua equipe." }, { status: 403 });
    }
    // sócio edita supervisores da própria empresa (esses não têm loja_id — não passam pelo loja_access)
    if (isHierarquia && (target.role === "socio" || target.role === "supervisor")) {
      const isSocio = callerProfile.role === "socio";
      if (!isSocio || target.role !== "supervisor" || target.empresa_id !== callerProfile.empresa_id) {
        return NextResponse.json({ error: "Você não tem permissão para editar esse usuário." }, { status: 403 });
      }
    }
    // supervisor/sócio editando colaborador/gerente só em lojas que gerenciam
    else if (isHierarquia) {
      const { data: access } = await callerClient
        .from("loja_access")
        .select("permission")
        .eq("profile_id", userData.user.id)
        .eq("loja_id", target.loja_id)
        .maybeSingle();
      if (access?.permission !== "gerenciar") {
        return NextResponse.json({ error: "Você não tem permissão de gerenciar essa loja." }, { status: 403 });
      }
    }

    if (fullName && fullName.trim()) {
      const { error: nameErr } = await admin
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("id", employeeId);
      if (nameErr) {
        return NextResponse.json({ error: nameErr.message }, { status: 400 });
      }
    }

    if (newUsername) {
      // gerente pode alterar o usuário de login dos seus próprios colaboradores; master admin/supervisor/sócio, de quem gerenciam.
      const clean = slugBase(newUsername);
      if (!clean) {
        return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
      }
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("username", clean)
        .neq("id", employeeId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: "Esse nome de usuário já está em uso." }, { status: 400 });
      }
      const { error: emailErr } = await admin.auth.admin.updateUserById(employeeId, {
        email: `${clean}@zmeta.local`,
        email_confirm: true,
      });
      if (emailErr) {
        return NextResponse.json({ error: emailErr.message }, { status: 400 });
      }
      const { error: unameErr } = await admin
        .from("profiles")
        .update({ username: clean })
        .eq("id", employeeId);
      if (unameErr) {
        return NextResponse.json({ error: unameErr.message }, { status: 400 });
      }
    }

    if (newGerenteId !== undefined && target.role === "colaborador") {
      // só supervisor/sócio/master admin reatribuem a equipe (o gerente da equipe atual não pode se auto-transferir colaboradores)
      if (!isMasterAdmin && !isHierarquia) {
        return NextResponse.json({ error: "Apenas supervisor, sócio ou Master Admin podem trocar a equipe de um colaborador." }, { status: 403 });
      }
      if (newGerenteId) {
        const { data: gerenteRow } = await admin
          .from("profiles")
          .select("id, role, loja_id")
          .eq("id", newGerenteId)
          .single();
        if (!gerenteRow || gerenteRow.role !== "gerente" || gerenteRow.loja_id !== target.loja_id) {
          return NextResponse.json({ error: "Gerente inválido para a loja desse colaborador." }, { status: 400 });
        }
      }
      const { error: gerenteErr } = await admin
        .from("profiles")
        .update({ gerente_id: newGerenteId || null })
        .eq("id", employeeId);
      if (gerenteErr) {
        return NextResponse.json({ error: gerenteErr.message }, { status: 400 });
      }
    }

    if (newActive !== undefined) {
      const { error: activeErr } = await admin.from("profiles").update({ active: !!newActive }).eq("id", employeeId);
      if (activeErr) {
        return NextResponse.json({ error: activeErr.message }, { status: 400 });
      }
    }

    if (resetPassword) {
      const { error: pwErr } = await admin.auth.admin.updateUserById(employeeId, {
        password: DEFAULT_PASSWORD,
      });
      if (pwErr) {
        return NextResponse.json({ error: pwErr.message }, { status: 400 });
      }
      await admin.from("profiles").update({ must_change_password: true }).eq("id", employeeId);
    }

    return NextResponse.json({ ok: true, defaultPassword: resetPassword ? DEFAULT_PASSWORD : undefined });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

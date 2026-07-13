import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { slugBase } from "../../../../lib/generateUsername";

const DEFAULT_PASSWORD = "123456789";

export async function POST(req) {
  try {
    const body = await req.json();
    const { employeeId, fullName, resetPassword, newUsername } = body || {};
    if (!employeeId) {
      return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
    }
    if (!fullName && !resetPassword && !newUsername) {
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
      .select("role, empresa_id")
      .eq("id", userData.user.id)
      .single();

    const isMasterAdmin = callerProfile?.role === "master_admin";
    const isGestor = callerProfile?.role === "gestor" && !!callerProfile.empresa_id;
    if (!callerProfile || (!isMasterAdmin && !isGestor)) {
      return NextResponse.json(
        { error: "Apenas o gestor ou o Master Admin podem editar usuários." },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: target } = await admin
      .from("profiles")
      .select("id, role, empresa_id")
      .eq("id", employeeId)
      .single();

    if (!target || (target.role !== "colaborador" && target.role !== "gestor")) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    // gestor só pode editar colaboradores da própria empresa — nunca outro gestor
    if (isGestor && (target.role !== "colaborador" || target.empresa_id !== callerProfile.empresa_id)) {
      return NextResponse.json({ error: "Você só pode editar colaboradores da sua empresa." }, { status: 403 });
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
      if (!isMasterAdmin) {
        return NextResponse.json(
          { error: "Apenas o Master Admin pode alterar o usuário de login." },
          { status: 403 }
        );
      }
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

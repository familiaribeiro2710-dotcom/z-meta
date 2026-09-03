import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { resolveUsername } from "../../../../lib/generateUsername";
import { hierarquiaCanManageLoja } from "../../../../lib/serverPermissions";

const DEFAULT_PASSWORD = "123456789";

export async function POST(req) {
  try {
    const body = await req.json();
    const { fullName, empresaId, lojaId, gerenteId, username: desiredUsername } = body || {};
    const password = DEFAULT_PASSWORD;

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
        { error: "Apenas o gerente, supervisor, sócio ou o Master Admin podem cadastrar colaboradores." },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    const targetEmpresaId = isMasterAdmin ? empresaId : callerProfile.empresa_id;
    if (!targetEmpresaId) {
      return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
    }

    let targetLojaId;
    if (isGerente) {
      targetLojaId = callerProfile.loja_id;
    } else {
      // master_admin e supervisor/sócio escolhem a loja explicitamente
      targetLojaId = lojaId;
      if (!targetLojaId) {
        return NextResponse.json({ error: "Informe a loja desse colaborador." }, { status: 400 });
      }
      const { data: lojaRow } = await admin
        .from("lojas")
        .select("id, empresa_id")
        .eq("id", targetLojaId)
        .single();
      if (!lojaRow || lojaRow.empresa_id !== targetEmpresaId) {
        return NextResponse.json({ error: "Loja inválida para essa empresa." }, { status: 400 });
      }
      if (isHierarquia) {
        const allowed = await hierarquiaCanManageLoja({
          callerClient,
          callerProfile,
          userId: userData.user.id,
          lojaId: targetLojaId,
          lojaEmpresaId: lojaRow.empresa_id,
        });
        if (!allowed) {
          return NextResponse.json({ error: "Você não tem permissão de gerenciar essa loja." }, { status: 403 });
        }
      }
    }

    // gerente_id: qual gerente (equipe) esse colaborador vai integrar — separado da loja.
    let targetGerenteId = null;
    if (isGerente) {
      targetGerenteId = callerProfile.id;
    } else if (gerenteId) {
      const { data: gerenteRow } = await admin
        .from("profiles")
        .select("id, role, loja_id")
        .eq("id", gerenteId)
        .single();
      if (!gerenteRow || gerenteRow.role !== "gerente" || gerenteRow.loja_id !== targetLojaId) {
        return NextResponse.json({ error: "Gerente inválido para essa loja." }, { status: 400 });
      }
      targetGerenteId = gerenteId;
    }

    if (!fullName) {
      return NextResponse.json({ error: "Preencha o nome." }, { status: 400 });
    }

    let username;
    try {
      username = await resolveUsername(admin, { username: desiredUsername, fallbackName: fullName });
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
      full_name: fullName,
      role: "colaborador",
      username,
      empresa_id: targetEmpresaId,
      loja_id: targetLojaId,
      gerente_id: targetGerenteId,
      must_change_password: true,
      created_by: userData.user.id,
      pending_approval: pendingApproval,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    // 2026-09-03, pedido do Felipe: colaborador novo já nasce com as tarefas que são IGUAIS pra
    // todo mundo na loja (mesmo título/recorrência/tipo pros demais colaboradores ativos) — só
    // essas, nunca uma tarefa que só alguns têm (aí não seria "igual pra todos", seria coincidência
    // de título). Comparação por assinatura completa (título+recorrência+dia da semana+data
    // única+tipo+meta de contatos) pra não confundir 2 tarefas homônimas com config diferente.
    const { data: existingEmps } = await admin
      .from("profiles")
      .select("id")
      .eq("loja_id", targetLojaId)
      .eq("role", "colaborador")
      .eq("active", true)
      .neq("id", created.user.id);
    const existingEmpIds = (existingEmps || []).map((e) => e.id);
    if (existingEmpIds.length) {
      const { data: existingTasks } = await admin
        .from("tasks")
        .select("employee_id, title, recurrence_type, weekday, once_date, task_type, contacts_target")
        .in("employee_id", existingEmpIds)
        .eq("active", true);
      const bySignature = {};
      (existingTasks || []).forEach((t) => {
        const key = JSON.stringify([t.title, t.recurrence_type, t.weekday, t.once_date, t.task_type, t.contacts_target]);
        if (!bySignature[key]) bySignature[key] = { sample: t, empIds: new Set() };
        bySignature[key].empIds.add(t.employee_id);
      });
      const commonTasks = Object.values(bySignature)
        .filter((g) => g.empIds.size === existingEmpIds.length)
        .map((g) => g.sample);
      if (commonTasks.length) {
        // start_date sempre HOJE (dia em que o colaborador passou a existir) — nunca a start_date
        // original, que copiada faria isTaskDueOn contar dias em que ele nem tinha sido contratado.
        const todayStr = new Date().toISOString().slice(0, 10);
        const rows = commonTasks.map((t) => ({
          employee_id: created.user.id,
          title: t.title,
          empresa_id: targetEmpresaId,
          loja_id: targetLojaId,
          recurrence_type: t.recurrence_type,
          weekday: t.weekday,
          once_date: t.once_date,
          start_date: todayStr,
          task_type: t.task_type,
          contacts_target: t.contacts_target,
        }));
        await admin.from("tasks").insert(rows);
      }
    }

    return NextResponse.json({ ok: true, id: created.user.id, username, defaultPassword: DEFAULT_PASSWORD, pending: pendingApproval });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

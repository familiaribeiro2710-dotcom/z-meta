import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

// Rota pro sócio (e Master Admin) listarem os supervisores da empresa com as lojas que cada um
// enxerga, e ajustarem essa permissão (ver / gerenciar / remover) a qualquer momento — sem depender
// de RLS direto no cliente, já que profiles/loja_access de terceiros não são visíveis via RLS comum.
export async function POST(req) {
  try {
    const body = await req.json();
    const { action } = body || {};

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
    const isSocio = callerProfile?.role === "socio";
    if (!callerProfile || (!isMasterAdmin && !isSocio)) {
      return NextResponse.json({ error: "Apenas o sócio ou o Master Admin podem gerenciar supervisores." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const targetEmpresaId = isMasterAdmin ? body.empresaId : callerProfile.empresa_id;
    if (!targetEmpresaId) {
      return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
    }

    if (action === "list") {
      // 2026-07-21: administrativo (papel exclusivo de consórcio) segue o mesmo padrão de acesso
      // multi-loja do supervisor (loja_access) — lista os dois juntos, o campo `role` no retorno
      // deixa o front-end separar em duas seções.
      const { data: supervisores } = await admin
        .from("profiles")
        .select("id, full_name, username, active, must_change_password, role")
        .eq("empresa_id", targetEmpresaId)
        .in("role", ["supervisor", "administrativo"])
        .order("full_name");
      const supIds = (supervisores || []).map((s) => s.id);
      let access = [];
      if (supIds.length) {
        const { data: accessRows } = await admin.from("loja_access").select("*").in("profile_id", supIds);
        access = accessRows || [];
      }
      return NextResponse.json({ ok: true, supervisores: supervisores || [], access });
    }

    if (action === "setAccess") {
      const { supervisorId, lojaId, permission } = body;
      if (!supervisorId || !lojaId) {
        return NextResponse.json({ error: "Informe o supervisor e a loja." }, { status: 400 });
      }
      const { data: target } = await admin.from("profiles").select("id, role, empresa_id").eq("id", supervisorId).single();
      if (!target || !["supervisor", "administrativo"].includes(target.role) || target.empresa_id !== targetEmpresaId) {
        return NextResponse.json({ error: "Usuário inválido para essa empresa." }, { status: 400 });
      }
      const { data: lojaRow } = await admin.from("lojas").select("id, empresa_id").eq("id", lojaId).single();
      if (!lojaRow || lojaRow.empresa_id !== targetEmpresaId) {
        return NextResponse.json({ error: "Loja inválida para essa empresa." }, { status: 400 });
      }

      if (!permission) {
        const { error: delErr } = await admin.from("loja_access").delete().eq("profile_id", supervisorId).eq("loja_id", lojaId);
        if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      if (!["ver", "gerenciar"].includes(permission)) {
        return NextResponse.json({ error: "Permissão inválida." }, { status: 400 });
      }
      const { error: upsertErr } = await admin
        .from("loja_access")
        .upsert({ profile_id: supervisorId, loja_id: lojaId, permission }, { onConflict: "profile_id,loja_id" });
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

// Chamada uma vez por dia pelo Cron Jobs da Vercel (ver vercel.json) — nunca por um usuário.
// Autenticação: a Vercel manda automaticamente `Authorization: Bearer <CRON_SECRET>` nessas
// chamadas agendadas; qualquer outra chamada sem esse header exato é rejeitada.
//
// Suspende (empresas.active = false) toda empresa cujo status de cobrança está "atrasado" há
// mais dos 2 dias de carência combinados com o Felipe. Reativação é automática e fica só no
// webhook (app/api/webhooks/stripe/route.js) — no momento em que o Stripe confirma que o
// pagamento entrou, não é responsabilidade dessa rota de cron.
export const runtime = "nodejs";

export async function GET(req) {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const { data: overdue, error: selectErr } = await admin
    .from("empresa_billing")
    .select("empresa_id, grace_until, empresas(name)")
    .eq("payment_status", "atrasado")
    .lt("grace_until", new Date().toISOString());

  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }

  const suspended = [];
  for (const row of overdue || []) {
    const { error: empresaErr } = await admin.from("empresas").update({ active: false }).eq("id", row.empresa_id);
    if (empresaErr) continue;
    await admin.from("empresa_billing").update({ payment_status: "suspenso", updated_at: new Date().toISOString() }).eq("empresa_id", row.empresa_id);
    suspended.push({ empresa_id: row.empresa_id, empresa_name: row.empresas?.name || null });
  }

  if (suspended.length) {
    const { data: masters } = await admin.from("profiles").select("id").eq("role", "master_admin");
    for (const m of masters || []) {
      for (const s of suspended) {
        await admin.rpc("push_notify", {
          p_profile_id: m.id,
          p_title: "Empresa suspensa por falta de pagamento",
          p_body: `${s.empresa_name || "Uma empresa"} passou da carência de 2 dias sem pagar e foi suspensa automaticamente.`,
          p_url: "/",
        });
      }
    }
  }

  return NextResponse.json({ ok: true, suspended_count: suspended.length, suspended });
}

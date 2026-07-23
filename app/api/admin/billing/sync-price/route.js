import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { getStripeAdmin, getOrCreateZMetaProduct } from "../../../../../lib/stripeAdmin";

// Só o Master Admin gera/regenera o link de pagamento recorrente de uma empresa-cliente. Chamado
// depois que o valor por usuário/desconto é salvo em app/admin/page.js (FinanceiroTab) — sempre
// recria um Price + Payment Link novos (Price no Stripe é imutável) e desativa os anteriores, pra
// que o botão de link na tela sempre reflita a condição comercial vigente.
//
// Limitação conhecida (v1): se a empresa já tem uma assinatura ATIVA (alguém já pagou pelo link
// anterior) e o valor muda, essa assinatura antiga continua cobrando o valor antigo até alguém
// cancelar manualmente no Stripe — trocar de link não migra assinatura em andamento. Pra mudar o
// valor de quem já paga, é preciso também ajustar/cancelar a assinatura no painel do Stripe.
export async function POST(req) {
  try {
    const body = await req.json();
    const { empresaId } = body || {};
    if (!empresaId) {
      return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
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
      return NextResponse.json({ error: "Apenas o Master Admin pode gerar link de pagamento." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    const { data: empresa } = await admin
      .from("empresas")
      .select("id, name, valor_por_usuario, desconto")
      .eq("id", empresaId)
      .single();
    if (!empresa) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    }

    // mesma contagem usada pela rpc admin_financeiro — recalculada aqui em vez de confiar num
    // número vindo do client.
    const { count: usuariosCount } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .in("role", ["colaborador", "gerente", "supervisor", "socio"]);

    const valorPorUsuario = Number(empresa.valor_por_usuario) || 0;
    const desconto = Number(empresa.desconto) || 0;
    const amountReais = Math.max(0, valorPorUsuario * (usuariosCount || 0) - desconto);
    const amountCents = Math.round(amountReais * 100);

    if (amountCents <= 0) {
      return NextResponse.json({ error: "Defina um valor por usuário maior que zero antes de gerar o link." }, { status: 400 });
    }

    const stripe = getStripeAdmin();
    const product = await getOrCreateZMetaProduct(stripe);

    const newPrice = await stripe.prices.create({
      product: product.id,
      currency: "brl",
      unit_amount: amountCents,
      recurring: { interval: "month" },
      metadata: { empresa_id: empresaId, empresa_name: empresa.name },
    });

    const newLink = await stripe.paymentLinks.create({
      line_items: [{ price: newPrice.id, quantity: 1 }],
      subscription_data: {
        metadata: { empresa_id: empresaId, empresa_name: empresa.name },
      },
      metadata: { empresa_id: empresaId },
    });

    const { data: existingBilling } = await admin
      .from("empresa_billing")
      .select("stripe_price_id, stripe_payment_link_id")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    // desativa o price/link anteriores — Price é imutável no Stripe, então "atualizar o valor"
    // sempre significa criar um novo e aposentar o antigo, nunca editar.
    if (existingBilling?.stripe_payment_link_id) {
      await stripe.paymentLinks.update(existingBilling.stripe_payment_link_id, { active: false }).catch(() => {});
    }
    if (existingBilling?.stripe_price_id) {
      await stripe.prices.update(existingBilling.stripe_price_id, { active: false }).catch(() => {});
    }

    const { error: upsertErr } = await admin.from("empresa_billing").upsert({
      empresa_id: empresaId,
      stripe_price_id: newPrice.id,
      stripe_payment_link_id: newLink.id,
      stripe_payment_link_url: newLink.url,
      payment_status: "aguardando_pagamento",
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, url: newLink.url });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro inesperado." }, { status: 500 });
  }
}

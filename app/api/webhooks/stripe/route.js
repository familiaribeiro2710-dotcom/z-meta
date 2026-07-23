import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getStripeAdmin } from "../../../../lib/stripeAdmin";

// Webhook público do Stripe (sem auth de usuário — quem autentica é a assinatura HMAC do próprio
// Stripe, verificada abaixo com STRIPE_WEBHOOK_SECRET). Roda em Node.js (não Edge) porque o SDK
// da Stripe precisa disso pra verificar a assinatura.
export const runtime = "nodejs";

// Sempre resincroniza a partir da Subscription no Stripe (fonte de verdade), em vez de tentar
// deduzir o status a partir de cada tipo de evento separado — mais simples e mais resistente a
// eventos chegando fora de ordem ou duplicados (o Stripe pode reentregar o mesmo evento).
async function syncBillingFromSubscriptionId(stripe, admin, subscriptionId) {
  if (!subscriptionId) return;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const empresaId = sub.metadata?.empresa_id;
  if (!empresaId) return; // assinatura sem metadata nossa (criada fora do fluxo do app) — ignora

  let paymentStatus = "aguardando_pagamento";
  if (sub.status === "active" || sub.status === "trialing") paymentStatus = "pago";
  else if (sub.status === "past_due" || sub.status === "unpaid") paymentStatus = "atrasado";
  else if (sub.status === "canceled" || sub.status === "incomplete_expired") paymentStatus = "cancelado";

  const { data: current } = await admin
    .from("empresa_billing")
    .select("grace_until")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  // grace_until só é setado na PRIMEIRA vez que cai em atraso — reentregas/retries do Stripe não
  // podem empurrar a carência pra frente de novo, senão o cliente nunca seria suspenso.
  let graceUntil = current?.grace_until || null;
  if (paymentStatus === "atrasado") {
    if (!graceUntil) graceUntil = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    graceUntil = null;
  }

  await admin
    .from("empresa_billing")
    .update({
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id || null,
      payment_status: paymentStatus,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      grace_until: graceUntil,
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", empresaId);

  // reativa sozinho quando o pagamento volta a ficar em dia — cobre tanto quem só ficou
  // "atrasado" (nunca chegou a passar da carência) quanto quem já tinha sido suspenso pela
  // checagem diária da Fase 3.
  if (paymentStatus === "pago") {
    await admin.from("empresas").update({ active: true }).eq("id", empresaId);
  }
}

export async function POST(req) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET não configurada." }, { status: 500 });
  }

  const stripe = getStripeAdmin();
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    return NextResponse.json({ error: `Assinatura inválida: ${e.message}` }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncBillingFromSubscriptionId(stripe, admin, event.data.object.id);
        break;
      case "invoice.paid":
      case "invoice.payment_failed":
        await syncBillingFromSubscriptionId(stripe, admin, event.data.object.subscription);
        break;
      default:
        break;
    }
  } catch (e) {
    // não deixa um erro nosso de processamento virar retry infinito do Stripe pro mesmo evento —
    // loga pro Vercel e responde 200 mesmo assim. O próximo evento de status ainda resincroniza.
    console.error("Erro processando webhook Stripe:", event.type, e);
  }

  return NextResponse.json({ received: true });
}

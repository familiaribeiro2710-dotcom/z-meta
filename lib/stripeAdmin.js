import Stripe from "stripe";

// SOMENTE uso server-side (route handlers). Nunca importar em componente "use client" — a
// STRIPE_SECRET_KEY é secreta, mesmo padrão de lib/supabaseAdmin.js.
let cachedStripe = null;

export function getStripeAdmin() {
  if (cachedStripe) return cachedStripe;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY não configurada. Adicione essa variável de ambiente no Vercel.");
  }
  // Sem apiVersion fixo de propósito: usa a versão padrão configurada na própria conta Stripe,
  // evitando descompasso entre uma versão travada aqui no código e a versão que o SDK (stripe
  // ^22) realmente espera.
  cachedStripe = new Stripe(secretKey);
  return cachedStripe;
}

// Produto único ("Z Meta assinatura") compartilhado por todas as empresas-cliente — cada empresa
// tem seu próprio Price (valor personalizado) em cima desse mesmo produto. Em vez de guardar o id
// numa tabela de configuração à parte, procura pelo metadata.app na lista de produtos e cria na
// primeira vez que alguém gera um link — assim não depende de nenhum passo manual de setup no
// Stripe antes de usar.
export async function getOrCreateZMetaProduct(stripe) {
  const existing = await stripe.products.list({ limit: 100, active: true });
  const found = existing.data.find((p) => p.metadata?.app === "zmeta_subscription");
  if (found) return found;
  return stripe.products.create({
    name: "Z Meta — assinatura mensal",
    metadata: { app: "zmeta_subscription" },
  });
}

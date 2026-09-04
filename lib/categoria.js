// Categorias de empresa que reaproveitam a engine de funil de vendas (crm_leads/consorcio_goals)
// em vez da engine de vestuário (sales_entries/sales_goals). "comercial" é uma cópia comercial de
// "consorcio" — mesmas tabelas, mesmos componentes, RLS e triggers, só muda o nome exibido pro
// usuário final (decisão 2026-09: reaproveitar a engine em vez de duplicar dados/telas, já que as
// duas categorias têm o mesmo modelo de dados).
export const CRM_CATEGORY_SLUGS = ["consorcio", "comercial"];

export function isCrmCategoria(slug) {
  return CRM_CATEGORY_SLUGS.includes(slug);
}

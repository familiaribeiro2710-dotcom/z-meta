import LandingPage from "../lib/LandingPage";
import SessionRedirect from "../lib/SessionRedirect";

// "/" é a landing page de vendas (pública, mesmo domínio zmeta.com.br/www.zmeta.com.br).
// 2026-08-06: virou componente de servidor — o conteúdo de marketing renderiza direto no primeiro
// HTML, sem depender de JS pra existir (bom pra SEO, crawlers e preview de link). O caso de quem
// JÁ tem sessão ativa (inclusive quem abre o PWA instalado, cujo start_url antigo ainda aponta pra
// "/" em quem instalou antes dessa mudança — ver public/manifest.json) é tratado por
// <SessionRedirect />, que roda client-side em paralelo e redireciona pro dashboard sem bloquear o
// paint da landing. Ver lib/SessionRedirect.js pro racional completo da troca.
export default function Home() {
  return (
    <>
      <SessionRedirect />
      <LandingPage />
    </>
  );
}

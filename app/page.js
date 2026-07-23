"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import LandingPage from "../lib/LandingPage";

// "/" agora é a landing page de vendas (pública, mesmo domínio zmeta.com.br/www.zmeta.com.br).
// Quem JÁ tem sessão ativa (inclusive quem abre o PWA instalado, cujo start_url antigo ainda
// aponta pra "/" em quem instalou antes dessa mudança — ver public/manifest.json) é redirecionado
// direto pro próprio dashboard sem nem ver a landing. Quem não tem sessão só vê a landing mesmo,
// sem redirecionamento nenhum — o botão "Entrar" dela leva pra /login, que é quem hoje cuida de
// verdade do fluxo de autenticação.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      if (!active) return;
      if (!profile) {
        await supabase.auth.signOut();
        return;
      }
      if (profile.role === "master_admin") {
        router.replace("/admin");
      } else if (profile.role === "socio") {
        router.replace("/socio");
      } else if (profile.role === "supervisor") {
        router.replace("/supervisor");
      } else if (profile.role === "gerente") {
        router.replace("/gerente");
      } else if (profile.role === "administrativo") {
        router.replace("/administrativo");
      } else {
        router.replace("/colaborador");
      }
    })();
    return () => { active = false; };
  }, [router]);

  return <LandingPage />;
}

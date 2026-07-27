"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import LandingPage from "../lib/LandingPage";

// "/" agora é a landing page de vendas (pública, mesmo domínio zmeta.com.br/www.zmeta.com.br).
// Quem JÁ tem sessão ativa (inclusive quem abre o PWA instalado, cujo start_url antigo ainda
// aponta pra "/" em quem instalou antes dessa mudança — ver public/manifest.json) é redirecionado
// direto pro próprio dashboard sem nem ver a landing. Quem não tem sessão só vê a landing mesmo,
// sem redirecionamento nenhum — o botão "Entrar" dela leva pra /login, que é quem hoje cuida de
// verdade do fluxo de autenticação.
// 2026-07-25: a checagem de sessão só rodava DEPOIS do primeiro paint, então a landing sempre
// aparecia (mesmo pra quem tem sessão válida) por uma fração de segundo antes do redirect — pior
// ainda em PWA instalado com token expirado (renovação de sessão é uma chamada de rede). Igual
// padrão já usado em app/colaborador/page.js e afins: segura a tela com um spinner neutro
// enquanto a sessão é resolvida, e só desenha a landing depois de confirmar que não há sessão.
export default function Home() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) {
        setCheckingSession(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      if (!active) return;
      if (!profile) {
        await supabase.auth.signOut();
        if (active) setCheckingSession(false);
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

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-muted gap-2">
        <Loader2 size={16} className="animate-spin" /> carregando…
      </div>
    );
  }

  return <LandingPage />;
}

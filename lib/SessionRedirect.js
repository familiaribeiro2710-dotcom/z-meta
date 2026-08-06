"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";

// 2026-08-06 — extraído de app/page.js pra tirar o redirect de sessão de dentro do caminho crítico
// de render da landing. Antes, "/" segurava a tela inteira num spinner "carregando…" até resolver
// a sessão (round-trip de rede) pra só então decidir se mostrava a LandingPage — isso significava
// que QUALQUER visitante anônimo (a esmagadora maioria do tráfego) e qualquer crawler (Google,
// preview de link no WhatsApp/LinkedIn, etc.) só via "carregando…" no HTML inicial, sem nenhum
// conteúdo de marketing real. Confirmado testando o HTML puro de zmeta.com.br em produção.
// Agora app/page.js é um componente de servidor que renderiza a LandingPage direto (conteúdo real
// desde o primeiro byte) e este componente roda em paralelo, client-side, só cuidando do caso de
// quem JÁ tem sessão ativa — troca deliberada: quem está logado pode ver um flash rápido da landing
// antes do redirect (inevitável, a checagem de sessão é assíncrona), mas todo o resto do tráfego
// (a maioria) ganha uma página real, indexável, sem espera. Mesma lógica de resolução de role de
// antes, sem nenhuma mudança de comportamento pra quem já tem sessão.
export default function SessionRedirect() {
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

  return null;
}

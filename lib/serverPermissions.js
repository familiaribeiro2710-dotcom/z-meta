// Helper de permissão usado pelas rotas de API (app/api/admin/*) que precisam confirmar se quem
// está chamando (supervisor ou sócio) pode gerenciar uma loja específica.
//
// Sócio gerencia TODAS as lojas da própria empresa de forma implícita — não depende de nenhuma
// linha em `loja_access` (essa tabela é só pra permissão granular de SUPERVISOR, que pode ter só
// "ver" em algumas lojas e "gerenciar" em outras). Isso já é a regra usada pela função
// `can_manage_loja()` no Postgres (fonte de verdade das políticas RLS) — as rotas de API abaixo
// tinham reimplementado essa checagem de forma incompleta, tratando sócio igual a supervisor e
// exigindo `loja_access.permission = 'gerenciar'` também pra sócio. Como sócio normalmente não
// tem (ou tem incompleta) essa linha, isso bloqueava ações legítimas dele com "Você não tem
// permissão de gerenciar essa loja" mesmo sendo dono da empresa.
//
// Uso: `callerClient` autenticado como quem está chamando (pra respeitar RLS na leitura de
// loja_access); `callerProfile` já carregado (role/empresa_id); `lojaEmpresaId` é o empresa_id da
// loja alvo (já validado no call site que ela pertence à empresa certa).
export async function hierarquiaCanManageLoja({ callerClient, callerProfile, userId, lojaId, lojaEmpresaId }) {
  if (callerProfile?.role === "socio") {
    return lojaEmpresaId === callerProfile.empresa_id;
  }
  if (callerProfile?.role === "supervisor") {
    const { data: access } = await callerClient
      .from("loja_access")
      .select("permission")
      .eq("profile_id", userId)
      .eq("loja_id", lojaId)
      .maybeSingle();
    return access?.permission === "gerenciar";
  }
  return false;
}

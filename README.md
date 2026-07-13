# Z Meta

Plataforma multi-empresa: checklist diário de tarefas, advertências, placar
de equipe (individual + geral) e metas de vendas com meta diária
recalculada. Cada empresa cliente tem seus dados totalmente isolados.

## Papéis
- **Master Admin**: cadastra empresas clientes + primeiro gestor de cada uma.
  Pode visualizar e editar os dados de qualquer empresa. Não pertence a
  nenhuma empresa.
- **Gestor**: administra a empresa dele (colaboradores, tarefas,
  advertências, estágios, metas, lançamentos).
- **Colaborador**: checklist diário + lançamento de vendas.

Todo cadastro de gestor ou colaborador exige apenas nome + senha temporária
(usuário gerado automaticamente). No primeiro login, a pessoa é obrigada a
trocar a senha antes de usar o app.

## Stack
- Next.js 14 (App Router) + Tailwind
- Supabase (Postgres + Auth + RLS por empresa) — projeto "z-meta" (fjscwmrjkxgygdzwwrdh)

## Variáveis de ambiente (Vercel → Settings → Environment Variables)
- `NEXT_PUBLIC_SUPABASE_URL` = https://fjscwmrjkxgygdzwwrdh.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (chave publishable, está em .env.production)
- `SUPABASE_SERVICE_ROLE_KEY` = pegar em Supabase → Settings → API → service_role
  (secreta — nunca commitar, só cadastrar direto no Vercel)

## Deploy
O repositório está conectado ao Vercel (Import Git Repository). Qualquer
`git push` na branch `main` atualiza o mesmo projeto automaticamente — sem
trocar de URL.

Settings → Deployment Protection → Vercel Authentication → desligado
(senão gestores/colaboradores não conseguem abrir o app sem conta Vercel).

## Acesso do Master Admin
Login em `/login` com o usuário e senha definidos na criação da conta
Master Admin. Esse usuário não fica em texto puro neste repositório — se
precisar recuperar o acesso, redefina a senha diretamente no Supabase.

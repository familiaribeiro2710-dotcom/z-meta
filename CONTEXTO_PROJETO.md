# Z META — Documento de Contexto do Projeto

> **Como usar este documento:** cole o conteúdo abaixo como primeira mensagem em um novo chat com o Claude para retomar o trabalho no Z Meta com contexto completo. Este arquivo vive em `Z Meta/CONTEXTO_PROJETO.md` dentro da pasta do projeto e deve ser mantido atualizado ao final de cada sessão relevante. **Esta versão substitui integralmente qualquer versão anterior deste arquivo** — o projeto evoluiu muito desde os primeiros rascunhos de contexto (redesign do colaborador, tabela `employee_stage_prizes`, "estágios" do mês etc. são histórico morto, já removidos do sistema).

---

## 1. O que é o Z Meta

Z Meta é um SaaS de gestão de equipes de varejo (moda/atacado), multi-tenant, construído por **Felipe dos Santos Ribeiro**, fundador da **FORGE GROUP**. Ele organiza tarefas diárias, metas de vendas em camadas, comissionamento, advertências e premiações de colaboradores, gerentes, supervisores e sócios de empresas-cliente, com um painel de Master Admin no topo para operar o negócio como um todo (faturamento, cobrança por usuário cadastrado, saúde das lojas). O produto é pensado para ser vendido a outras empresas (multi-tenant desde a fundação).

## 2. Stack técnica

- **Frontend/Backend:** Next.js 14 (App Router), JavaScript puro (sem TypeScript).
- **Estilo:** Tailwind CSS. Fonte do app inteiro: **Inter**, auto-hospedada via `@fontsource/inter` (decisão deliberada — `next/font/google` falha no ambiente de build usado pra verificação, que não tem acesso à internet do Google Fonts; `@fontsource` resolve via npm e é mais robusto em produção também, sem dependência de CDN externo em runtime).
- **Backend de dados:** Supabase (Postgres + Auth + RLS + Storage).
  - **project_id:** `fjscwmrjkxgygdzwwrdh`
- **Local do repositório no computador do Felipe:** `/Users/feliperibeiro/Desktop/Z Meta`
- **Deploy:** Vercel a partir do `git push` na branch principal (o Claude nunca roda `git push` — ver seção 7).
- **Login interno:** usuários entram com `username` + senha; internamente vira `email = ${username}@zmeta.local` no Supabase Auth.

## 3. Hierarquia de papéis (roles)

```
master_admin  → dono do Z Meta (Felipe/FORGE GROUP). Vê e opera todas as empresas-cliente.
   └── socio         → dono de uma empresa-cliente. Vê automaticamente TODAS as lojas da empresa (sem precisar de loja_access).
         └── supervisor  → escopo definido por loja_access (linhas explícitas com permission "ver"/"gerenciar").
               └── gerente     → dono de uma equipe dentro de uma loja (profiles.gerente_id aponta pra ele). Uma loja pode ter vários gerentes com equipes diferentes.
                     └── colaborador → nível operacional. Marca tarefas, lança vendas, vê sua própria meta/comissão.
```

Cada papel tem sua própria rota (`/colaborador`, `/gerente`, `/socio`, `/supervisor`, `/admin`), mas os quatro primeiros reaproveitam os **mesmos componentes de experiência completa**:

| Papel | Componente reaproveitado | Onde mora |
|---|---|---|
| colaborador | `ColaboradorView` | `lib/ColaboradorView.js` |
| gerente | `GerenteView` (dentro renderiza `EmpresaDashboard`) | `lib/GerenteView.js` |
| sócio/supervisor | `HierarchyHome` (dentro renderiza `EmpresaDashboard` por loja selecionada) | `lib/HierarchyHome.js` |
| loja (Placar/Colaboradores/Tarefas/Advertências/Premiações/Metas/Lançamentos) | `EmpresaDashboard` | `lib/EmpresaDashboard.js` |

## 4. Padrão "Ver como" (view-as / impersonation)

Usado extensivamente: gerente vê como um colaborador da própria equipe; supervisor/sócio veem como gerente ou colaborador das lojas sob gestão; **master_admin vê como qualquer usuário de qualquer nível**, inclusive sócio/supervisor.

- `ColaboradorView({ profile, tab, viewedByManager, onBack })` e `GerenteView({ profile, tab, viewedBySupervisor, onBack })` recebem o `profile` da pessoa sendo visualizada e devem ser montados com `key={profile.id}` pra garantir estado limpo por pessoa.
- `HierarchyHome({ role, impersonate, viewerProfile, onExitImpersonation })` — quando `impersonate` é passado (só usado pelo master_admin), a tela inteira vira a experiência daquele sócio/supervisor, com um banner dourado "Visualizando como Master Admin" no topo e botão de voltar.

### ⚠️ Padrão de segurança de identidade (crítico — não regredir)

O cabeçalho (`AppShell`) — nome, avatar e username exibidos em "Meu perfil" — **precisa SEMPRE representar quem está de fato logado**, nunca a pessoa sendo visualizada. A rota `/api/account/update-username` resolve o alvo pelo JWT real da sessão (`callerClient.auth.getUser(token)`), não por qualquer id vindo do cliente. Se o AppShell mostrasse a identidade da pessoa impersonada, "editar meu perfil" mudaria silenciosamente as credenciais reais do Master Admin.

Implementação: dentro de `HierarchyHome.js` existem `shellName`, `shellId`, `shellUsername`, `shellAvatarUrl`, `shellOnNameChange`, `shellOnAvatarChange`, que caem para `viewerProfile.*` (e os callbacks viram `undefined`) somente quando `impersonate` é truthy. Em `app/admin/page.js`, todos os `<AppShell>` sempre usam `profile.*` do próprio master (nunca `viewingProfile.*`). **Qualquer nova tela que suporte impersonation precisa seguir esse mesmo padrão.** Esse foi um bug real já encontrado e corrigido numa varredura — não reintroduzir.

## 5. Modelo de metas em camadas (não somam)

As metas de uma loja/mês (`Meta`, `Super Meta`, `Hiper Meta`...) **não são cumulativas**. A meta "em jogo" é sempre o próximo nível ainda não batido; se todos os níveis já foram batidos, vale o último. Calculado por `currentGoalTarget(sortedTotals, sold)` em `lib/scoring.js`, usado em todo lugar que precisa saber "qual é a meta atual" (herocards de colaborador/gerente/sócio, cálculo de comissão). A comissão aplicada é a da **maior camada efetivamente atingida** (`achievedTier`), não da camada "em jogo". Essa foi uma correção crítica feita depois de um bug real (o sistema estava somando os níveis, o que inflava a meta).

## 6. Estrutura de arquivos principais

```
app/
  layout.js                  → RootLayout, importa fontes Inter (@fontsource) + globals.css.
                                Exporta `metadata` (title/description/manifest/icons/appleWebApp)
                                e `viewport` (width=device-width, initialScale=1, maximumScale=1,
                                userScalable=false, viewportFit=cover, themeColor) — ver seção 8 (PWA).
  page.js                    → redireciona pra rota certa conforme profile.role
  login/page.js
  colaborador/page.js        → busca profile, monta <AppShell><ColaboradorView/></AppShell>
  gerente/page.js            → idem, com <GerenteView/>
  socio/page.js               → idem, com <HierarchyHome role="socio"/>
  supervisor/page.js          → idem, com <HierarchyHome role="supervisor"/>
  admin/page.js                → PÁGINA GIGANTE (~2100 linhas). Início/Financeiro/Dados,
                                  CRUD de empresas/lojas/usuários, view-as universal,
                                  hierarquia de sócios/supervisores. Ver seção 9.
  api/
    account/update-username/route.js
    admin/
      create-empresa, create-loja, create-employee, create-gerente,
      create-hierarchy, update-employee, delete-employee, delete-empresa,
      hierarchy-access  (route.js em cada pasta)
  globals.css                 → base Tailwind + utilitário .scrollbar-hide + overflow-x:hidden defensivo
                                 + overscroll-behavior-y:none, -webkit-tap-highlight-color:transparent,
                                 touch-action:manipulation em html/body (sensação de app nativo — ver seção 8)
public/
  manifest.json                → PWA manifest (name, display:"standalone", theme_color #7c3aed,
                                  background_color #f5f3ee, ícones any + maskable)
  icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png / favicon-32.png / favicon-16.png
                                → gerados a partir do monograma de lib/Logo.js (círculos + seta, gradiente
                                  purple→pink) sobre fundo arredondado (any) e fundo full-bleed (maskable)

lib/
  AppShell.js                 → header global (logo, avatar/nome, sair, nav de abas). Usado por TODAS as telas.
  EditProfile.js               → dropdown "Meu perfil" (nome, username, foto de perfil, trocar senha)
  ChangePassword.js
  ColaboradorView.js
  GerenteView.js
  HierarchyHome.js             → sócio/supervisor + impersonation do master
  EmpresaDashboard.js          → dashboard completo de uma loja (~1650 linhas), reaproveitado por
                                  gerente/supervisor/sócio/master admin
  DateNav.js / MonthNav.js     → navegação de dia/mês
  ProgressBar.js / Led.js
  scoring.js                   → calcIndividualPct, calcTeamPct, currentGoalTarget, formatBRL, formatPct, motivationalMessage
  date.js                      → todayStr, firstDayOfMonth, remainingDaysInMonth, monthLabel, greeting, yesterdayStr
  MaskedInputs.js               → CurrencyInput, CnpjInput, PhoneInput
  Logo.js / Confetti.js
  supabaseClient.js             → client anon (browser)
  supabaseAdmin.js               → client service-role (só usado dentro de app/api/*)
```

## 7. Regras operacionais fixas (NÃO desviar)

1. **Nunca rodar `git push`.** O Claude só verifica que o build passa e entrega ao Felipe um comando pronto pra colar: `git add -A && git commit -m "..." && git push`.
2. **Fluxo de verificação de build:**
   ```bash
   rsync -a --delete --exclude node_modules --exclude .next --exclude .git "<pasta do projeto>/" ~/zmeta_build/
   cd ~/zmeta_build && npm run build
   ```
   Procurar por `✓ Compiled successfully`. Erros de prerender do tipo `Error: supabaseUrl is required` na fase de "Generating static pages" são **esperados** nesse ambiente de sandbox (não existe `.env.local` ali) — não indicam regressão, desde que a compilação em si tenha sido bem-sucedida.
3. **Se `package.json` mudar** (nova dependência): rodar `npm install` dentro de `~/zmeta_build` (por último, depois de já ter copiado os arquivos do repo pra lá) e então copiar o `package-lock.json` resultante de volta pro repositório real — senão o lockfile fica dessincronizado e quebra `npm ci` em produção. Cuidado com a ordem: um `rsync` do repo pra a pasta de build DEPOIS de rodar `npm install` sobrescreve o lockfile atualizado com o antigo — sempre `npm install` por último, e só então copiar o lockfile de volta.
4. **Depois de qualquer mudança de schema/RLS/storage no Supabase**, rodar `get_advisors(type:"security")` e confirmar que não surgiu nenhum alerta novo. O conjunto de avisos abaixo é **esperado e benigno** (não mexer):
   - `public_bucket_allows_listing` nos buckets `empresa-logos` e `avatars` (buckets públicos por design).
   - `anon_security_definer_function_executable` / `authenticated_security_definer_function_executable` em todas as funções `admin_*`, `is_*`, `can_*`, `my_*`, `get_team_progress`, `get_store_sales_ranking`, `prevent_gerente_edit_monthly_prize` — todas são `SECURITY DEFINER` mas verificam a role do caller internamente (`is_master_admin()` etc.) antes de fazer qualquer coisa, então o alerta do linter é um falso positivo conhecido.
   - `auth_leaked_password_protection` desabilitado.
5. **Master admin tem bypass de RLS** (`is_master_admin()`) em `empresas`, `loja_access`, `profiles`, `sales_entries`, `employee_prizes` — por isso várias ações do master em `app/admin/page.js` chamam o Supabase client diretamente (sem passar por `/api/admin/*`).
6. **Padrão de RLS usado nas tabelas operacionais** (tasks, warnings, sales_goals, sales_goal_allocations, sales_entries, app_settings, task_completions, employee_prizes):
   ```sql
   -- SELECT
   is_master_admin() OR employee_id = auth.uid() OR (is_gerente() AND loja_id = my_loja_id()) OR can_view_loja(loja_id)
   -- WRITE (insert/update/delete)
   is_master_admin() OR (is_gerente() AND loja_id = my_loja_id()) OR can_manage_loja(loja_id)
   ```
   Seguir esse padrão exato ao criar qualquer tabela nova ligada a colaborador/loja.
7. **Inputs mascarados** (`lib/MaskedInputs.js`): `<CurrencyInput value={number|""} onChange={...} />` pode ter `value === 0` (falsy em JS) — nunca validar com `if (!value)`, sempre `if (value === "" || value === null || value === undefined)`. Já foi um bug real (bloqueava lançar venda zerada).

## 8. Padrões de mobile-first estabelecidos (seguir em qualquer tela nova)

Auditoria mobile completa foi feita em todo o app numa sessão recente. Convenções fixadas:

- **Grids CSS com números/valores dinâmicos** (herocards de estatística) precisam de `min-w-0` no filho do grid + `break-words` no texto do valor + fonte reduzida em mobile (`text-lg sm:text-xl` ou `text-xl sm:text-3xl`, dependendo do contexto) — grid tracks não encolhem abaixo do conteúdo por padrão, diferente de flex.
- **Linhas flex com texto dinâmico + botões de ação** (nome de pessoa + badges + editar/excluir) levam `flex-wrap gap-2` como padrão de segurança, mesmo que `flex-shrink` já ajude na maioria dos casos.
- **Tabelas** (`<table>`) sempre dentro de `<div className="card overflow-x-auto">`.
- **Dropdowns/popovers posicionados com `absolute right-0`** levam `max-w-[calc(100vw-1.5rem)]` pra nunca vazar da viewport em telas de 320-360px.
- **Nav de abas do `AppShell`** usa `overflow-x-auto scrollbar-hide` com cada botão de aba em `shrink-0 whitespace-nowrap` — importante porque sócio chega a ter 5 abas (Início/Metas/Rankings/Faturamento/Supervisores).
- **O círculo de avatar/iniciais do header nunca deve ficar `hidden` em telas pequenas** — é o único gatilho visível pra abrir "Meu perfil" (bug real já corrigido uma vez, não reintroduzir).
- Utilitário `.scrollbar-hide` e `overflow-x: hidden` defensivo no `html, body` vivem em `app/globals.css`.
- **PWA / sensação de app nativo (fixado nesta sessão):** antes desta correção o app não tinha `public/manifest.json`, nenhum ícone e nenhuma meta viewport explícita — por isso o PWA instalado abria com zoom errado e com a barra de navegação do navegador visível (Android/iOS tratavam o "Adicionar à tela de início" como um bookmark comum, não como app instalável). Corrigido com: `export const viewport` em `app/layout.js` (width=device-width, initialScale=1, maximumScale=1, userScalable=false, viewportFit=cover), `manifest.json` com `display: "standalone"`, `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }` no `metadata`, e `overscroll-behavior-y: none` + `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation` em `html, body` no `globals.css` (elimina o "bounce" de scroll de navegador e o flash cinza de toque). **Importante: PWAs já instalados no celular do Felipe precisam ser removidos da tela de início e reinstalados (`Adicionar à Tela de Início` de novo) depois do deploy** — o modo de exibição (`standalone`) e os ícones são capturados no momento da instalação, não são aplicados retroativamente a um ícone já instalado.

## 9. Banco de dados — visão geral

**Tabelas principais:** `profiles` (id, full_name, role, active, username, empresa_id, loja_id, gerente_id, must_change_password, avatar_url), `empresas` (id, name, cnpj, telefone, email, logo_url, active, plano, valor_por_usuario, desconto, created_at), `lojas`, `sales_goals` (metas em camadas, por loja/mês), `sales_goal_allocations` (meta individual por colaborador), `sales_entries` (**coluna `daily_amount`** — valor vendido NAQUELE dia, não acumulado), `employee_prizes` (premiação livre por colaborador/mês — pode haver várias por mês), `warnings`, `tasks` (colunas `recurrence_type` `daily`/`weekly`/`once`, `weekday` 0-6 quando `weekly`, `once_date` quando `once` — ver seção 11 "Recorrência de tarefas"), `task_completions` (**FK `task_id` é `ON DELETE CASCADE`** — nunca fazer hard delete de uma `task` que já tem completions; ver seção 11), `commission_settings`, `app_settings`, `loja_access`.

> Nota histórica: a tabela `employee_stage_prizes` (premiação "por estágio do mês") e o conceito de "estágios" (dias 1-10/11-20/21-fim) que apareciam em rascunhos antigos deste documento **foram removidos do sistema**. O modelo atual de premiação é `employee_prizes`, simples, sem noção de estágio, lançado livremente pelo supervisor/master_admin.

**RPCs principais:** `admin_overview()`, `admin_lojas_health(p_month)`, `admin_financeiro(p_month)`, `admin_faturamento_mensal(p_empresa_id)`, `admin_delete_empresa(p_empresa)`, `get_team_progress(p_month, p_loja)`, `get_store_sales_ranking(p_month, p_loja)` (ranking de vendas da loja, ver seção 11), `is_master_admin()` / `is_socio()` / `is_supervisor()` / `is_gerente()`, `can_view_loja()` / `can_manage_loja()`, `is_my_team_member()`.

**Storage buckets:**
- `empresa-logos` — público, só master_admin escreve.
- `avatars` — público (leitura), cada usuário só escreve/edita/apaga dentro da própria pasta (`{uid}/avatar.ext`), master_admin com bypass.

### Técnica de simulação de RLS (útil pra debugar "por que esse usuário não vê X")
```sql
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<uuid-do-usuario>','role','authenticated')::text, true);
<query a testar>
```
Rodar cada verificação como uma chamada separada de `execute_sql` — múltiplos statements com `;` só retornam confiavelmente o último result set.

## 10. Design tokens

Navy `#12203a` (texto principal), gold `#c9a15a`/goldlight `#e4c789`, purple `#7c3aed`, pink `#ec4899` (gradiente principal purple→pink em botões/gradient-text), verde (gerente) `#16a34a`/`#4ade80`, lilás (colaborador) `#a78bfa`/`#ddd6fe`, prata (sócio) `#94a3b8`/`#cbd5e1`, azul (supervisor) `#2563eb`/`#60a5fa`, teal `#0d9488`/`#5eead4`.

**Bug de CSS recorrente já corrigido na raiz:** classes customizadas (`.input`, `.btn`, `.btn-outline`, `.card`, `.label`, `.badge`) em `app/globals.css` precisam estar dentro de `@layer components { ... }`. Fora disso, `.label` (que tem `display:block`) vence utilities `flex`/`inline-flex` aplicadas junto na mesma className, quebrando ícone+texto em duas linhas. Se esse bug reaparecer, é porque uma classe nova foi adicionada fora do `@layer components`.

## 11. Histórico completo de features já construídas

### Fundação e comissionamento
- Comissão em camadas (colaborador/gerente + taxa de "não atingimento"), metas como níveis não-cumulativos (correção crítica, ver seção 5).
- RLS revisado e restrito por papel em várias rodadas; padrão fixado na seção 7.6.

### Colaborador
- Herocard com meta do dia, falta pra meta do mês, dias restantes no mês, atividades pendentes, comissão até agora, premiações.
- Checklist de tarefas com navegação por dia (`DateNav`), lançamento de venda (data sempre hoje, exceto correções feitas por gestor), aceita valor zero.
- Dashboards de metas do mês com barra de progresso por nível + "falta pra bater" por meta.
- Modal de parabéns/confete ao completar 100% das tarefas do dia (sem streak/foguinho — feature removida a pedido do Felipe).

### Gerente
- Herocard agregado da equipe (não da loja inteira — `gerente_id` escopa "minha equipe", já que uma loja pode ter vários gerentes com equipes diferentes).
- Pode ver como qualquer colaborador da própria equipe.
- Dashboard "Metas da loja" (read-only) e "Comissionamentos".
- Painel pessoal (tarefas/advertências/premiações atribuídas a ele mesmo pelo supervisor).

### Supervisor / Sócio (`HierarchyHome`)
- Sócio vê automaticamente todas as lojas da empresa (sem precisar de `loja_access`); supervisor só as lojas com acesso explícito.
- Seletor de loja + seletor de mês no topo.
- Abas: Início, Metas, Rankings (top vendedores / mais premiados / melhor barra / mais comissionados), Faturamento (por loja), e — só pra sócio — Supervisores (cadastro e gestão de acesso).
- Pode ver como qualquer gerente/colaborador das lojas sob gestão.

### Master Admin (`app/admin/page.js`)
- Abas: **Início** (visão geral: empresas ativas, usuários cadastrados, novas empresas, empresas esquecidas + gráfico de crescimento + form colapsável "Nova empresa" + lista de empresas com busca/ordenação), **Financeiro** (cobrança por empresa: usuários cadastrados × valor por usuário − desconto = quanto cobrar, editável), **Dados** (faturamento/usuários/premiações/lojas por empresa, com drill-down pra histórico mensal completo de faturamento por período, com presets 3/6/12 meses/tudo).
- **Ver como qualquer usuário** de qualquer nível hierárquico (colaborador/gerente via componentes existentes; sócio/supervisor via `HierarchyHome` com `impersonate`).
- Dashboard "Sócios e Supervisores" por empresa: vincular/desvincular lojas, ver colaboradores sob gestão, editar/resetar senha.
- Upload de logo por empresa (`EmpresaAvatar`).

### Perfil e conta
- **Foto de perfil pra todos os níveis** (bucket `avatars`, upload no dropdown "Meu perfil", exibida no círculo do header).
- Fonte do app trocada pra **Inter** (self-hosted via `@fontsource/inter`).

### Varredura geral de bugs (sweep completo)
Auditoria de todas as páginas/papéis/rotas de API/RLS já foi feita. Dois bugs reais foram encontrados e corrigidos (ambos em `HierarchyHome.js`, ligados à feature de impersonation do master): vazamento de identidade no header durante impersonation (ver seção 4), e aba Supervisores quebrada quando acessada via impersonation (faltava `empresaId` no payload da API).

### Otimização mobile (mais recente)
Auditoria completa de responsividade em todo o app — ver seção 8 pros padrões fixados. Bugs reais corrigidos: avatar do header invisível em mobile (`hidden sm:flex` no gatilho de "Meu perfil"), nav de abas sem scroll horizontal, herocards com risco de overflow em telas estreitas (grids CSS sem `min-w-0`), dropdowns sem clamp de largura (`w-80`/`w-56` vazando em telas de 320px).

### PWA — manifest, ícones e viewport (sessão mais recente)
O app nunca teve `public/manifest.json` nem ícones — o "PWA" instalado por Felipe era, na prática, um bookmark do navegador. Dois bugs reais corrigidos, ver seção 8 pro detalhe técnico completo:
1. **Zoom incorreto ao abrir** — não havia `export const viewport` em `app/layout.js`. Adicionado com `initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover"`.
2. **Barra de navegador visível em vez de tela cheia** — sem manifest com `display: "standalone"` e sem `appleWebApp` no `metadata`, tanto Android quanto iOS tratam "Adicionar à Tela de Início" como atalho comum. Criado `public/manifest.json` (ícones 192/512/maskable-512 gerados a partir do monograma de `lib/Logo.js`) + `apple-touch-icon.png` + `manifest`/`icons`/`appleWebApp` em `metadata`.
Bônus de sensação nativa: `overscroll-behavior-y: none`, `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation` em `html, body` (`globals.css`) — elimina bounce de scroll estilo navegador e o flash cinza ao tocar em botões.
**Pendência do lado do Felipe:** reinstalar o PWA (remover da tela de início + "Adicionar à Tela de Início" de novo) depois do deploy, já que ícone/modo de exibição não atualizam num atalho já instalado.

### Ranking de vendas na visão do colaborador (nova feature)
Adicionado no `tab === "atividades"` (tela inicial) do `ColaboradorView.js`:
- Card **"Ranking de vendas"** logo abaixo de "Minhas metas" — lista todos os colaboradores ativos da mesma loja ordenados por valor vendido no mês, com a linha do próprio usuário destacada (fundo roxo claro, "(você)").
- No herocard, novo stat **"Posição no ranking"** ao lado de "Premiações" (grid do herocard passou de `sm:grid-cols-5` pra `sm:grid-cols-3 lg:grid-cols-6` pra caber o 6º item).

**Detalhe técnico importante (RLS):** a política de `profiles_select` só libera ver o perfil de outra pessoa via `can_view_loja()`, que só retorna true pra gerente/sócio/supervisor/master_admin — um colaborador comum NUNCA teria acesso ao nome/perfil de um colega pela RLS direta. Por isso o ranking não é montado com queries client-side em `profiles`/`sales_entries` (retornaria só o próprio usuário); foi criada a function `public.get_store_sales_ranking(p_month date, p_loja uuid default null)` no Supabase — `SECURITY DEFINER`, mesmo padrão de `admin_financeiro`/`get_team_progress`: usa `p_loja` se informado (default `my_loja_id()`), confere internamente `is_master_admin() OR v_loja = my_loja_id() OR can_view_loja(v_loja)` antes de retornar qualquer linha, e devolve `employee_id, full_name, sold` só dos colaboradores ativos daquela loja. Testada simulando RLS como colaborador de verdade (retornou os 4 colegas da loja corretamente) e via `get_advisors(security)` (só apareceu o alerta esperado de "SECURITY DEFINER executável" — mesma categoria benigna de sempre, ver seção 7.4; adicionar `get_store_sales_ranking` à lista de funções conhecidas ali). Client-side, `ColaboradorView.js` chama `supabase.rpc("get_store_sales_ranking", { p_month: monthArg, p_loja: lojaId })` dentro do `loadAll`.
**Padrão a repetir:** qualquer feature futura que precise "colaborador vendo dado agregado de colegas" deve passar por uma function `SECURITY DEFINER` assim — nunca tentar resolver abrindo a RLS de `profiles`/tabelas operacionais pra colaborador comum (quebraria o isolamento entre colaboradores, que é intencional).

### Rodada de ajustes visuais/mobile (sessão mais recente)
1. **Herocard do gerente — líder de vendas.** `GerenteView.js`: `loadStats` agora calcula, a partir do `entryRows` da equipe (já buscado ali mesmo), quem vendeu mais no mês (`leaderName`), e o herocard ganhou um 6º stat "Líder de vendas" ao lado de Premiações (mesmo tratamento de grid `sm:grid-cols-3 lg:grid-cols-6` já usado no herocard do colaborador).
2. **Abas Placar/Colaboradores/Tarefas/Advertências/Premiações quebrando em 2 linhas no mobile.** Eram o componente `SubNav` (`EmpresaDashboard.js`) — usado por Início E Metas, em todas as visões (gerente/supervisor/sócio/master, já que é reaproveitado por `EmpresaDashboard`) — com `flex flex-wrap`, por isso quebrava em vez de rolar. Trocado por `flex-1` em cada botão no mobile (soma sempre a largura do container, nunca estoura nem quebra linha), ícone em cima + label truncado embaixo, fonte bem pequena (`text-[9px]`); a partir de `sm:` volta ao pill horizontal original (ícone+label lado a lado, fonte maior). **Não** mexemos nas abas de nível superior do `AppShell` (Início/Metas/Rankings/Faturamento/Supervisores do sócio) — essas continuam com scroll horizontal (padrão já documentado na seção 8) porque não foi isso que foi reportado como quebrado.
3. **Texto "Se o mês fechasse hoje" mostrando o valor do prêmio.** Só existia em `EmpresaDashboard.js` (`Placar`, card "Barra geral da equipe", visível pra gerente e master_admin — supervisor/sócio veem uma barra diferente, "Barra de vendas", que nunca mostrou valor). Trocado pra `Se o mês fechasse hoje: premiação liberada!` / `... premiação zerada (abaixo de X%).` — sem valor em nenhum dos dois casos. `ColaboradorView.js` já não mostrava o valor (mensagem "Prêmio garantido se seguir assim!" / "Prêmio do mês liberado com X%+..."), não precisou mexer.
4. **Títulos (`<h1>`) grandes demais no mobile, em todas as páginas/visões.** Todos os `<h1>` do app (`ColaboradorView`, `GerenteView`, `HierarchyHome`, `app/admin/page.js` — Início, loja, Financeiro, Dados, empresa, sócios/supervisores) foram trocados de tamanho fixo pra responsivo: `text-xl font-bold` → `text-lg sm:text-xl font-bold`, e o único `text-2xl font-extrabold` (saudação do colaborador) → `text-xl sm:text-2xl font-extrabold`. Desktop fica idêntico, só o mobile encolhe.
5. **Placar individual.** Removido o subtítulo "— ranqueado por valor vendido" (ficou só "Placar individual"). No mobile, a tabela larga (Colaborador/Tarefas/Advertências/Vendido/%) foi substituída por uma lista de blocos por colaborador — nome + valor vendido na mesma linha, barra de progresso **abaixo** do nome, tarefas/advertências como legenda pequena embaixo. A partir de `sm:` continua a tabela de sempre (`hidden sm:table` / `sm:hidden` fazem a troca).
6. **Ordem "Distribuição da meta em jogo" vs "Configurações".** Só existia essa ordem invertida na visão do **gerente** (`GerenteView.js`): o card "Distribuição da meta em jogo" (leitura da distribuição da meta atual entre a equipe) vivia DEPOIS do `<EmpresaDashboard>` inteiro — ou seja, abaixo até do card "Configurações" (prêmio/desconto/meta da barra) que mora dentro do Placar. Movido pra cima do `<EmpresaDashboard>`, logo após o herocard — agora aparece antes de qualquer coisa vinda do EmpresaDashboard, incluindo Configurações. "Painel pessoal" continua na mesma posição de antes (depois do EmpresaDashboard).
7b. **Subtítulos removidos/simplificados na aba Metas (`EmpresaDashboard.js`, todas as visões).** Card "Comissionamentos": removida a frase explicativa abaixo do título ("Taxa aplicada enquanto ninguém bateu..."). Card de cada meta: o subtítulo (que tinha valor da meta + % comissão colaborador + % comissão gerente + modo de distribuição) virou só o valor da meta (`{formatBRL(g.store_total)}`) — o resto dessa informação (comissão, distribuição) continua visível mais abaixo no próprio card, só não repete no subtítulo.
7c. **Auditoria do cálculo de "atividades pendentes" (herocard gerente) vs. "Placar individual" (Tarefas completed/expected).** Felipe estranhou ver "4 pendentes" no herocard do gerente enquanto o Placar individual mostrava "50/55" pro colaborador Gustavo. Verificado direto no banco (Gustavo tem 4 tarefas ativas; nenhuma feita hoje ainda; os outros 3 da equipe do gerente não têm tarefa nenhuma cadastrada) — **os dois números batem e ambos os cálculos estão certos**: "atividades pendentes" no herocard é só de HOJE, somando o time inteiro (4 tarefas ativas, 0 feitas hoje = 4 pendentes); "50/55" no Placar é acumulado do MÊS INTEIRO, só do Gustavo (tarefas esperadas x concluídas dia a dia desde o dia 1). São métricas de janelas de tempo e escopos diferentes — não deveriam bater, e a comparação direta que gerou a estranheza não é um bug.
   Durante essa auditoria achei um bug real e diferente, já corrigido: o `board`/placar (`EmpresaDashboard.js`, função `loadAll`) montava o placar a partir de `emps` **sem filtrar `active`** — diferente da query de "atividades pendentes" do `GerenteView.js`, que já filtrava só ativos. Ou seja, um colaborador desligado continuaria aparecendo no Placar individual/ranking/barra da equipe (com números desatualizados), mesmo já tendo sumido do "atividades pendentes" do herocard. Corrigido adicionando `.filter((emp) => emp.active)` antes de montar o `board` — a aba Colaboradores continua listando todo mundo (inclusive inativos, pra dar pra reativar); só o placar/ranking passou a considerar apenas ativos.

### Exclusão de tarefa sem apagar histórico + recorrência de tarefas (sessão mais recente)
Dois pedidos do Felipe na mesma sessão, ambos em torno de `tasks`/`task_completions`:

1. **"Excluir" tarefa não pode apagar dias já realizados.** Causa raiz: a FK `task_completions.task_id → tasks.id` é `ON DELETE CASCADE`. O botão "excluir" de `Tarefas` (`EmpresaDashboard.js`) fazia `DELETE FROM tasks`, que em cascata apagava **todo** o histórico de completions daquela tarefa — inclusive dias já concluídos, reescrevendo indicadores passados (mês fechado, barra da equipe, comissão etc. de meses anteriores mudariam retroativamente). Corrigido: `removeTask` agora nunca faz `DELETE` na tabela `tasks`. Em vez disso: (a) apaga só as linhas de `task_completions` dessa tarefa que sejam `completed = false` **e** `completion_date >= hoje` (ou seja, só pendências de hoje em diante — dias passados, feitos ou perdidos, nunca são tocados); (b) marca a tarefa como `active = false` (mesmo efeito de "pausar", só que iniciado pelo botão "excluir", com confirmação via `window.confirm`). Resultado prático: a tarefa para de valer dali pra frente, mas nenhum dia já registrado é apagado ou alterado — nem os feitos, nem os perdidos.
   **Padrão a repetir:** qualquer ação de "excluir" numa tabela com histórico dependente (FK `ON DELETE CASCADE` ou não) deve ser auditada com a mesma pergunta — "isso apaga fatos já acontecidos?" — antes de implementar como hard delete.

2. **Recorrência de tarefas (diária / 1x por semana / só uma vez).** Antes, toda tarefa cadastrada era implicitamente "todo dia, pra sempre" — não existia conceito de recorrência no schema. Adicionado:
   - **Migração** (`add_task_recurrence`): `tasks` ganhou `recurrence_type` (`'daily'` | `'weekly'` | `'once'`, default `'daily'` — todas as tarefas antigas continuam válidas como diárias, sem precisar migrar dado nenhum), `weekday` (0-6, domingo=0, só quando `weekly`) e `once_date` (só quando `once`). Constraint `tasks_recurrence_shape_chk` garante que cada tipo só preenche o campo que faz sentido pra ele (ex.: não dá pra ter `recurrence_type='daily'` com `once_date` preenchido).
   - **Helper novo** `isTaskDueOn(task, dateStr)` em `lib/date.js` (junto de `WEEKDAY_LABELS`) — decide se uma tarefa "vale" num dia específico. É o único lugar que sabe a regra; todo o resto do app só chama essa function.
   - **Onde a regra é aplicada:** o pulo do gato é que a regra só precisa ser checada no **momento de semear** a linha de `task_completions` do dia (e ao decidir o que mostrar no checklist daquele dia) — os agregados do mês (`expected`/`completed`, barra individual, ranking) continuam contando linhas que já existem em `task_completions`, sem precisar de nenhuma mudança, porque uma tarefa semanal/única só vai ter linha nos dias em que realmente esteve em jogo. Ajustado em três lugares:
     - `ColaboradorView.js` (`loadAll`): só semeia hoje e só conta como "hoje" as tarefas com `isTaskDueOn(t, hoje)`; o checklist (`viewTasksList`) e o card "Tarefas de hoje" (herocard: `doneCount`/`pendingCount`/`todayPct`, e o gatilho do modal de parabéns) passaram a usar esses conjuntos filtrados por dia, tanto pra hoje quanto pro dia sendo navegado via `DateNav`.
     - `GerenteView.js` (`loadStats`): "Atividades pendentes" do herocard passou a filtrar por `isTaskDueOn` antes de contar (precisou trocar o `select("id")` por `select("id, recurrence_type, weekday, once_date")`); o "Painel pessoal" (tarefas atribuídas diretamente ao gerente) também só mostra/conta as tarefas do dia.
     - `EmpresaDashboard.js` (`Tarefas`): formulário de criação ganhou os 3 botões de recorrência ("Todos os dias" / "1 dia na semana" / "Só uma vez") com seletor de dia da semana ou data conforme a escolha (inclusive no modo "replicar pra todos os colaboradores da loja" — todos recebem a mesma regra); a lista de tarefas cadastradas mostra a recorrência de cada uma (`recurrenceLabel`: "todo dia" / "toda [dia]" / "só em [data]"); o "Checklist do dia" (`dueTasks`) só mostra quem vale no dia sendo visualizado.
   **Testado** no Supabase (insert de uma tarefa de cada tipo dentro de uma transação com rollback, conferindo os 3 formatos salvos certos) e `get_advisors(security)` sem novidade além do padrão já conhecido de SECURITY DEFINER.

### Aba Metas ainda poluída pra supervisor/sócio (sessão mais recente)
As limpezas anteriores (subtítulos, fonte menor) já valiam pra todo mundo por ser componente compartilhado, mas quem tem `canManage` (supervisor/sócio/master_admin) vê MUITO mais UI que o gerente (que só visualiza) — formulário de criar meta sempre aberto, e a lista de distribuição de cada meta listando **todo colaborador individualmente, um por um**, mesmo quando o valor é igual pra todos. Isso é provavelmente a real fonte da "poluição" que o gerente não sofre tanto. Duas mudanças em `EmpresaDashboard.js` (`Metas`):
1. **"Nova meta" virou colapsável** (mesmo padrão já usado em "Nova empresa" no admin e "Novo gerente"/"Nova empresa": botão com chevron, formulário fecha por padrão e depois de criar a meta). Reduz um formulário de 5 campos sempre visível pra um botão de uma linha.
2. **Distribuição da meta: lista vira resumo de uma linha quando é igual pra todos.** Antes, cada card de meta sempre listava nome+valor de cada colaborador (repetindo o mesmo valor várias vezes quando a distribuição é igual — o caso mais comum). Agora, se `isEvenSplit(goalAllocs)` for verdadeiro, mostra só "`N colaborador(es) · R$X cada`"; a lista pessoa-a-pessoa só aparece quando a distribuição é de fato custom (valores diferentes por pessoa, onde listar faz sentido).
**Ponto cego encontrado e corrigido: modo leitura para `viewerRole === "leitor"` em toda a `EmpresaDashboard.js`.** Confirmado pelo Felipe ("Sim, corrige agora" → depois "Corrige tudo agora (recomendado)" ao ver que o escopo era maior do que parecia). Achado original: `Metas()`, `Placar()` e `Colaboradores()` usavam `viewerRole !== "gerente"` pra liberar edição, o que incluía sem querer o viewerRole `"leitor"` (supervisor/sócio com permissão só de "ver", não "gerenciar", numa loja via `loja_access` — setado em `HierarchyHome.js` como `viewerRole={canManageSelected ? role : "leitor"}`). Investigando mais a fundo, o problema era ainda maior: `Tarefas()`, `Advertencias()` e `Premiacoes()` não tinham NENHUM gate — qualquer viewerRole conseguia criar/editar/excluir tarefas, advertências e premiações, e marcar o checklist de qualquer colaborador, mesmo sendo só "leitor".
  - **Correção aplicada** (padrão repetido em cada componente): variável `canEdit`/`canManage`/`canManageTeams`/`canEditPrize`/`canEditSettings` excluindo `"leitor"` além de `"gerente"` onde já se aplicava, escondendo formulários de criação e botões de ação (editar/excluir/pausar/reativar) quando o viewer é só leitor. No checklist de tarefas (`Tarefas()`), o botão de marcar/desmarcar vira um ícone não-clicável pra leitor. `Metas()`: `canManage` passou de `viewerRole !== "gerente"` para `viewerRole !== "gerente" && viewerRole !== "leitor"`. `Lancamentos()` não recebia `viewerRole` como prop — adicionado (o call-site já passava, só o componente não usava) e o formulário "Corrigir/lançar valor vendido" agora é escondido pra leitor.
  - **Nuance de severidade importante:** isso era um bug só de UI, não um buraco de segurança de dado. A função `can_manage_loja(p_loja)` do Postgres — que já governa TODAS as policies RLS de escrita no banco (tasks, warnings, employee_prizes, goals, sales_entries, etc.) — exige `loja_access.permission = 'gerenciar'`. Um "leitor" (permission = 'ver') sempre falharia essas escritas no banco, mesmo antes dessa correção. Ou seja, o pior cenário real era um leitor ver botões que, ao clicar, dariam erro silencioso ou visível do Supabase — não um vazamento ou alteração de dado indevida. Essa correção resolve a experiência confusa/quebrada, não uma vulnerabilidade de dados.
  - **Fora do escopo desta correção, sinalizado mas não implementado:** o fluxo "ver como" (impersonar um colaborador/gerente a partir da visão de supervisor/sócio) não tem modo leitura de verdade — um "leitor" usando "ver como" ainda consegue, pela UI de `ColaboradorView`/`GerenteView`, tentar marcar tarefas ou lançar vendas como se fosse aquela pessoa (também bloqueado no banco pela mesma RLS `can_manage_loja`, então mesmo nuance de severidade se aplica). Corrigir isso de verdade exigiria passar um flag de somente-leitura por essas duas views inteiras — mudança arquitetural maior, não pedida ainda.
7. **Textos menores na aba Metas, em todas as visões.** Em `EmpresaDashboard.js` (`Metas`/`Lancamentos`, usados por gerente/supervisor/sócio/master) e em `ColaboradorView.js` (aba Metas do colaborador): títulos de cada card de meta, listas de comissionamento/distribuição e o histórico de lançamentos ganharam `text-xs sm:text-sm` (ou `text-[11px] sm:text-xs`) no lugar de `text-sm`/`text-xs` fixo — só encolhe no mobile, desktop sem mudança. Os números grandes de destaque (Meta de hoje, Falta pra bater, valores do herocard) foram mantidos do tamanho que já estavam — o pedido era limpar o texto "miúdo", não os números-destaque.

**Atualização — confirmado por Felipe:** funcionou perfeitamente no iOS. No Android, o PWA instalado **não rolava (scroll) pra cima nem pra baixo, travado por completo**. Causa: `overscroll-behavior-y: none` + `touch-action: manipulation`, aplicados em `html, body` (globals.css) — bug conhecido do Chrome/WebView do Android, onde essas duas props no elemento raiz de scroll travam a rolagem inteira da página no contexto de PWA instalado (WebAPK). iOS não é afetado da mesma forma. **Removidas as duas** de `globals.css`; ficou só `-webkit-tap-highlight-color: transparent` (puramente cosmético, sem risco de travar scroll). **Lição: não reintroduzir `overscroll-behavior` nem `touch-action` no elemento raiz (`html`/`body`) sem testar em Android real antes** — teste só em iOS não é suficiente pra essas duas props.

**Atualização — o scroll continuou travado no Android mesmo depois disso.** Causa: sobrou um `overscroll-none` (utilitário Tailwind = `overscroll-behavior: none`) direto no `className` do `<body>` em `app/layout.js` — a limpeza anterior só tinha removido a declaração equivalente do `globals.css`, mas esse mesmo culpado voltava por um segundo caminho (classe no JSX) que passou despercebido. Removido. **Lição adicional: ao caçar esse tipo de bug, checar os DOIS lugares — CSS global E className inline nos componentes — não só um.**

### Dois bugs reais corrigidos numa sessão seguinte
1. **Financeiro (master) mostrava "Usuários cadastrados" zerado.** Causa: em `FinanceiroTab` (`app/admin/page.js`), o `useMemo` de `totals` calculava a variável `usuarios` mas **não a incluía no objeto retornado** (`return { receita, colaboradores, ticketEmpresa, ticketUsuario }` — faltava `usuarios`), então `totals.usuarios` chegava `undefined` no `HeroStat`. O RPC `admin_financeiro` em si sempre esteve correto (confirmado rodando a função direto no Supabase). Corrigido incluindo `usuarios` no retorno. A aba **Dados** nunca teve esse bug (já retornava `usuarios` certinho).
2. **Campo "Dia da venda" (card "Lançar valor vendido ontem", `ColaboradorView.js`) gigante e desproporcional no mobile.** Causa: era um `<input type="date">` nativo do HTML, que em alguns Android/iOS renderiza o valor bem maior que os outros inputs quando não focado. Numa primeira tentativa foi trocado pelo componente `DateNav` (setas anterior/seguinte). **Felipe pediu de volta o calendário nativo** (precisa poder escolher qualquer dia do mês, não só andar dia a dia com setas) — revertido pro `<input type="date">`, agora com a classe `date-input` e uma regra dedicada em `globals.css` (`input[type="date"].date-input { -webkit-appearance: none; appearance: none; font-size: 0.875rem; line-height: 1.25rem; color-scheme: light; }`) forçando o mesmo tamanho de fonte dos outros campos, na tentativa de evitar o "pill" gigante sem perder o calendário. `max={today}` no próprio input substitui o `maxDate` que o `DateNav` fazia. **Isso é best-effort — não foi possível testar em dispositivo Android/iOS real dentro desta sessão; se o campo voltar a ficar desproporcional, os próximos passos seriam ajustar essa regra CSS com mais força ou, em último caso, construir um calendário próprio (não nativo).** `DateNav` continua em uso normalmente na navegação de dia das Tarefas — não foi removido do projeto.

### Textos quebrando em 2 linhas de forma feia (política geral anti-quebra)
Felipe reportou que na aba **Rankings** (`RankingsTab`/`RankingCard` em `HierarchyHome.js`, visão supervisor/sócio — lista cruzada "Top vendedores"/"Mais premiados"/"Melhor barra"/"Mais comissionados" entre todas as lojas) as linhas de cada item quebravam em 2 linhas de forma feia no mobile, e pediu uma regra geral: **nenhum dashboard do app pode quebrar texto em 2 linhas de forma quebrada** — sempre diminuir a fonte antes de deixar quebrar, porque empresas futuras vão trabalhar com metas de valores maiores (mais dígitos = strings mais longas). Também pediu limite de caracteres nos nomes de usuário para evitar esse tipo de problema.
1. **`RankingCard` (`HierarchyHome.js`).** Cada linha tinha nome + "· loja" + valor todos soltos dentro de um `flex justify-between` sem `truncate`/`shrink-0` — nome+loja longos empurravam o valor pra quebrar linha. Corrigido: nome+loja viram um único `<span className="truncate">` (corta com "…" em vez de quebrar), valor ganha `shrink-0 whitespace-nowrap`, e a fonte do item cai pra `text-xs sm:text-sm`.
2. **Padrão repetido em todo lugar que lista "nome da meta + valor" ou "nome do colaborador + valor".** Mesmo bug de raiz existia em vários pontos: lista "Metas da loja" (dentro do herocard do supervisor/sócio em `HierarchyHome.js`), `Placar()` (`EmpresaDashboard.js`, cards "Metas da loja" e "Premiações lançadas"), `Metas()` (`EmpresaDashboard.js`, cards de cada meta — já usava `text-xs sm:text-sm` de uma limpeza anterior, mas sem `truncate`/`shrink-0`), e o ranking de vendas do colaborador (`ColaboradorView.js`). Em todos: nome do lado esquerdo ganhou `min-w-0` + `truncate` (ou span dedicado pra truncar), valor/badge do lado direito ganhou `shrink-0 whitespace-nowrap`. Os herocards com números grandes (Meta de hoje, Falta pra meta, etc., em `HierarchyHome.js`/`EmpresaDashboard.js`/`GerenteView.js`/`ColaboradorView.js`) já tinham esse cuidado de sessões anteriores (`min-w-0` + `break-words` dentro de cada célula do grid) — não precisaram de mudança.
3. **Limite de caracteres nos campos de nome/usuário**, pra reduzir a chance de nomes absurdamente longos causarem esse tipo de problema em primeiro lugar: `maxLength={40}` em todo input de "nome completo" (colaborador, gerente, supervisor/sócio, edição de nome de usuário existente) e `maxLength={20}` em todo input de "usuário (login)", tanto em `EmpresaDashboard.js` (`Colaboradores()`) quanto em `app/admin/page.js` (`AddGerenteForm`, `AddColaboradorForm`, `AddHierarchyForm`, edição de usuário existente). Também `maxLength={50}` no nome da empresa e `maxLength={30}` no nome da meta (`Metas()`), já que esses nomes aparecem lado a lado com valores nas mesmas linhas afetadas pelo item 2.
   **Nota importante:** esse `maxLength` é só client-side (trava só no formulário). As rotas de API (`/api/admin/create-employee`, `create-gerente`, `create-hierarchy`) que de fato gravam no banco não validam esse limite — então tecnicamente ainda é possível, batendo direto na API, gravar um nome mais longo. Não implementei validação/constraint no servidor ou no banco porque isso era um pedido de polimento visual, não de integridade de dado, e uma constraint de banco exigiria migração e cuidado com nomes já cadastrados que porventura já sejam mais longos. Se quiser fechar esse ponto de verdade (defesa em profundidade), a próxima etapa seria validar o tamanho também dentro das rotas de API.
   **Build verificado:** `✓ Compiled successfully`.

### Placar individual removido do Início; Ranking de vendas chega no gerente e no supervisor (sessão seguinte)
Felipe pediu três ajustes na visão do supervisor mobile: (1) o título "Barra de vendas — vendido / meta — {mês}" (branch `isSupervisorView` de `Placar()`, `EmpresaDashboard.js`) estava grande demais — virou só "Barra de vendas — {mês}" (removido "vendido / meta"); (2) excluir o card **"Placar individual"** (lista mobile + tabela desktop, dentro de `Placar()`) da aba Início, **pra todos os usuários** (gerente, supervisor, sócio, master admin — é um componente compartilhado); (3) em troca, levar o dashboard **"Ranking de vendas"** (que já existia só na Início do colaborador, mostrando a equipe ordenada por valor vendido) também pra visão do gerente e do supervisor.
1. **Placar individual removido.** O bloco inteiro (ambas as versões, mobile `<ul>` e desktop `<table>`) saiu de `Placar()` em `EmpresaDashboard.js`. A variável `ranked` (usada pra ordenar esse placar) continuou no código porque o card **"Líder de vendas até agora"**, logo acima, também depende dela (`ranked.find(...)` pra achar o líder) — não removida, só o card de baixo.
2. **Ranking de vendas no gerente (`GerenteView.js`).** Em vez de chamar a RPC `get_store_sales_ranking` (que existe pra contornar a RLS que bloqueia um colaborador comum de ver perfis dos colegas), o gerente **já tem** os dados prontos: `loadStats` já monta um `soldByEmp` (mapa employee→total vendido no mês) pra calcular o "Líder de vendas" do herocard. Só precisei reaproveitar esse mesmo mapa pra montar a lista ordenada (`storeRanking`) e renderizar o card, sem query nova. Importante: esse ranking é escopado à **própria equipe do gerente** (mesmo filtro `gerente_id = this.gerente.id` que já valia pro resto do dashboard do gerente), não a loja inteira — consistente com o resto dos números que ele já vê (meta, vendido, comissão são todos só da equipe dele, não da loja toda, já que uma loja pode ter mais de um gerente/equipe).
3. **Ranking de vendas no supervisor/sócio (`HierarchyHome.js`).** Mesma lógica: `loadHero` já busca `emps` (colaboradores ativos da loja) e `entryRows` (vendas do mês) pra calcular o herocard da loja inteira — só precisei trocar a query de `emps` pra também trazer `full_name` (antes só trazia `id`) e montar `soldByEmp`/`storeRanking` a partir do que já estava sendo buscado. Aqui o ranking é da **loja inteira** (todas as equipes juntas), consistente com o resto do herocard do supervisor que também agrega a loja toda. Card renderizado na visão por loja, logo depois de "Metas da loja" e antes do `<EmpresaDashboard>`.
   **Nota:** nenhuma dessas duas implementações usa a RPC `get_store_sales_ranking` — ela continua existindo e em uso só pelo colaborador (`ColaboradorView.js`), que é o único papel sem acesso direto via RLS aos perfis dos colegas. Gerente e supervisor/sócio já tinham `can_view_loja`/acesso direto, então bastou reaproveitar dado já carregado, mais rápido que uma call de RPC extra.
   **Build verificado:** `✓ Compiled successfully`.

### Leva de polimento visual: despoluir Placar/Colaboradores/Tarefas/Metas e reformular Rankings/Faturamento (sessão seguinte)
Lista grande de ajustes pedidos por Felipe na visão supervisor mobile e em componentes compartilhados. Regra que ele reforçou no fim: **dashboards compartilhados por vários tipos de usuário precisam ter a mesma cara — só muda O QUE cada um vê, não o layout** — por isso sempre que uma mudança valia pra um componente usado por mais de um papel, apliquei pra todos os papéis que passam por ali, e quando um componente é exclusivo de um papel, chequei se existe um equivalente noutro papel que precisasse do mesmo tratamento.
1. **`Placar()` (`EmpresaDashboard.js`) — dois cards saíram da visão supervisor/sócio:**
   - **"Configurações"** (desconto por advertência, meta da barra geral, premiação mensal) some inteiro quando `isSupervisorView` (supervisor ou sócio) — pedido explícito do Felipe só pra essa visão; continua existindo normalmente pra gerente (só leitura) e master admin (edição).
   - **"Líder de vendas até agora"** passou a só aparecer quando `viewerRole === "master_admin"`. Motivo: esse card virou redundante pra quem já tem o dashboard "Ranking de vendas" na tela de Início (gerente e supervisor/sócio, adicionados na sessão anterior; colaborador já tinha há mais tempo) — só o master admin, que nunca passa pelo `HierarchyHome`/`GerenteView` (vê a loja direto via `<EmpresaDashboard viewerRole="master_admin">` em `admin/page.js`), ainda depende desse resumo aqui dentro do Placar.
2. **`Colaboradores()` (`EmpresaDashboard.js`) — campo "liderados" ao criar gerente virou colapsável.** Label mudou de "Colaboradores dessa loja pra já incluir na equipe (opcional)" pra **"Definir liderados"**; a lista de pills com nome de cada colaborador (sempre visível, ocupando bastante espaço) virou um dropdown: um botão mostrando "N colaborador(es) selecionado(s)" com seta (chevron), que revela as pills só quando clicado (`gTeamOpen` state, mesmo padrão collapse já usado em "Nova meta"/"Nova empresa"). Fecha de novo automaticamente depois de criar o gerente.
3. **`Tarefas()` (`EmpresaDashboard.js`) — texto "Replicar essa tarefa para todos os colaboradores da loja" reduzido** de `text-xs` pra `text-[11px] sm:text-xs`, evitando a quebra feia em 2 linhas no mobile.
4. **`Metas()` (`EmpresaDashboard.js`) — dois ajustes:**
   - Título "Premiação mensal da loja — {mês}" virou só **"Premiação mensal"** (o mês já aparece em outros lugares da mesma tela, não precisava repetir aqui).
   - Botões de ação de cada card de meta ("editar valores" / "editar distribuição" / "excluir") **viraram ícone-only** (`Coins`/`Split`/`Trash2` do lucide-react, com `title`/`aria-label` pra acessibilidade, sem texto visível) — reduz a poluição visual de cada card, principalmente no mobile onde os três botões com texto competiam por espaço com o nome da meta.
5. **`RankingCard` (`HierarchyHome.js`, aba Rankings do supervisor/sócio) — layout de cada item virou empilhado verticalmente** em vez de espremido numa linha horizontal: nome, loja e valor agora ficam cada um na sua própria linha (nome em negrito, loja menor e discreta logo abaixo, valor em negrito por último), no lugar do layout anterior que juntava nome+loja truncados de um lado e valor do outro. Mais legível e ninguém mais compete por largura de linha, então não quebra mesmo se os valores crescerem.
6. **Card "Melhor barra individual" renomeado pra "Líder de tarefas concluídas"** (mesmo dado — % da barra individual de tarefas — só o nome ficou mais claro sobre o que representa).
7. **`FaturamentoTab` (`HierarchyHome.js`) — tabela "Faturamento por loja" corrigida.** Os cabeçalhos "Vendido no mês" e "% do total" quebravam em 2 linhas porque a tabela não tinha nenhuma proteção contra quebra (sem `whitespace-nowrap`, sem controle de fonte) — o navegador preferia quebrar o texto do cabeçalho a deixar a tabela estourar a largura do card. Corrigido: todas as células (cabeçalho e dados) ganharam `whitespace-nowrap`, e a fonte caiu pra `text-xs sm:text-sm` (cabeçalho `text-[10px] sm:text-xs`) — como o card pai já tem `overflow-x-auto`, agora se algum valor ficar grande demais (empresa com metas maiores, mais dígitos) a tabela rola horizontalmente em vez de quebrar texto feio.
   **Verificação de consistência:** o equivalente do master admin (lista de empresas na aba Dados, `admin/page.js`, com "Faturamento no mês"/"Premiações pagas" por empresa) usa um layout diferente — card em grid, não tabela — e já tinha `min-w-0` + `break-words` de uma limpeza anterior, então já era resistente a esse mesmo problema por outro caminho; não precisou de mudança.

### Porcentagem da barra em "Minhas metas" (sessão seguinte)
Felipe pediu pra mostrar a porcentagem da barra em cada meta no dashboard "Minhas metas" (visão colaborador). Causa: o `<ProgressBar>` de cada meta nessa lista tinha `showLabel={false}` (o componente `ProgressBar.js` só desenha o LED colorido + "{pct}%" abaixo da barra quando `showLabel` é `true`, que é o padrão). Removido o `showLabel={false}` em `ColaboradorView.js`. Pela regra de consistência entre dashboards compartilhados, apliquei a mesma mudança nos dois lugares que renderizam essa mesma lista de metas com barra (mesmo componente conceitual, só o alvo muda — individual vs. loja inteira): "Metas da loja" na aba Placar do gerente (`EmpresaDashboard.js`) e "Metas da loja" na visão do supervisor/sócio (`HierarchyHome.js`). Não mexi no card de metas individuais maior mais abaixo em `ColaboradorView.js` (com ícone, "meta individual: R$X" etc.) porque ele já tinha uma linha de texto própria mostrando a porcentagem, só não vinha do `ProgressBar`.
**Build verificado:** `✓ Compiled successfully`.

### Abas de gestão logo abaixo do herocard; lista de liderados; ícone de editar (sessão seguinte)
1. **As abas Placar/Colaboradores/Tarefas/Advertências/Premiações (dentro do `<EmpresaDashboard>`) agora ficam logo abaixo do herocard, em todos os usuários que têm herocard** (gerente e supervisor/sócio — master admin já estava assim, sem card nenhum entre o título e o `<EmpresaDashboard>`). Antes, em `GerenteView.js` os cards "Distribuição da meta em jogo" e "Ranking de vendas" apareciam ENTRE o herocard e o `<EmpresaDashboard>`; em `HierarchyHome.js` era o aviso de "só visualização" + "Metas da loja" + "Ranking de vendas" que ficavam nesse meio. Movi esses cards pra depois do `<EmpresaDashboard>` — em `GerenteView.js` foram unificados no mesmo bloco que já continha "Painel pessoal" (que já vinha depois); em `HierarchyHome.js`, como esses três cards também aparecem na aba Metas (acima das sub-abas Metas do mês/Lançamentos, papel diferente ali — resumo antes da gestão), duplicei o bloco: continua antes do `<EmpresaDashboard>` quando `tab === "metas"` (comportamento inalterado), e passou a vir depois quando `tab === "atividades"` (Início).
2. **"Definir liderados" (criar gerente, `Colaboradores()` em `EmpresaDashboard.js`) virou lista, não mais botões/pills.** O dropdown que abre ao clicar (adicionado numa sessão anterior) trocou o `flex flex-wrap` de pills arredondadas por uma lista vertical de verdade: cada colaborador é uma linha (`checkbox` + nome) dentro de uma caixa com borda, com scroll (`max-h-56 overflow-y-auto`) se a equipe for grande.
3. **Ícone de "editar valores" da meta trocado de `Coins` pra `Pencil`** (lápis) — ícone universal de edição, mais fácil de reconhecer do que a moeda (que ficava confuso ao lado do ícone de `Split` da distribuição). Os outros dois (`Split` pra distribuição, `Trash2` pra excluir) continuam iguais.
**Build verificado:** `✓ Compiled successfully`.

### Subtítulos removidos, seletor de mês ao lado do de loja, e cabeçalho escondido no iPhone (sessão seguinte)
1. **Subtítulo "Os níveis não somam: "removido de todos os cards "Metas da loja"/"Minhas metas"** (4 lugares: `EmpresaDashboard.js`, `ColaboradorView.js`, e as 2 cópias em `HierarchyHome.js` — ver nota da sessão anterior sobre por que esse card foi duplicado ali). Texto final: "Vale a meta real até ela ser batida, depois passa a valer a próxima, e assim sucessivamente." — mesma frase, só sem o prefixo.
2. **Subtítulo removido de todos os cards "Ranking de vendas"** (colaborador, gerente, supervisor/sócio ×2) — ficou só o título "Ranking de vendas — {mês}", sem a linha explicativa embaixo.
3. **Seletor de mês ao lado do seletor de loja, na visão supervisor/sócio (`HierarchyHome.js`).** Causa do bug: a saudação (`<h1>`) e o grupo loja+mês dividiam a mesma linha (`flex ... justify-between`), e o grupo loja+mês tinha `flex-wrap` — em telas estreitas não sobrava largura pros dois (seletor de loja + `MonthNav`, que sozinho já tem ~200px por causa do nome do mês por extenso + duas setas), então o `MonthNav` quebrava pra uma segunda linha, abaixo do seletor de loja. Corrigido: a saudação virou uma linha própria (largura cheia), e o grupo loja+mês virou a linha de baixo, também com largura cheia — sem competir por espaço com a saudação, os dois cabem lado a lado. O seletor de loja ganhou `flex-1 min-w-0` (ele encolhe se precisar) enquanto o `MonthNav` continua `shrink-0` (nunca encolhe, senão o texto do mês corta).
4. **Cabeçalho (perfil + botão "Sair") escondido atrás do notch/status bar no iPhone, impossível de clicar.** Causa: `app/layout.js` já configurava `viewportFit: "cover"` (necessário pro PWA ocupar a tela toda, sem barras brancas) e `statusBarStyle: "black-translucent"` (status bar transparente, sobrepondo o conteúdo) — mas o `<header>` fixo (`lib/AppShell.js`, `sticky top-0`) não tinha nenhum respiro pra compensar essa sobreposição, então nos iPhones com notch/Dynamic Island o topo do header (incluindo o botão de perfil e o "Sair") ficava fisicamente embaixo da área do notch/status bar, inacessível ao toque. Corrigido adicionando `padding-top: env(safe-area-inset-top)` ao `<header>` (classe Tailwind arbitrária `pt-[env(safe-area-inset-top)]`) — em dispositivos sem notch/safe area (Android, desktop, iPhones mais antigos) esse valor é `0px`, sem efeito nenhum; só entra em ação onde precisa. Confirmado que a regra CSS foi gerada corretamente no build (`grep` no CSS compilado).
   **Nota:** não foi possível testar em iPhone físico real dentro desta sessão — se ainda sobrar algum espaço errado (por exemplo, na barra de abas logo abaixo do header, ou no rodapé perto do home indicator), o mesmo padrão (`env(safe-area-inset-*)`) pode ser aplicado em `padding-bottom` de elementos fixos no rodapé, se algum existir.
**Build verificado:** `✓ Compiled successfully`.

### Seta do seletor de loja cortada (sessão seguinte)
Felipe reportou que a setinha do seletor de loja (visão supervisor/sócio, `HierarchyHome.js`) estava cortada. Causa raiz: a mudança anterior (deixar o seletor `w-full` dentro de um `label` `flex-1`, pra caber ao lado do `MonthNav`) fez o `<select>` esticar até a borda direita do pill, e a classe `!p-0` já existente removia todo o padding que o navegador reserva pra desenhar a setinha nativa — sem espaço de sobra, a seta nativa era desenhada bem em cima da curva do `rounded-full`, cortando visualmente a ponta de baixo. Corrigido de forma mais robusta: `appearance-none` no `<select>` (remove a seta nativa do navegador de vez, some com a inconsistência entre navegadores/SO) + um ícone `ChevronDown` (lucide-react) posicionado manualmente por cima (`absolute`, `pointer-events-none` pra não atrapalhar o clique no select por baixo), com `pr-4` no select garantindo espaço pro texto não passar por baixo do ícone. Mesmo padrão visual de outros dropdowns customizados já usados no app (Nova meta, Nova empresa, Definir liderados). Conferido que esse padrão (`!p-0` num select dentro de pill) não se repete em nenhum outro lugar do app — é o único seletor de loja da aplicação.
**Build verificado:** `✓ Compiled successfully`.

### Dashboard "Atividades por colaborador" na visão do gerente (sessão seguinte)
Felipe pediu, especificamente na visão do gerente, um dashboard mostrando de cada colaborador da equipe quantas atividades tem e quantas foram concluídas, com um indicador de status: vermelho se tem atividade atrasada, amarelo se tem pendente hoje (sem atraso), verde se está 100% em dia. Escopo explicitamente pedido só pra visão do gerente — não implementado em supervisor/sócio/master admin (podem pedir depois se quiserem o mesmo lá).
1. **Novo card "Atividades por colaborador — {mês}"** em `GerenteView.js`, na tela de Início, junto dos outros cards de apoio (depois das abas de gestão, mesmo lugar de "Ranking de vendas"/"Distribuição da meta em jogo").
2. **Cálculo (`loadStats`):** busca todas as `tasks` da equipe (`employee_id in (...)`) e todos os `task_completions` do mês selecionado ligados a essas tarefas, cruzando os dois no cliente (mesmo padrão de "buscar ids primeiro, depois filtrar por eles" já usado no resto do arquivo pro cálculo de `pendingToday` — evitei usar filtro `.in()` direto numa coluna de tabela unida via `tasks!inner(...)`, que não tinha precedente comprovado nesse código; o padrão existente só usa `.eq()` em coluna unida, então preferi a via seguramente já testada). Por colaborador: `expected` = total de linhas de `task_completions` no mês, `completed` = quantas com `completed=true`, `overdue` = quantas com `completed=false` e `completion_date` antes de hoje, `pendingToday` = quantas com `completed=false` e `completion_date` igual a hoje.
3. **Status (prioridade vermelho > amarelo > verde > cinza):** vermelho se `overdue > 0`; senão amarelo se `pendingToday > 0`; senão verde se `expected > 0` e `completed === expected`; senão cinza (neutro — sem tarefa nenhuma no mês ainda, ex.: tarefa nunca "semeada" porque ninguém abriu o app naquele dia, mesma limitação de semeadura preguiçosa já documentada nesse projeto). Indicador visual reaproveita o componente `Led` (`lib/Led.js`) já usado nas barras de progresso — mesma linguagem visual (🟢🟡🔴) do resto do app, com uma legenda de uma linha no cabeçalho do card.
4. **Verificação em dado real:** rodei a mesma agregação direto no Postgres (via SQL) pro gerente/equipe de teste — bateu exatamente com o esperado: Gustavo Belfort com 56/56 concluídas, 0 atrasadas, 0 pendentes hoje (verde); os outros 3 colaboradores da equipe com 0 tarefas no mês (cinza, sem dado ainda).
**Build verificado:** `✓ Compiled successfully`.

### Líder de vendas no herocard do supervisor/sócio; limite de nome menor; loja some em abas agregadas; abas apertadas no mobile do sócio (sessão seguinte)
1. **Líder de vendas adicionado ao herocard de supervisor/sócio (`HierarchyHome.js`).** Felipe pediu inicialmente pra igualar o herocard de sócio e supervisor (achando que eram diferentes) — esclarecido que os dois já eram idênticos (mesmo código, só a cor muda), e o que ele realmente queria era trazer pro herocard de sócio/supervisor o mesmo 5º número que o herocard do gerente já tem: **líder de vendas da loja selecionada**. Implementado reaproveitando o mesmo dado já calculado pro card "Ranking de vendas" (`storeRanking`, já ordenado por valor vendido desc) — `ranking[0]` é o líder, sem query nova. Grid do herocard passou de `grid-cols-2 sm:grid-cols-4` (4 números) pra `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` (5 números), mesmo padrão de grid escalável já usado no herocard do gerente pra 6 números.
2. **Limite de caracteres reduzido: nome completo 18 (antes 40), usuário (login) continua 20** (já estava certo, sem mudança) — em todos os formulários de criação/edição de nome, em `EmpresaDashboard.js` e `app/admin/page.js` (8 lugares ao todo). **Nota honesta pro Felipe:** 18 caracteres é bem apertado pra nome completo — nomes brasileiros compostos (ex.: "Felipe dos Santos Ribeiro" tem 24) não cabem inteiros. Segui a instrução à risca, mas se isso cortar nomes de verdade no cadastro, vale reconsiderar o número.
3. **Botão de selecionar loja escondido nas abas Rankings e Faturamento (`HierarchyHome.js`).** Pedido original era só pra aba Rankings, mas o mesmo raciocínio se aplica 1:1 à aba Faturamento (ambas agregam TODAS as lojas de uma vez — o seletor de loja nunca fez diferença nenhuma pro conteúdo dessas duas abas, só confundia). Estendi a mesma correção pra aba Supervisores também (não usa loja nem mês) — nela, a linha inteira de loja+mês some agora. O `MonthNav` (seletor de mês) continua aparecendo em Rankings/Faturamento porque essas duas abas de fato filtram por mês.
4. **Abas de navegação (Início/Metas/Rankings/Faturamento/Supervisores) apertadas com rolagem horizontal no mobile pro sócio.** Como o sócio tem 5 abas (os outros papéis têm 2 a 4), o texto+ícone no tamanho padrão não cabia na tela sem rolar. Reduzido em `AppShell.js` (componente compartilhado por todos os papéis — afeta todo mundo igual, só quem tem mais abas sente mais diferença): gap entre abas de `gap-4` pra `gap-2` no mobile, padding vertical de `py-3` pra `py-2.5`, fonte de `text-xs` pra `text-[10px]` no mobile (volta a `text-sm` no desktop), ícone de 16px pra 13px no mobile (volta a 16px — `sm:w-4 sm:h-4` — no desktop). A rolagem horizontal (`overflow-x-auto`) continua existindo como rede de segurança pra telas muito estreitas, mas na maioria dos aparelhos as 5 abas do sócio devem caber sem precisar rolar agora.
**Build verificado:** `✓ Compiled successfully`.

### Botão de loja idêntico pra sócio/supervisor; abas do sócio sem rolagem de vez (sessão seguinte)
1. **Botão de selecionar loja (tela Início) agora é visualmente idêntico pra qualquer sócio ou supervisor, independente da permissão real.** A única diferença que existia era o badge "visualização" aparecendo dentro do próprio botão quando `!canManageSelected` (supervisor com permissão só "ver" numa loja) — sócio nunca tinha esse badge porque sempre tem `permission: "gerenciar"` hardcoded. Removido o badge do botão; a informação de "só visualização" continua comunicada do mesmo jeito de sempre pelo aviso já existente ("Você tem apenas visualização nessa loja…", card separado que aparece junto dos outros cards de apoio) — não perde a informação, só para de fazer o botão em si mudar de forma dependendo de quem está logado.
2. **Abas de navegação (Início/Metas/Rankings/Faturamento/Supervisores) — resolvido de vez, sem depender de rolagem.** A tentativa anterior (só diminuir fonte/ícone) ainda deixava a rolagem horizontal como rede de segurança, sem garantia de que as 5 abas do sócio coubessem em qualquer aparelho. Desta vez apliquei em `AppShell.js` o MESMO padrão já comprovado que existe no `SubNav` (usado dentro do `EmpresaDashboard`, que já resolveu esse exato problema numa sessão anterior): cada aba vira `flex-1` no mobile (todas dividem a largura toda igualmente, não importa quantas sejam), com ícone empilhado em cima do texto (`flex-col`) e o texto com `truncate` (nunca quebra, corta com "…" se faltar espaço); no desktop (`sm:`) volta ao layout horizontal normal (ícone ao lado do texto, larguras naturais). Removido o `overflow-x-auto`/rolagem, porque agora as abas sempre cabem por construção — não é mais só "menor", é matematicamente garantido que N abas dividem 100% da largura disponível.
**Build verificado:** `✓ Compiled successfully`.

### Tarefa recorrente não pode valer para dias anteriores à sua criação
**Bug:** ao criar uma tarefa diária (ou semanal/única) hoje, a regra de recorrência em `isTaskDueOn` (`lib/date.js`) não sabia a partir de quando a tarefa existia — então, ao navegar pra dias passados (antes da tarefa ter sido criada), o app calculava a tarefa como "devida" naquele dia passado também, o que não faz sentido (a tarefa nem existia ainda) e podia inflar contagens de "atrasada"/"pendente" incorretamente para dias anteriores à criação.

**Fix:**
1. Migração no banco (`add_task_start_date`, projeto `fjscwmrjkxgygdzwwrdh`): nova coluna `tasks.start_date date not null default current_date`, com backfill das linhas existentes a partir de `created_at::date`. Confirmado via SQL que o backfill bateu certinho com a data de criação de cada tarefa existente.
2. **Por que uma coluna nova e não reaproveitar `created_at`:** `created_at` é `timestamptz` (armazenado em UTC), enquanto todo o resto do app calcula "hoje" no fuso de São Paulo (`todayStr()` em `lib/date.js`). Uma tarefa criada às 23h30 (horário de Brasília) vira 02h30 UTC do dia seguinte — se comparasse `created_at.slice(0,10)` direto com as datas locais de SP, teria um bug de "um dia a mais" bem perto da meia-noite. Por isso `start_date` é uma coluna `date` pura, preenchida pelo cliente com `todayStr()` no momento do insert — o mesmo padrão já usado em `entry_date`, `completion_date`, `warning_date` e `once_date`.
3. `isTaskDueOn(task, dateStr)` em `lib/date.js` ganhou um guard no topo: `if (task.start_date && dateStr < task.start_date) return false;` — antes de qualquer checagem de recorrência. Como essa função é o único lugar que decide se uma tarefa "vale" num dia, o fix cobre automaticamente todos os pontos de chamada (`EmpresaDashboard.js`, `GerenteView.js`, `ColaboradorView.js`), desde que a query que busca a tarefa inclua a coluna `start_date` — os dois `select("*")` em `EmpresaDashboard.js` e `ColaboradorView.js` já trazem a coluna automaticamente; a query mais estreita em `GerenteView.js` (usada pro cálculo de "pendente hoje") foi ajustada de `select("id, recurrence_type, weekday, once_date")` para incluir `start_date`.
4. `addTask` em `EmpresaDashboard.js` agora inclui `start_date: todayStr()` no objeto `recurrenceFields`, que é espalhado (`...recurrenceFields`) tanto no insert único quanto no insert em massa (replicar pra todos os colaboradores da loja) — toda tarefa nova, a partir de agora, nasce com `start_date` igual ao dia da criação.
5. O card "Atividades por colaborador" (adicionado nesta mesma sessão) não foi afetado — ele conta só com base nas linhas de `task_completions` que já existem (modelo de "semeadura preguiçosa"), não usa `isTaskDueOn`.

**Verificação:** confirmado via SQL que tarefas recém-criadas hoje (13/07 e antes) têm `start_date` batendo com `created_date`; `get_advisors(security)` rodado após a migração não mostrou nenhum alerta novo além dos já conhecidos (buckets públicos com listagem e funções SECURITY DEFINER, ambos pré-existentes).
**Build verificado:** `✓ Compiled successfully`.

### Modal de celebração ao bater cada nível de meta (colaborador)
**Pedido:** um modal precisa aparecer toda vez que o colaborador bate a meta do mês — bateu o 1º nível (ex.: "Meta") aparece, bateu o 2º nível (ex.: "Super Meta"), se existir, aparece de novo, e assim por diante pra quantos níveis a loja tiver configurado.

**Onde plugou:** `lib/ColaboradorView.js`, que já tinha um mecanismo idêntico pronto pra outra coisa (modal de "concluiu 100% das tarefas de hoje", com `Confetti` + card `PartyPopper` + flag no `localStorage` pra não repetir) — reaproveitei exatamente o mesmo padrão visual e de estado, só trocando o gatilho e o texto.

1. **Detecção:** `goals` (estado já existente) é a lista de níveis de meta do colaborador no mês (`sales_goals` + `sales_goal_allocations`, já vinha ordenada por `store_total` — ou seja, do nível mais baixo pro mais alto). Um novo `useEffect` roda sempre que `goals`, `soldSoFar` (total vendido no mês) ou o mês mudam: para cada nível em que `soldSoFar >= allocation.amount`, verifica uma flag no `localStorage` (`zmeta_goalhit_{profile.id}_{mês}_{goal.id}`) — se ainda não tiver sido marcada, marca e enfileira aquele nível pra celebrar.
2. **Fila, não só um modal:** os níveis batidos entram numa fila (`goalCelebrations`, array de estado). Se o colaborador pular direto de R$0 pra um valor que bate dois ou três níveis de uma vez (um lançamento grande, ou vários lançamentos somados antes de abrir o app), os modais aparecem um atrás do outro — o botão do modal mostra "Bora pra próxima!" quando ainda tem mais na fila, e "Show de bola!" no último.
3. **Só pro mês corrente e só pro próprio colaborador:** não dispara ao navegar por meses passados (bater uma meta de mês fechado não devia gerar pop-up agora) nem quando o gerente está "vendo como" aquele colaborador (`viewedByManager`) — mesma regra já usada no modal de tarefas 100%.
4. **Primeira vez que a funcionalidade roda:** quem já tinha batido algum nível de meta antes dessa atualização vai ver o(s) modal(is) na próxima vez que abrir o app (porque a flag ainda não existe no `localStorage` dele) — é esperado, é um efeito colateral normal de introduzir uma flag nova, e só acontece uma vez por pessoa.
5. Os dois modais (tarefas 100% e meta batida) não aparecem sobrepostos — o de meta só renderiza quando o de tarefas não está aberto.

**Build verificado:** `✓ Compiled successfully`.

### Botão "redefinir senha" faltando na gestão de loja (gerente/colaborador)
**Bug reportado:** Felipe foi editar um colaborador e não encontrou a opção de redefinir a senha — função que "já existia".

**Causa raiz:** a função de fato já existia de ponta a ponta (rota `/api/admin/update-employee`, campo `resetPassword`, redefine para a senha padrão `123456789` via `admin.auth.admin.updateUserById` + marca `must_change_password: true`), mas só tinha botão na UI dentro de `EditUser` (`app/admin/page.js`), usado exclusivamente na tela `EmpresaDetail` do **master_admin** (visão agregada da empresa inteira, fora de uma loja específica). O componente `Colaboradores()` em `lib/EmpresaDashboard.js` — usado por **todos** os papéis (gerente/supervisor/sócio/master_admin) ao entrar numa loja específica e gerenciar a equipe dali — nunca teve esse botão, nem na lista de gerentes nem na de colaboradores. Como sócio/supervisor só gerenciam colaboradores por esse caminho (não têm acesso ao `EmpresaDetail`, que é exclusivo do master_admin), a função ficava inacessível pra eles na prática, e mesmo o master_admin só a via se entrasse pelo caminho certo.

**Fix:** adicionado botão ícone-only (`KeyRound`, com `title`/`aria-label`, mesmo padrão de decluttering já usado no resto do app) em `Colaboradores()` (`lib/EmpresaDashboard.js`):
- Na lista de **gerentes**: visível quando `canManageTeams` (master_admin/sócio/supervisor — mesmo gate que já protege editar/desativar/excluir gerente).
- Na lista de **colaboradores**: visível quando `canEdit` (todos exceto `"leitor"` — inclui gerente, mantendo paridade com os botões editar/desativar/excluir que colaborador já tinha ali).

Nova função `resetPassword(user)` chama a mesma rota `/api/admin/update-employee` já existente com `{ employeeId, resetPassword: true }`, com `window.confirm` avisando a senha padrão antes de executar e `alert` de confirmação/erro depois — mesmo padrão de UX já usado em `EditUser`.

**Fora do escopo, sinalizado mas não implementado:** a tela "Supervisores" do sócio (`HierarchyHome.js`, gerencia contas de supervisor) também não tem botão de redefinir senha — só tem ativar/desativar. Não mexi porque o pedido foi específico pra gerente/colaborador; avisar se quiser o mesmo ali.

**Build verificado:** `✓ Compiled successfully`.

### Remoção de "faltam N dia(s) no mês" no subtítulo da aba Metas (colaborador)
Felipe pediu pra tirar o texto "faltam 18 dia(s) no mês" do subtítulo abaixo do título "Metas — {mês}" na visão do colaborador. Em `ColaboradorView.js`, a linha "Vendido no mês até {data}: {valor}" tinha um sufixo condicional (`isCurrentMonth ? " · faltam N dia(s) no mês" : " · mês fechado"`) — removida só a parte de "faltam N dias", mantido "· mês fechado" quando o mês visualizado já passou (informação diferente, não pedida pra sair). Único lugar do app com esse texto — não existe equivalente nos dashboards de gerente/supervisor/sócio. O contador de dias restantes em si continua no herocard (número grande "{remaining}"), só esse subtítulo específico da aba Metas perdeu a frase.
**Build verificado:** `✓ Compiled successfully`.

### Dashboard Tarefas: removido pausar/reativar, botões viram ícone, e excluída some de vez da lista
Três pedidos do Felipe na lista de "Tarefas" cadastradas (`Tarefas()`, `lib/EmpresaDashboard.js` — compartilhado por gerente/supervisor/sócio/master_admin):
1. **Botão "pausar"/"reativar" removido.** Não fazia sentido pro fluxo real de uso — a função `toggleActive(t)` foi removida do componente (só existia ali; não afeta as outras funções de mesmo nome em `Colaboradores()`, que são de outro escopo).
2. **Botões viraram ícone-only** (`Pencil` editar / `Trash2` excluir, com `title`/`aria-label`), no mesmo padrão de decluttering já usado em `Metas()`.
3. **"Editar" agora existe de verdade** (antes não existia nenhuma forma de editar uma tarefa já criada, só criar/pausar/excluir). Implementado inline (mesmo padrão de `Colaboradores()`: clique no lápis troca a linha por um input + salvar/cancelar) — só o **título** é editável por ora; recorrência (diária/semanal/única, dia/data) não tem edição, precisaria excluir e recriar se for pra mudar isso. Se Felipe quiser editar recorrência também, é extensão natural do mesmo padrão.
4. **Bug real corrigido: tarefa excluída continuava aparecendo na lista, riscada.** A lista sempre renderizou `myTasks` (todas, ativas e inativas), com `line-through` pra inativas — como "excluir" já fazia soft-delete (`active=false`, preservando histórico), a tarefa nunca sumia visualmente, só ficava riscada pra sempre. Como o botão de pausar/reativar saiu (item 1), `active=false` passou a significar exclusivamente "excluída" — não existe mais nenhum caminho pra desativar uma tarefa sem ser via exclusão. Por isso a lista trocou de `myTasks` pra `myActiveTasks` (já existia, usada em outro lugar do componente): tarefa excluída agora some de vez da lista de cadastro.
   **A lógica de dados por trás do "excluir" não mudou e continua correta** (reconfirmado, é a mesma regra já documentada na seção 11 desde a primeira implementação): apaga só `task_completions` com `completed = false` **e** `completion_date >= hoje` (pendências de hoje em diante, que ainda nem deveriam ter acontecido); dias já concluídos (`completed = true`, qualquer data) e dias passados perdidos (`completed = false`, data anterior a hoje) nunca são tocados — o hard delete da tabela `tasks` continua nunca acontecendo, porque a FK `task_completions.task_id → tasks.id` é `ON DELETE CASCADE` e apagaria esse histórico junto. "Excluir mesmo" (o que Felipe pediu) foi resolvido no nível de **exibição** (a tarefa some da tela), não no nível de dado — apagar o dado de verdade quebraria relatórios/comissão de meses fechados, prática já rejeitada e documentada antes neste mesmo projeto.
**Build verificado:** `✓ Compiled successfully`.

### Limite de 18 caracteres no nome da tarefa
`maxLength={18}` adicionado nos dois inputs de título de tarefa em `Tarefas()` (`lib/EmpresaDashboard.js`): o campo "nome da tarefa" do formulário de criação e o input de edição inline (adicionado na sessão anterior). Mesmo limite já usado pra nome completo em outros formulários do app. **Nota:** client-side só — o insert/update vai direto pro Supabase (não passa por rota de API), então o mesmo limite client-side-only já documentado pros nomes de usuário se aplica aqui. 18 caracteres é apertado pra descrever uma tarefa (ex.: "Organizar vitrine" já bate o limite); se cortar descrições no uso real, vale reconsiderar.
**Build verificado:** `✓ Compiled successfully`.

### Seletor de dia da semana (criar tarefa semanal) trocado de `<select>` nativo por pills
Felipe pediu pra melhorar a aparência do seletor de dia da semana ao criar tarefa com recorrência "1 dia na semana" (`Tarefas()`, `lib/EmpresaDashboard.js`). Era um `<select>` HTML nativo genérico, destoando do resto do formulário — que logo acima já usa botões-pill (`rounded-full border-2`) pra escolher o tipo de recorrência (diária/semanal/única). Trocado pelo mesmo padrão: 7 botões-pill (`WEEKDAY_LABELS`, `text-xs font-bold px-3 py-1.5 rounded-full border-2`, ativo em roxo) com `flex-wrap`, idêntico visualmente ao seletor de recorrência logo acima.
**Build verificado:** `✓ Compiled successfully`.

## 12. Funcionalidade recusada (em aberto, sem follow-up do Felipe)

Felipe perguntou se o master_admin poderia **ver as senhas cadastradas** de cada usuário. Foi recusado com justificativa técnica (senhas ficam com hash bcrypt via Supabase Auth, irreversível; armazenar em texto puro seria antipadrão grave de segurança, com risco real de vazamento e responsabilidade legal — ainda mais relevante porque o Z Meta será vendido a outras empresas). Alternativa proposta (permitir ao master definir uma senha temporária customizada no reset, em vez de sempre a senha padrão fixa `123456789`) — **nunca construída nem confirmada por Felipe**. Não fazer nada aqui a menos que ele volte a tocar no assunto.

## 13. Coisas a saber / possíveis próximos passos

- O app não tem testes automatizados — toda verificação é manual (build + leitura de código + advisors do Supabase).
- Não há ambiente de staging conectado ao Claude — a única verificação local possível é `npm run build` num diretório sandbox; teste visual real em dispositivo mobile depende do Felipe abrir o app depois do deploy.
- A auditoria mobile foi 100% estática (leitura de código + padrões defensivos de CSS) — não houve captura de tela real de um dispositivo físico. Vale pedir pro Felipe testar em um iPhone/Android real e reportar qualquer quebra visual específica.
- Não há CHANGELOG nem versionamento semântico — o controle de progresso vem sendo feito via lista de tarefas da sessão do Claude (efêmera) e mensagens de commit. **Este documento (`CONTEXTO_PROJETO.md`) é a fonte de verdade persistente.**

## 14. Convenções de comunicação com o Felipe

- Felipe é direto, não gosta de burocracia nem textão. Respostas devem ser objetivas, sem enrolação.
- Ele pede pra ser tratado com espírito crítico — apontar pontos fracos/cegos, não só concordar (mais relevante em decisões de negócio/estratégia do que neste projeto técnico especificamente, mas vale mesmo aqui: se uma solicitação tiver um jeito melhor de ser feita tecnicamente, dizer isso antes de simplesmente executar).
- Ele mesmo roda os comandos de git (`add`/`commit`/`push`) — o Claude só entrega prontos pra copiar/colar depois de verificar o build.
- Quando uma correção de bug for na verdade um padrão repetido em vários lugares do código (como o bug do CSS ou o padrão de RLS), vale resolver na raiz/no componente compartilhado e avisar quantos lugares isso afeta, em vez de corrigir só o caso reportado.

---

**Instrução pro Claude que abrir este documento em um novo chat:** leia este arquivo por completo antes de qualquer alteração no projeto. Ao final de qualquer sessão de trabalho relevante, atualize a seção 11 (histórico) e, se necessário, as seções 8 (padrões mobile), 9 (schema) ou 12/13 (pendências), pra manter este documento como fonte de verdade viva do projeto.

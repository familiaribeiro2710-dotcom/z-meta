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

**Tabelas principais:** `profiles` (id, full_name, role, active, username, empresa_id, loja_id, gerente_id, must_change_password, avatar_url), `empresas` (id, name, cnpj, telefone, email, logo_url, active, plano, valor_por_usuario, desconto, created_at), `lojas`, `sales_goals` (metas em camadas, por loja/mês), `sales_goal_allocations` (meta individual por colaborador), `sales_entries` (**coluna `daily_amount`** — valor vendido NAQUELE dia, não acumulado), `employee_prizes` (premiação livre por colaborador/mês — pode haver várias por mês), `warnings`, `tasks`, `task_completions`, `commission_settings`, `app_settings`, `loja_access`.

> Nota histórica: a tabela `employee_stage_prizes` (premiação "por estágio do mês") e o conceito de "estágios" (dias 1-10/11-20/21-fim) que apareciam em rascunhos antigos deste documento **foram removidos do sistema**. O modelo atual de premiação é `employee_prizes`, simples, sem noção de estágio, lançado livremente pelo supervisor/master_admin.

**RPCs principais:** `admin_overview()`, `admin_lojas_health(p_month)`, `admin_financeiro(p_month)`, `admin_faturamento_mensal(p_empresa_id)`, `admin_delete_empresa(p_empresa)`, `get_team_progress(p_month, p_loja)`, `is_master_admin()` / `is_socio()` / `is_supervisor()` / `is_gerente()`, `can_view_loja()` / `can_manage_loja()`, `is_my_team_member()`.

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
7. **Textos menores na aba Metas, em todas as visões.** Em `EmpresaDashboard.js` (`Metas`/`Lancamentos`, usados por gerente/supervisor/sócio/master) e em `ColaboradorView.js` (aba Metas do colaborador): títulos de cada card de meta, listas de comissionamento/distribuição e o histórico de lançamentos ganharam `text-xs sm:text-sm` (ou `text-[11px] sm:text-xs`) no lugar de `text-sm`/`text-xs` fixo — só encolhe no mobile, desktop sem mudança. Os números grandes de destaque (Meta de hoje, Falta pra bater, valores do herocard) foram mantidos do tamanho que já estavam — o pedido era limpar o texto "miúdo", não os números-destaque.

**Atualização — confirmado por Felipe:** funcionou perfeitamente no iOS. No Android, o PWA instalado **não rolava (scroll) pra cima nem pra baixo, travado por completo**. Causa: `overscroll-behavior-y: none` + `touch-action: manipulation`, aplicados em `html, body` (globals.css) — bug conhecido do Chrome/WebView do Android, onde essas duas props no elemento raiz de scroll travam a rolagem inteira da página no contexto de PWA instalado (WebAPK). iOS não é afetado da mesma forma. **Removidas as duas** de `globals.css`; ficou só `-webkit-tap-highlight-color: transparent` (puramente cosmético, sem risco de travar scroll). **Lição: não reintroduzir `overscroll-behavior` nem `touch-action` no elemento raiz (`html`/`body`) sem testar em Android real antes** — teste só em iOS não é suficiente pra essas duas props.

**Atualização — o scroll continuou travado no Android mesmo depois disso.** Causa: sobrou um `overscroll-none` (utilitário Tailwind = `overscroll-behavior: none`) direto no `className` do `<body>` em `app/layout.js` — a limpeza anterior só tinha removido a declaração equivalente do `globals.css`, mas esse mesmo culpado voltava por um segundo caminho (classe no JSX) que passou despercebido. Removido. **Lição adicional: ao caçar esse tipo de bug, checar os DOIS lugares — CSS global E className inline nos componentes — não só um.**

### Dois bugs reais corrigidos numa sessão seguinte
1. **Financeiro (master) mostrava "Usuários cadastrados" zerado.** Causa: em `FinanceiroTab` (`app/admin/page.js`), o `useMemo` de `totals` calculava a variável `usuarios` mas **não a incluía no objeto retornado** (`return { receita, colaboradores, ticketEmpresa, ticketUsuario }` — faltava `usuarios`), então `totals.usuarios` chegava `undefined` no `HeroStat`. O RPC `admin_financeiro` em si sempre esteve correto (confirmado rodando a função direto no Supabase). Corrigido incluindo `usuarios` no retorno. A aba **Dados** nunca teve esse bug (já retornava `usuarios` certinho).
2. **Campo "Dia da venda" (card "Lançar valor vendido ontem", `ColaboradorView.js`) gigante e desproporcional no mobile.** Causa: era um `<input type="date">` nativo do HTML, que em alguns Android/iOS renderiza o valor bem maior que os outros inputs quando não focado. Numa primeira tentativa foi trocado pelo componente `DateNav` (setas anterior/seguinte). **Felipe pediu de volta o calendário nativo** (precisa poder escolher qualquer dia do mês, não só andar dia a dia com setas) — revertido pro `<input type="date">`, agora com a classe `date-input` e uma regra dedicada em `globals.css` (`input[type="date"].date-input { -webkit-appearance: none; appearance: none; font-size: 0.875rem; line-height: 1.25rem; color-scheme: light; }`) forçando o mesmo tamanho de fonte dos outros campos, na tentativa de evitar o "pill" gigante sem perder o calendário. `max={today}` no próprio input substitui o `maxDate` que o `DateNav` fazia. **Isso é best-effort — não foi possível testar em dispositivo Android/iOS real dentro desta sessão; se o campo voltar a ficar desproporcional, os próximos passos seriam ajustar essa regra CSS com mais força ou, em último caso, construir um calendário próprio (não nativo).** `DateNav` continua em uso normalmente na navegação de dia das Tarefas — não foi removido do projeto.

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

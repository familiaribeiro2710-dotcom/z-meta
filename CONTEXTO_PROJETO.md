# Z META — Contexto completo do projeto (para continuar em outro chat)

> Cole este arquivo inteiro como primeira mensagem de um novo chat para retomar o desenvolvimento exatamente de onde parou.

## 1. O que é o projeto

**Z Meta** é um SaaS multi-tenant (Next.js 14 App Router + Supabase) para gestão de equipes de lojas de varejo, sendo construído por **Felipe dos Santos Ribeiro**, fundador da **FORGE GROUP** (holding com ZENITHBR — moda masculina premium, MOVA — produtos escaláveis/viral, Z FINANCE — fintech SaaS). O Z Meta é o produto de tecnologia interna do grupo, com objetivo final de **ser vendido para outras empresas** também (multi-tenant desde o início).

O sistema gerencia uma hierarquia de papéis dentro de cada empresa cliente:
- **master_admin** — Felipe, dono do sistema, vê e gerencia tudo.
- **sócio** — acesso cross-loja (múltiplas lojas de uma empresa), permissão "ver" ou "gerenciar" por loja via tabela `loja_access`.
- **supervisor** — mesmo modelo do sócio (multi-loja, `loja_access`).
- **gerente** — vinculado a UMA loja (`profiles.loja_id`), gerencia colaboradores dessa loja.
- **colaborador** — vinculado a UMA loja, é quem bate metas, faz tarefas, recebe advertências.

Ordem de rollout combinada com Felipe: **redesenhar a experiência de cada papel de baixo pra cima** — colaborador (mais simples, ACABOU DE SER FINALIZADO) → gerente (PRÓXIMO PASSO) → sócio/supervisor → master_admin.

## 2. Stack técnico e infraestrutura

- **Next.js 14 App Router**, JavaScript (não TypeScript), Tailwind CSS.
- **Deploy**: Vercel, conectado ao GitHub. Felipe roda `git add -A && git commit -m "..." && git push` ele mesmo no terminal dele depois que eu (Claude) verifico que o build passa. **Eu nunca faço o push** — só entrego os comandos prontos.
- **Supabase**: Postgres + Auth + RLS (Row Level Security). Project ID: `fjscwmrjkxgygdzwwrdh`. Acesso via MCP tools (`mcp__<id>__execute_sql`, `apply_migration`, `list_tables`, `get_advisors`, etc. — nome do server prefixado com um UUID que muda por sessão, procurar via ToolSearch por "supabase" ou pelo nome das funções).
- **Pasta conectada no Cowork**: `/Users/feliperibeiro/Desktop/Z Meta` (Read/Write/Edit tools usam esse path Mac direto; via `mcp__workspace__bash` o mesmo caminho aparece em `/sessions/.../mnt/Z Meta`).
- **Login interno**: usuários usam `username` + senha; internamente vira `email = ${username}@zmeta.local` no Supabase Auth.

### Workflow padrão de verificação ANTES de pedir push pro Felipe (sempre seguir esses passos):
```bash
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' "/sessions/.../mnt/Z Meta/" /tmp/zmeta/
cd /tmp/zmeta
# se node_modules não existir:
npm install --silent
# recriar .env.local (não existe de verdade no sandbox, é normal):
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
EOF
npm run build 2>&1 | tail -40
```
Depois, checar `.git/index.lock` (não deve existir) e `git status --short` na pasta real do projeto antes de dar as instruções de commit pro Felipe. O erro "supabaseUrl is required" durante o build é esperado no sandbox (falta de env var real) e não indica bug real — só recriar o `.env.local`.

Sempre que eu mexer em schema/RLS do Supabase, rodar `get_advisors(type: "security")` depois pra confirmar que não introduzi um buraco de segurança novo (warnings pré-existentes sobre funções SECURITY DEFINER e o bucket `empresa-logos` são esperados/benignos, documentados abaixo).

## 3. Modelo de dados (schema atual relevante)

### Tabelas principais
- `empresas` — empresas clientes (id, nome, cnpj, telefone, email, ativo, created_at, plano — campo plano não é mais exibido na UI).
- `lojas` — lojas de uma empresa (id, empresa_id, nome, ativo).
- `profiles` — perfis de usuário (id = auth.users.id, role em `['master_admin','socio','supervisor','gerente','colaborador']`, empresa_id, loja_id — null pra sócio/supervisor, full_name, username, must_change_password).
- `loja_access` — permissões cross-loja de sócio/supervisor: `id, profile_id, loja_id, permission ('ver'|'gerenciar'), created_at`, unique(profile_id, loja_id).
- `tasks` — tarefas ativas atribuídas a um colaborador (employee_id, loja_id, title, active).
- `task_completions` — conclusão diária de tarefa (task_id, completion_date, completed, completed_at), unique(task_id, completion_date).
- `warnings` — advertências (employee_id, loja_id, warning_date, reason, points).
- `app_settings` — configurações por loja (loja_id, warning_penalty_points, team_threshold_pct, monthly_prize).
- `stage_dynamics` — dinâmica de cada estágio do mês (month, stage_number 1/2/3, title, description, empresa_id, loja_id). Estágios: dias 1-10, 11-20, 21-fim do mês.
- `sales_goals` — metas de venda da loja no mês (id, month, name, store_total, distribution_mode, empresa_id, loja_id, created_by).
- `sales_goal_allocations` — meta individual por colaborador (goal_id, employee_id, amount, percentage, commission_pct numeric default 0, empresa_id, loja_id).
- `sales_entries` — lançamento diário de venda (**IMPORTANTE: coluna é `daily_amount`, não `cumulative_amount`** — foi renomeada nesta sessão; representa o valor vendido NAQUELE dia específico, não acumulado). Campos: employee_id, entry_date, daily_amount, edited_by_manager, created_by, updated_by, empresa_id, loja_id. unique(employee_id, entry_date).
- `employee_stage_prizes` (**NOVA, criada nesta sessão, ainda sem UI de lançamento**) — premiação que o gerente vai lançar por colaborador ao final de cada estágio: `id, employee_id, empresa_id, loja_id, month, stage_number (1/2/3), amount, note, created_by, updated_by, created_at, updated_at`, unique(employee_id, month, stage_number). RLS já criada (ver seção 3.2) mas **NÃO existe ainda nenhuma tela/form pra gerente lançar esse valor** — isso é a próxima conversa pendente com Felipe (ver seção 6).

### 3.1 Funções helper de RLS (security definer, chamáveis por `authenticated`/`anon` — warnings esperados nos advisors)
- `is_master_admin()`, `is_gerente()`, `is_socio()`, `is_supervisor()`
- `my_loja_id()`, `my_empresa_id()`, `my_empresa_active()`
- `can_view_loja(uuid)` = `is_master_admin() or (is_gerente() and my_loja_id()=p_loja) or exists(select 1 from loja_access where profile_id=auth.uid() and loja_id=p_loja)`
- `can_manage_loja(uuid)` = igual, mas exige `permission='gerenciar'`

### 3.2 Padrão de RLS usado em TODAS as tabelas operacionais (tasks, warnings, sales_goals, sales_goal_allocations, sales_entries, stage_dynamics, app_settings, task_completions, employee_stage_prizes)
```sql
-- SELECT
is_master_admin() OR employee_id = auth.uid() OR (is_gerente() AND loja_id = my_loja_id()) OR can_view_loja(loja_id)
-- WRITE (insert/update/delete, "ALL")
is_master_admin() OR (is_gerente() AND loja_id = my_loja_id()) OR can_manage_loja(loja_id)
```
Sempre seguir esse padrão exato ao criar tabela nova relacionada a colaborador/loja — já foi a causa de um bug real (RLS esquecida em algumas tabelas ao adicionar sócio/supervisor, corrigida na migration `loja_access_rls_operational_tables`).

### 3.3 Técnica de simulação de RLS (útil pra debugar "por que esse usuário não vê X")
```sql
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<uuid-do-usuario>','role','authenticated')::text, true);
<query a testar>
```
Rodar cada verificação como uma chamada separada de `execute_sql` — múltiplos statements com `;` só retornam confiavelmente o último result set.

## 4. Design tokens
- Navy `#12203a` (texto principal), gold `#c9a15a`/goldlight `#e4c789`, purple `#7c3aed`, pink `#ec4899` (gradiente principal purple→pink em botões/gradient-text), verde (gerente) `#16a34a`/`#4ade80`, lilás (colaborador) `#a78bfa`/`#ddd6fe`, prata (sócio) `#9ca3af`/`#e5e7eb`, azul (supervisor) `#2563eb`/`#60a5fa`, teal `#0d9488`.
- Hero cards de cada papel usam gradiente próprio (ex: colaborador usa `linear-gradient(135deg, #a78bfa 0%, #ddd6fe 100%)`).

### 4.1 CSS — bug recorrente já corrigido na raiz
Classes customizadas (`.input`, `.btn`, `.btn-outline`, `.card`, `.label`, `.badge`) em `app/globals.css` foram envolvidas em `@layer components { ... }`. Antes disso, `.label` (que tem `display:block`) vencia utilities `flex`/`inline-flex` aplicadas junto na mesma className, quebrando ícone+texto em duas linhas. **Se esse bug aparecer de novo em algum lugar, é porque uma classe nova foi adicionada FORA do `@layer components` — sempre colocar dentro dele.**

## 5. Inputs mascarados (`lib/MaskedInputs.js`)
- `maskCNPJ` / `<CnpjInput>` — formata `00.000.000/0000-00` incrementalmente.
- `maskPhone` / `<PhoneInput>` — formata `(00) 00000-0000`.
- `<CurrencyInput value={number|""} onChange={(number|"")=>{}} />` — prefixo "R$" fixo, mascara da direita pra esquerda em centavos, `toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})`. **Cuidado**: `value` pode ser `0` (número), que é falsy em JS — nunca validar com `if (!value)`, sempre `if (value === "" || value === null || value === undefined)`. Esse foi um bug real corrigido nesta sessão (bloqueava lançar venda zerada).

## 6. Estado atual — o que ACABOU DE SER FINALIZADO (colaborador)

A tela do colaborador (`app/colaborador/page.js`) foi totalmente redesenhada nesta sessão:

1. Aba "Atividades" renomeada pra **"Início"** (key interna continua `atividades`).
2. Modelo de venda mudou de acumulado pra **delta diário**: colaborador lança quanto vendeu NO DIA anterior (`daily_amount`), sistema calcula o acumulado do mês somando as linhas.
3. **Meta diária calculada automaticamente**: `metaDoMes` (soma das alocações de meta do colaborador) − `soldSoFar` (soma de daily_amount no mês) ÷ dias restantes no mês (contando hoje).
4. **Comissão** (`commission_pct` em `sales_goal_allocations`, definida pelo gerente por meta/colaborador): sistema calcula média ponderada quando há múltiplas metas, e `comissão até agora = vendido no mês × comissão%`.
5. **Hero card** ("Meta de hoje") tem 5 métricas: meta diária (número grande), falta pra meta do mês, dias restantes no mês, atividades pendentes, comissão até agora, **e agora também Premiações** (soma de `employee_stage_prizes` do mês — hoje sempre R$0,00 porque ainda não existe UI pro gerente lançar).
6. Aba "Metas" tem cards por meta individual, cada um mostrando: progresso, "Meta de hoje" (valor diário daquela meta específica) **e, ao lado, "Falta pra bater"** (quanto falta em R$ pra bater aquela meta específica) — adicionado nesta sessão. Grid só vira 2 colunas quando há mais de 1 meta (senão o card fica esticado ocupando a largura toda).
7. Nova seção "Registros do mês" — tabela com data / vendido no dia / acumulado no mês (ledger correndo).
8. Lançamento de venda agora aceita **valor zero** (colaborador pode não ter vendido nada no dia).
9. Removido o valor em R$ do prêmio mensal da equipe no card "Barra geral da equipe" (só mostra a mensagem de status, sem expor o valor).

Todas essas mudanças já foram testadas com build limpo e estão prontas pra Felipe dar `git push` (ele mesmo faz).

### 6.1 Pendência explícita, NÃO resolvida — Premiações por estágio
Felipe pediu pra adicionar "Premiações" no hero card do colaborador, mas disse explicitamente: **"essa premiação é o gerente que vai lançar ao final de cada estágio, já já vamos falar mais sobre isso"**. Ou seja:
- Criei a tabela `employee_stage_prizes` com RLS completa (ver seção 3) pra já deixar o dado real fluindo quando a feature for construída.
- **NÃO construí** nenhuma tela/formulário pro gerente lançar o valor da premiação por estágio — isso é conversa em aberto, a ser retomada quando entrarmos na fase do gerente.
- Perguntas que provavelmente precisam ser esclarecidas com Felipe quando essa conversa continuar: a premiação é um valor fixo por estágio batido (meta do estágio) ou livre/arbitrário do gerente? É por colaborador individual ou dividido pela equipe? Tem alguma regra de quando ela é liberada (ex: só se bateu a meta do estágio)? Vai aparecer em algum lugar pro gerente ver quanto já lançou/quanto falta lançar no mês?

## 7. Funcionalidade recusada (ainda em aberto, sem follow-up do Felipe)
Felipe perguntou se o master_admin poderia **ver as senhas cadastradas** de cada usuário. Isso foi recusado explicitamente por mim com justificativa técnica (senhas ficam com hash bcrypt via Supabase Auth, irreversível; armazenar em texto puro seria antipadrão grave de segurança, com risco real de vazamento e responsabilidade LGPD — ainda mais relevante porque o Z Meta será vendido pra outras empresas). Ofereci uma alternativa (permitir ao master definir uma senha temporária customizada no reset, em vez de sempre a senha padrão fixa) — **essa alternativa foi proposta mas nunca construída nem confirmada por Felipe**. Não fazer nada aqui a menos que ele volte a tocar no assunto.

## 8. Estrutura de arquivos-chave

- `app/admin/page.js` (~1400+ linhas) — painel do master_admin. Lista de empresas → clique leva pra página de detalhe da empresa (`EmpresaDetail`, componente interno) com dados editáveis (nome, CNPJ, telefone, email — usando os inputs mascarados), botão único "Cadastrar novo usuário" com seletor de 4 papéis (sócio/supervisor/gerente/colaborador), lista de hierarquia (sócios/supervisores com badges clicáveis de permissão ver↔gerenciar por loja) e lista de lojas.
- `app/colaborador/page.js` — ver seção 6.
- `app/gerente/page.js` + `lib/EmpresaDashboard.js` — painel do gerente (ainda no formato antigo, **próximo alvo do redesign**). `EmpresaDashboard.js` tem os componentes `Metas` (definir metas e comissão por colaborador) e `Lancamentos` (gerente corrige/lança venda de qualquer colaborador da loja).
- `lib/HierarchyHome.js` — usado por `/socio` e `/supervisor`, mostra visão combinada de TODAS as lojas que o usuário tem acesso (scoreboard geral, barra combinada, tabela de colaboradores de todas as lojas juntas).
- `lib/MaskedInputs.js` — inputs de CNPJ/telefone/moeda (seção 5).
- `lib/date.js` — helpers de data (`todayStr`, `yesterdayStr`, `firstDayOfMonth`, `remainingDaysInMonth`, `stageNumberForDate`, `monthLabel`, `greeting`, timezone fixo `America/Sao_Paulo`).
- `lib/scoring.js` — `calcIndividualPct`, `calcTeamPct`, `formatBRL`, `formatPct`, `motivationalMessage`.
- `lib/ProgressBar.js`, `lib/AppShell.js`, `lib/ChangePassword.js`, `lib/EditProfile.js`, `lib/Confetti.js`, `lib/generateUsername.js` (`resolveUsername` — valida/normaliza username escolhido no cadastro, com fallback pra auto-geração).
- `app/api/admin/create-gerente/route.js`, `create-employee/route.js`, `create-hierarchy/route.js` (sócio/supervisor), `update-employee/route.js`, `create-empresa/route.js`, `create-loja/route.js`, `delete-employee/route.js`, `delete-empresa/route.js` — todas master-admin-only, todas aceitam `username` opcional.
- `app/globals.css` — ver seção 4.1.

## 9. Próximo passo combinado com Felipe

**Redesenhar a experiência do GERENTE**, seguindo o mesmo espírito do redesign do colaborador (simplificar, deixar cálculos automáticos, hero card claro com as métricas mais importantes). Pontos que provavelmente vão entrar nessa conversa:
- Tela de definir metas + comissão por colaborador (já existe em `lib/EmpresaDashboard.js`, componente `Metas` — avaliar se o fluxo atual é bom o suficiente ou precisa de UX melhor).
- Tela de lançar/corrigir venda de colaboradores (componente `Lancamentos` — já aceita valor zero corretamente, criado antes desta sessão).
- **A conversa pendente da seção 6.1**: como o gerente vai lançar a premiação por estágio de cada colaborador (tabela `employee_stage_prizes` já existe e está com RLS pronta, só falta a UI e as regras de negócio).
- Advertências, tarefas atribuídas aos colaboradores, visão geral da loja (colaboradores, % da equipe, etc.) — avaliar se o dashboard atual do gerente já está bom ou precisa do mesmo tipo de revisão.

Depois do gerente, seguir pra sócio/supervisor (o combinado cross-loja já foi feito, mas talvez precise de ajustes visuais no mesmo espírito) e por último master_admin.

## 10. Convenções de comunicação com o Felipe
- Felipe é direto, não gosta de burocracia nem textão. Respostas devem ser objetivas, sem enrolação.
- Ele pede pra eu ser crítico e apontar pontos fracos/cegos, não só concordar — mas isso é mais sobre estratégia de negócio do que sobre este projeto técnico especificamente.
- Ele mesmo roda os comandos de git (`add`/`commit`/`push`) — eu só entrego prontos pra copiar/colar depois de verificar o build.
- Sempre que uma correção de bug for na verdade um padrão repetido em vários lugares do código (como o bug do CSS), vale a pena resolver na raiz e avisar quantos lugares isso afeta, em vez de corrigir só o caso reportado.

# CLAUDE.md — Z Meta

> Leia este arquivo primeiro, em qualquer sessão nova (Cowork, Claude Code ou outra). Ele descreve o que o projeto É e como ele funciona por baixo do capô. Para o histórico de decisões, bugs corrigidos e o que foi feito em cada sessão, a fonte de verdade é `CONTEXTO_PROJETO.md` (changelog datado) — leia os dois.

## 1. Contexto do produto

**Nome:** Z Meta.

**O que é:** SaaS multi-tenant de gestão de equipes de varejo (moda/atacado). Organiza o dia a dia operacional de lojas — checklist diário de tarefas, metas de vendas em camadas, comissionamento automático, advertências e premiações — com uma hierarquia de papéis que vai do colaborador de loja até um painel de Master Admin que opera o negócio como um todo (faturamento, cobrança por usuário cadastrado, saúde das empresas-cliente).

**Pra quem:**
- **Dono/operador do produto:** Felipe dos Santos Ribeiro, fundador da FORGE GROUP (holding que também tem a ZENITHBR — moda masculina premium — e a Z Finance — fintech pessoal). O Z Meta é a unidade de tecnologia de gestão do grupo.
- **Usuário final:** empresas de varejo/moda/atacado que contratam o Z Meta pra gerenciar as próprias lojas e equipes. Cada empresa-cliente tem dados 100% isolados das outras (multi-tenant desde a fundação — o produto nunca foi só uso interno da FORGE GROUP, foi desenhado para ser vendido).
- Dentro de cada empresa-cliente, os usuários finais são sócios, supervisores, gerentes e colaboradores de loja.

**Hierarquia de papéis** (`profiles.role`):
```
master_admin  → dono do Z Meta. Cadastra empresas-cliente, vê/opera tudo.
   └── socio         → dono de uma empresa-cliente. Vê TODAS as lojas da empresa automaticamente.
         └── supervisor  → escopo definido por acesso explícito a lojas (tabela loja_access).
               └── gerente     → dono de uma equipe dentro de uma loja (pode haver várias equipes/gerentes por loja).
                     └── colaborador → nível operacional: marca tarefas, lança vendas, vê sua meta/comissão.
```

## 2. Stack técnica

| Camada | Tecnologia | Detalhe |
|---|---|---|
| Framework | Next.js 14 (App Router) | JavaScript puro, sem TypeScript |
| UI | React 18 + Tailwind CSS | fonte Inter auto-hospedada via `@fontsource/inter` (não usa `next/font/google` — decisão deliberada, ver seção 5) |
| Ícones | `lucide-react` | |
| Exportação Excel | `xlsx` (SheetJS) | usado só em `ConsorcioDashboard.js` (relatório de leads), `import()` dinâmico pra não pesar o bundle inicial |
| Banco de dados | Supabase (Postgres) | project id `fjscwmrjkxgygdzwwrdh` |
| Auth | Supabase Auth | login por `username` + senha (ver seção 5 — não usa e-mail real) |
| Autorização | RLS (Row Level Security) no Postgres + checagens redundantes nas rotas de API | ver seção 4 |
| Estado | React state local (`useState`/`useEffect`) por componente, sem Redux/Zustand/React Query | cada view busca seus próprios dados do Supabase |
| Pagamentos | Não tem gateway de pagamento integrado | cobrança é calculada dentro do app (por usuário cadastrado) mas cobrada manualmente por fora hoje |
| Deploy | Vercel | auto-deploy a cada `git push` na branch `main` |
| PWA | `public/manifest.json` + metadata em `app/layout.js` | instalável como app (`display: standalone`) |

Sem framework de testes automatizados configurado (não há `test` no `package.json`).

## 3. Arquivos e pastas mais relevantes

| Caminho | Papel |
|---|---|
| `app/layout.js` | Root layout: importa fontes Inter + `globals.css`, define metadata/PWA/viewport |
| `app/page.js` | Rota `/`: decide pra onde redirecionar com base em `profiles.role` do usuário logado |
| `app/login/page.js` | Login por `username`+senha (converte pra e-mail técnico internamente) |
| `app/admin/page.js` | Painel do Master Admin — empresas, faturamento, financeiro, hierarquia de sócios/supervisores |
| `app/socio/page.js`, `app/supervisor/page.js` | Montam `AppShell` + `HierarchyHome` pro papel correspondente |
| `app/gerente/page.js` | Monta `AppShell` + `GerenteView` (vestuário) ou `GerenteViewConsorcio` (consórcio), decidido por `empresas.categoria_id` → `categorias_empresa.slug` |
| `app/colaborador/page.js` | Monta `AppShell` + `ColaboradorView` (vestuário) ou `ColaboradorViewConsorcio` (consórcio), mesmo padrão de resolução de categoria |
| `app/api/admin/*/route.js` | Rotas server-side que usam `service_role` (ver seção 5) — criação/edição/exclusão de usuários, empresas, lojas, acesso de hierarquia |
| `app/api/account/update-username/route.js` | Troca de username/senha do próprio usuário logado (resolve identidade pelo JWT real da sessão, nunca por id vindo do cliente) |
| `lib/HierarchyHome.js` | Experiência completa de **sócio/supervisor** — tela própria (não tem rota dedicada por sub-view), inclusive "ver como" gerente/colaborador e aba exclusiva de cadastro de supervisores. Categoria-aware de forma **mínima**: resolve a categoria da empresa uma vez, troca `EmpresaDashboard`→`ConsorcioDashboard` e o herocard quando consórcio, mas as abas Rankings/Faturamento (cross-loja) ainda não foram portadas pra consórcio — mostram aviso "em breve" nesse caso |
| `lib/GerenteView.js` | Experiência completa de **gerente** no segmento **vestuário** — dentro, renderiza `EmpresaDashboard` |
| `lib/GerenteViewConsorcio.js` | Espelha `GerenteView.js` pro segmento **consórcio** — dentro, renderiza `ConsorcioDashboard`. Fonte de vendas é `crm_leads`/`consorcio_goals` em vez de `sales_entries`/`sales_goals`. Exporta `GERENTE_TABS` (Início/**Calendário**/Metas) — só o gerente tem aba Calendário própria (agenda mensal de TODA a equipe, agregando `crm_leads.agendamento_at` de todos os colaboradores ativos, com atribuição por nome); supervisor/sócio/master seguem em `CONSORCIO_TABS` (sem Calendário). Início também tem um card "Agenda de hoje — equipe inteira", sempre visível |
| `lib/ColaboradorView.js` | Experiência completa de **colaborador** no segmento **vestuário** — herocard de meta do dia, checklist, histórico de vendas |
| `lib/ColaboradorViewConsorcio.js` | Experiência completa de **colaborador** no segmento **consórcio** — árvore de componente separada de `ColaboradorView.js` (decisão deliberada, isola risco entre categorias). Funil de ligações (cadastrar/agendar/resolver), agenda do dia, calendário mensal, checklist de tarefas reaproveitado. Roteada por `app/colaborador/page.js` a partir de `empresas.categoria_id` → `categorias_empresa.slug` |
| `lib/EmpresaDashboard.js` | Componente central **compartilhado** por gerente/supervisor/sócio/master no segmento **vestuário** — abas Placar/Colaboradores/Tarefas/Advertências/Premiações/Metas/Lançamentos por loja. `SubNav`, `Colaboradores`, `Tarefas`, `Advertencias`, `Premiacoes` são `export` (não só `export default`) porque são agnósticas de categoria e reaproveitadas direto em `ConsorcioDashboard.js` — único caso de exceção ao princípio "sempre bifurcar árvore de componente por categoria" |
| `lib/ConsorcioDashboard.js` | Espelha `EmpresaDashboard.js` pro segmento **consórcio** — abas Início (sub-aba Funil no lugar de Placar, mais Colaboradores/Tarefas/Advertências/Premiações reaproveitados)/Metas. Fonte de vendas é `crm_leads`/`consorcio_goals`/`consorcio_goal_allocations`/`consorcio_commission_settings`. Também tem o botão "Exportar Excel" (biblioteca `xlsx`, ver seção 6) que gera relatório de leads (linha a linha + resumo por colaborador) |
| `lib/AppShell.js` | Casca visual (header, "Meu perfil", trocar senha) usada em toda tela autenticada — monta `<SavedNoticeProvider>` (ver `lib/SavedNotice.js`) envolvendo toda a tela, então qualquer componente descendente tem acesso a `useSavedNotice()` |
| `lib/SavedNotice.js` | Context + hook globais (`SavedNoticeProvider`/`useSavedNotice()`) pro modal de confirmação "Alterações salvas com sucesso." — chamado de um lado a outro do app depois de qualquer ação de "Salvar" que não já mostre dado crítico inline (senha temporária) nem seja um toggle instantâneo de 1 clique |
| `lib/scoring.js` | Lógica pura de cálculo: % individual (`calcIndividualPct`), meta em camadas (`currentGoalTarget`) |
| `lib/date.js` | Utilitários de data e recorrência de tarefas (`isTaskDueOn`) |
| `lib/serverPermissions.js` | Helper server-side `hierarquiaCanManageLoja` — única fonte de verdade pra "sócio vs supervisor pode gerenciar essa loja?" nas rotas de API |
| `lib/supabaseClient.js` | Cliente Supabase **client-side** (anon key, sessão persistida) |
| `lib/supabaseAdmin.js` | Cliente Supabase **server-side only** (`service_role` key) — nunca importar em componente `"use client"` |
| `lib/generateUsername.js` | Geração/validação de `username` único na criação de contas |
| `lib/AutoFitText.js` | Componente que encolhe fonte (nunca corta/quebra) pra valores de tamanho variável — ver seção 5 |
| `lib/SelectField.js`, `lib/DateNav.js`, `lib/MonthNav.js`, `lib/Avatar.js`, `lib/ProgressBar.js` | Componentes de UI reutilizados em várias telas |
| `CONTEXTO_PROJETO.md` | **Changelog técnico datado** — toda decisão, bug corrigido e por quê. Ler junto com este arquivo |
| `SOBRE_O_PROJETO.md` | Resumo de negócio (o que é / propósito), pensado pra anexar como conhecimento de projeto fora do repo |

## 4. Estrutura do banco (Postgres/Supabase, schema `public`)

Todas as tabelas têm RLS habilitado. Multi-tenant por `empresa_id` (e a maioria também guarda `loja_id` direto, evitando joins pra RLS).

| Tabela | Campos-chave | Observações |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `role`, `username`, `empresa_id`, `loja_id`, `gerente_id`, `active`, `must_change_password`, `avatar_url` | `role` é um `CHECK` (`master_admin`/`socio`/`supervisor`/`gerente`/`colaborador`). `gerente_id` aponta pra outro profile (o gerente da equipe do colaborador) |
| `empresas` | `id`, `name`, `active`, `plano` (`trial`/`pago`/`cancelado`), `valor_por_usuario`, `desconto`, `cnpj`, `logo_url`, `categoria_id` | empresa-cliente (tenant raiz). `categoria_id` é **imutável depois que a empresa tem loja ou usuário** (trigger `prevent_categoria_change_after_setup`, ver seção 5) |
| `categorias_empresa` | `id`, `nome`, `slug`, `active` | segmento de negócio da empresa-cliente (vestuário, consórcio, ...) — tabela lookup em vez de enum fixo, porque a FORGE GROUP planeja vender pra outros segmentos além dos dois atuais. Cada categoria pode ter uma experiência de dashboard totalmente diferente (roteada pelo `slug`) |
| `lojas` | `id`, `empresa_id`, `name`, `active` | uma empresa pode ter várias lojas |
| `loja_access` | `profile_id`, `loja_id`, `permission` (`ver`/`gerenciar`) | **só usada por supervisor** — sócio nunca depende disso (vê a empresa inteira implicitamente) |
| `app_settings` | PK `loja_id`, `empresa_id`, `warning_penalty_points`, `team_threshold_pct`, `monthly_prize` | config por loja: desconto % por advertência, meta da barra geral, premiação mensal |
| `tasks` | `id`, `employee_id`, `loja_id`, `title`, `active`, `recurrence_type` (`daily`/`weekly`/`once`), `weekday`, `once_date`, `start_date` | exclusão é **soft-delete** (`active=false`) — nunca hard-delete, porque `task_completions.task_id` é `ON DELETE CASCADE` e apagaria histórico |
| `task_completions` | `task_id`, `completion_date`, `completed`, `completed_at` | linha só nasce quando alguém abre o checklist daquele dia ("semeadura preguiçosa" — não existe uma linha pra cada dia de antemão) |
| `warnings` | `employee_id`, `warning_date`, `reason`, `points`, `empresa_id`, `loja_id` | `points` é só registro histórico do % vigente no momento — o desconto real aplicado sempre vem de `app_settings.warning_penalty_points` × quantidade de advertências (ver seção 5) |
| `sales_entries` | `employee_id`, `entry_date`, `daily_amount`, `edited_by_manager` | lançamento de venda diário |
| `sales_goals` | `id`, `loja_id`, `month`, `name`, `store_total`, `distribution_mode` (`equal`/`custom`), `commission_pct_colaborador`, `commission_pct_gerente` | metas em camadas por loja/mês (Meta, Super Meta...) |
| `sales_goal_allocations` | `goal_id`, `employee_id`, `amount`, `commission_pct` | quanto de cada meta é alocado pra cada colaborador |
| `commission_settings` | `loja_id`, `month`, `non_achievement_colaborador_pct`, `non_achievement_gerente_pct` | taxa de comissão quando ninguém bate meta |
| `employee_prizes` | `employee_id`, `month`, `amount`, `description` | premiações lançadas por gestor |
| `consorcio_produto_categorias` | `id`, `empresa_id`, `nome`, `active` | categorias de produto de consórcio (veículo, imóvel...) — configurável por empresa-cliente, não enum fixo. Só `is_master_admin()`/sócio da própria empresa escreve; leitura liberada pra qualquer autenticado |
| `crm_leads` | `id`, `empresa_id`, `loja_id`, `employee_id`, `nome_completo`, `telefone`, `endereco`, `email`, `data_ligacao`, `agendamento_at`, `status` (`novo`/`agendado`/`follow_up`/`perdido`/`vendido`), `feedback`, `valor`, `categoria_produto_id`, `observacoes`, `vendido_at` | funil de vendas do segmento **consórcio** (ligação → agendamento → resultado). Registro único por lead evoluindo de status, não 3 tabelas separadas. `CHECK` de forma garante `agendamento_at` preenchido quando `status='agendado'` e `valor`+`categoria_produto_id` preenchidos só quando `status='vendido'` (mesmo padrão de `tasks.recurrence_type`). `vendido_at` é setado uma única vez, no momento em que vira venda — não reaproveitar `updated_at` pra isso, ele muda em qualquer edição. Sem policy de `DELETE` — funil não é hard-deletável, só editável, pra preservar histórico |
| `consorcio_goals` / `consorcio_goal_allocations` / `consorcio_commission_settings` | espelham `sales_goals`/`sales_goal_allocations`/`commission_settings` 1:1, incluindo o `UNIQUE(loja_id, month)` em `consorcio_commission_settings` (faltava na migração original da Fase 2, corrigido na Fase 4 — obrigatório porque a tela usa `upsert({ onConflict: "loja_id,month" })`) | motor de metas em camada do consórcio, **tabelas separadas** das de vestuário por decisão explícita do Felipe (isolar blast radius de bug entre os dois segmentos). Alimentadas por `sum(crm_leads.valor)` em vez de `sum(sales_entries.daily_amount)` — a lógica pura de cálculo (`currentGoalTarget`/`achievedTier`, `lib/scoring.js`) é agnóstica de fonte, reaproveitada sem mudança |
| `push_subscriptions` | `id`, `profile_id`, `endpoint` (unique), `p256dh`, `auth`, `created_at` | Fase 5 (notificações push/Web Push API) — uma linha por dispositivo/navegador inscrito. RLS: usuário só lê/escreve as próprias (`profile_id = auth.uid()`). Lida pela Edge Function `send-push` via `service_role`, bypassando RLS |
| `push_preferences` | PK `profile_id`, `advertencia`, `premiacao`, `lead_novo`, `venda_equipe`, `venda_loja`, `meta_batida`, `nova_meta`, `nova_tarefa`, `tarefas_completas` (todos boolean, default `true`), `updated_at` | 2026-07-20 — preferência de notificação **por usuário** (não por dispositivo). Cada papel só usa as chaves que de fato recebe: colaborador `advertencia`/`premiacao` sempre, `lead_novo` só em consórcio, `nova_meta`/`nova_tarefa` só em vestuário; gerente `venda_equipe`/`tarefas_completas`; sócio/supervisor `venda_loja`/`meta_batida`/`tarefas_completas` (`tarefas_completas` vale nas duas categorias). Sem linha = tudo habilitado (default do banco, opt-out). RLS: usuário só lê/escreve a própria linha |
| `push_task_complete_log` | PK composta (`employee_id`, `notice_date`) | 2026-07-20 — trava de idempotência pro evento "tarefas concluídas" (ver função `notify_tarefas_completas`): no máximo 1 notificação por colaborador por dia, mesmo que o RPC seja chamado mais de uma vez. RLS habilitado **sem nenhuma policy** de propósito — só a função `SECURITY DEFINER` (dona é `postgres`, que bypassa RLS) toca essa tabela; ninguém lê/escreve direto |

**Funções Postgres relevantes (schema `public`):**
- Helpers de RLS: `is_master_admin()`, `is_socio()`, `is_supervisor()`, `is_gerente()`, `is_my_team_member()`, `can_manage_loja()`, `can_view_loja()`, `my_empresa_id()`, `my_loja_id()`, `my_empresa_active()`.
- RPCs usadas pelo app: `get_team_progress` (Barra Geral de Atividades), `get_store_sales_ranking`, `admin_overview`, `admin_financeiro`, `admin_faturamento_mensal`, `admin_lojas_health` (dashboards do Master Admin), `admin_delete_empresa` (exclusão em cascata de empresa).
- Trigger `prevent_gerente_edit_monthly_prize` — bloqueia no banco (defesa em profundidade, além da checagem de UI) que um gerente edite `app_settings.monthly_prize`.
- Notificações push (Fase 5 + hierarquia 2026-07-20 + preferências 2026-07-20): `push_notify(profile_id, title, body, url)` manda o push pra um perfil; `push_notify_hierarquia_loja(loja_id, empresa_id, title, body, url, pref_key default null)` resolve e notifica todo sócio da empresa + todo supervisor com `loja_access` naquela loja, filtrando cada destinatário por `push_pref_enabled(profile_id, pref_key)` quando `pref_key` é informado. `push_pref_enabled(profile_id, pref_key)` consulta `push_preferences` (default `true` se não houver linha). `fmt_brl(numeric)` formata valor monetário como `R$ 1.234,56` na mão (não usa `to_char('G'/'D')`, que segue o `lc_numeric` do servidor — que aqui está em formato US, não BR). Todas essas 3 funções (`fmt_brl`, `push_pref_enabled`, `push_notify_hierarquia_loja`) são `SECURITY DEFINER` com `EXECUTE` revogado de `anon`/`authenticated`/`PUBLIC` (só `postgres`/`service_role`) — mesmo motivo de sempre: são `returns text`/`boolean`/`void`, não `returns trigger`, então ficariam chamáveis via RPC por qualquer usuário logado se o `EXECUTE` não fosse revogado. Triggers de evento (todas gateadas pela preferência do destinatário e usando `fmt_brl` onde há valor monetário): `notify_push_advertencia`/`notify_push_premiacao`/`notify_push_novo_lead`/`notify_push_venda` (Fase 5, notificam só o colaborador dono ou o gerente da equipe) + `notify_push_venda_vestuario`/`notify_push_venda_consorcio_hierarquia`/`notify_push_meta_vestuario`/`notify_push_meta_consorcio` (2026-07-20, notificam sócio/supervisor via `push_notify_hierarquia_loja` — "meta batida" só dispara na transação que efetivamente cruza uma nova camada de `sales_goals`/`consorcio_goals`, comparando total antes/depois, não a cada venda) + `notify_push_venda_vestuario_gerente` (2026-07-20, fecha a paridade com consórcio: notifica o gerente da equipe — `profiles.gerente_id` — em toda venda de vestuário via `sales_entries` INSERT com `daily_amount > 0`, mesma condição de `notify_push_venda_vestuario`, trigger separada e nova, não alterou nenhuma das existentes) + `notify_push_nova_meta_vestuario` (2026-07-20, `sales_goal_allocations` INSERT — só na atribuição, nunca em edição posterior — notifica o colaborador) + `notify_push_nova_tarefa_vestuario` (2026-07-20, `tasks` INSERT — só a criação da tarefa em si, nunca as recorrências diárias de `task_completions` — resolve a categoria da empresa do colaborador e só notifica se for `vestuario`). Além das triggers, RPC `notify_tarefas_completas(p_employee_id)` (2026-07-20, `SECURITY DEFINER`, `EXECUTE` concedido a `authenticated` de propósito — só essa função entre as não-trigger, porque é chamada direto pelo client): valida `p_employee_id = auth.uid()` (só reporta a própria conclusão), grava em `push_task_complete_log` com `ON CONFLICT DO NOTHING` (`FOUND` = false → já notificou hoje, sai sem mandar de novo) e então notifica sócio/supervisor (via `push_notify_hierarquia_loja`) + gerente, todos gateados por `tarefas_completas`. Chamada pelo client (`lib/ColaboradorView.js`/`lib/ColaboradorViewConsorcio.js`) no exato momento em que mostra o modal de "Parabéns! 100% das tarefas" — reaproveita o cálculo de conclusão que já existe no client em vez de duplicar a lógica de recorrência (`isTaskDueOn`) em SQL.

## 5. Regras técnicas críticas (quebram se não forem seguidas)

- **Login não usa e-mail real.** Usuário digita `username`; o app converte pra `${username}@zmeta.local` antes de chamar `supabase.auth.signInWithPassword` (`app/login/page.js`). Toda criação de conta segue essa mesma convenção.
- **`service_role` só em rotas de API (`app/api/**`), nunca em componente `"use client"`.** `lib/supabaseAdmin.js` lança erro se a env var não existir — é a única forma correta de ler/escrever dados de terceiros (RLS bloqueia leitura ampla pro client comum, de propósito).
- **Sócio ≠ Supervisor na checagem de permissão de loja.** Sócio gerencia todas as lojas da empresa implicitamente (nunca depende de `loja_access`); supervisor depende de `loja_access.permission = 'gerenciar'`. Essa distinção **tem que** passar por `hierarquiaCanManageLoja()` (`lib/serverPermissions.js`) em qualquer rota nova — já houve bug real de rotas reimplementando essa checagem de forma incompleta e bloqueando ações legítimas do sócio.
- **Hierarquia de quem pode cadastrar quem:** Master cadastra qualquer papel; Sócio cadastra supervisor/gerente/colaborador (sempre dentro da própria empresa, `empresaId` do client é ignorado no servidor); Gerente cadastra só colaborador. Enforçado client-side (renderização condicional) **e** server-side (checagem de role nas rotas).
- **`app/api/admin/delete-employee/route.js` só aceita excluir `colaborador`/`gerente`.** Excluir sócio/supervisor não é suportado hoje (a rota rejeita). `update-employee` (editar/ativar/desativar) já aceita os 4 papéis com bypass pro master.
- **Metas em camadas não somam.** A meta "em jogo" é sempre o próximo nível ainda não batido (`currentGoalTarget`, `lib/scoring.js`); a comissão aplicada é da maior camada **efetivamente atingida**, não da que está em jogo.
- **"Esperado" de tarefas nunca pode vir de contar `task_completions` existentes** — como a semeadura é preguiçosa, um colaborador cujo checklist ninguém abriu ainda entraria com `expected=0`, e `calcIndividualPct` trata isso como 100% (nota máxima por falta de dado). O certo é calcular quantos dias cada tarefa **ativa** valia via `isTaskDueOn` e só então cruzar com completions existentes. Esse bug já apareceu e foi corrigido em múltiplos lugares — ao adicionar um cálculo novo de progresso, seguir esse padrão.
- **Regra de ouro de UI:** dashboards compartilhados entre papéis (ex.: `EmpresaDashboard`) precisam ser **visualmente idênticos** entre quem os usa — só permissões e dados mudam, nunca o layout/componente em si.
- **Todo `<input type="date">` precisa da classe `date-input`** (definida em `app/globals.css`) — sem ela, o picker nativo renderiza maior que o resto do form em alguns Android/iOS e quebra o card.
- **Valores/textos de tamanho variável (moeda, %, contador, nome) nunca quebram linha nem vazam do card** — usar `lib/AutoFitText.js` (encolhe fonte por medição real, com convergência via `scrollWidth`/`clientWidth`, não confia em fórmula estimada sozinha) em vez de `break-words`. Para listas nome+valor lado a lado, o padrão é `truncate` no nome + `shrink-0 whitespace-nowrap` no valor.
- **O build roda com `eslint: { ignoreDuringBuilds: true }`** (`next.config.mjs`) — `npm run build` **não pega** JSX referenciando componente/ícone não importado (`ReferenceError` só em runtime). Já causou bug real em produção (aba inteira quebrando ao abrir). Rodar `eslint` com a regra `react/jsx-no-undef` manualmente antes de confiar cegamente no build é recomendado quando se mexe em ícones/imports.
- **`@fontsource/inter` em vez de `next/font/google`** — decisão deliberada porque `next/font/google` falha no ambiente de build usado pra verificação (sem acesso à internet do Google Fonts).
- **Identidade do `AppShell` sempre representa quem está de fato logado**, nunca a pessoa sendo "vista como" (impersonation) — resolvido pelo JWT real da sessão em `update-username`, nunca por id vindo do cliente. Ver `CONTEXTO_PROJETO.md` seção 4 antes de mexer em telas com "ver como".
- **Carregamento de dados no mount nunca pode ficar atrás de um `if (!prof.must_change_password)`.** Bug real corrigido em `lib/HierarchyHome.js` (2026-07-20): toda conta nova de sócio/supervisor nasce com `must_change_password=true`, então o carregamento (categoria/lojas/hero/etc.) ficava pulado no primeiro login, e o botão "Salvar" do `ChangePassword` só troca a flag em memória (não remonta o componente nem reroda o efeito de mount). Resultado: usuário via "Nenhuma loja atribuída" mesmo tendo acesso real no banco. Carregar sempre incondicionalmente (mesmo padrão de `app/colaborador/page.js`/`app/gerente/page.js`) e deixar `must_change_password` decidir só QUAL TELA renderizar, nunca o QUE carregar.
- **`empresas.categoria_id` é imutável depois que a empresa tem loja ou usuário cadastrado.** Enforçado por trigger no banco (`prevent_categoria_change_after_setup`, `BEFORE UPDATE` em `empresas`) — não confiar só na UI, porque master admin tem bypass de RLS em `empresas` e edita via `supabase.from("empresas").update(...)` direto do client. `app/admin/page.js` (`EmpresaDetail`) já espelha essa trava na UI (só mostra o seletor editável quando `lojas.length === 0 && _colabTotal === 0`), mas a trava de verdade é o trigger.

## 6. Workflow de build, teste e deploy

```bash
npm run dev      # desenvolvimento local
npm run build    # build de produção (usar isso pra verificar antes de qualquer commit)
npm run start    # roda o build de produção localmente
```

- **Sem testes automatizados** — verificação é manual: build limpo (`✓ Compiled successfully`) + leitura de código + (quando mexe em RLS/permissão) `get_advisors` do Supabase + conferência de cálculos contra dados reais via SQL antes de considerar um fix pronto.
- **Deploy é automático via Vercel**: qualquer `git push` na branch `main` publica no mesmo projeto/URL. Não há branch de staging.
- **Variáveis de ambiente** (Vercel → Settings → Environment Variables; localmente em `.env.local`, que é gitignored):

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (`https://fjscwmrjkxgygdzwwrdh.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave pública, usada no client |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta, **só** em rotas de API — nunca commitar |

- **DDL no Supabase:** usar `apply_migration`, nunca `execute_sql` pra alterações de schema.
- **Deployment Protection do Vercel precisa ficar desligado** (Settings → Deployment Protection → Vercel Authentication) — senão usuários finais (gestores/colaboradores) não conseguem abrir o app sem conta Vercel.

## 7. Identidade visual

Definida em `tailwind.config.js` e `app/globals.css`. Fonte: **Inter** (via `@fontsource`).

**Nova identidade "navy + gold" (2026-07)**: dourado é a cor de ação/destaque padrão do app; o gradiente roxo→rosa foi rebaixado a "só comemoração" (meta batida, 100% das tarefas). Ver `CONTEXTO_PROJETO.md` seção 11 ("Nova identidade visual") pro racional completo e o que foi/não foi convertido.

| Token | Cor | Uso |
|---|---|---|
| `navy` | `#12203a` | texto principal (fundo claro), base do tema |
| `gold` / `goldlight` | `#c9a15a` / `#e4c789` | **cor de destaque padrão** — botão de ação (`.btn`), avatar fallback, valores em rankings/listas escuras |
| `paper` | `#f5f3ee` | fundo da página (mantido claro — não houve flip pra dark mode global, decisão deliberada) |
| `line` | `#e7e3d9` | bordas em cartões claros |
| `muted` | `#7d7a6f` | texto secundário em fundo claro |
| `purple` → `pink` | `#7c3aed` → `#ec4899` | gradiente **reservado só pra comemoração** (`.btn-hype`, `.gradient-text`) — nunca em botão de ação comum |
| `teal`, `orange`, `blue`, `lime` | — | cores de apoio por contexto (ícones, badges pontuais) |
| `success` / `warn` / `danger` | `#16a34a` / `#d97706` / `#dc2626` | estados (também usados nos chips `.chip-ok/warn/danger` em fundo escuro) |

Classes utilitárias centrais (`@layer components` em `globals.css`):
- **Fundo claro** (padrão da maioria das telas): `.card` (borda + sombra + hover leve), `.input`, `.label`, `.badge`.
- **Botões**: `.btn` (dourado, ação padrão), `.btn-hype` (gradiente roxo→rosa, só comemoração — modais de "Parabéns!"), `.btn-outline` (contorno roxo).
- **Superfície escura opt-in** (não é dark mode do app inteiro — só cartões específicos que trocaram de fundo branco pra navy): `.card-dark`, `.row-card` (linha de lista, substitui `<tr>/<td>` de tabela crua), `.avatar-chip`, `.label-dark`, `.chip-ok/warn/danger`, `.rank-pos` + `.rank-pos-1/2/3/plain` (medalha de ranking). Usadas hoje em: rankings (`HierarchyHome.js`), listas de Colaboradores/Gerentes (`EmpresaDashboard.js`), Funil por colaborador e Vendas do mês (`ConsorcioDashboard.js`). Financeiro/Faturamento **ainda não convertido**.

Tema PWA: `theme_color`/`background_color` em `public/manifest.json`, ícones em `public/`.

## 8. Pendências abertas / limitações conhecidas

- **Excluir sócio ou supervisor não é suportado** — só `colaborador`/`gerente` podem ser hard-deletados hoje via `delete-employee`. Se precisar dessa função, é preciso decidir a regra de negócio (o que acontece com a empresa/lojas sob gestão) antes de implementar.
- **Sem testes automatizados nem ambiente de staging** — todo mudança crítica de cálculo (metas, comissão, faturamento) deve ser conferida contra dados reais via SQL antes de dar como concluída.
- **Auditoria mobile é só estática** (leitura de código/padrões CSS defensivos) — nunca houve teste em dispositivo físico real. Vale pedir pro Felipe testar em iPhone/Android e reportar quebras visuais.
- **`ignoreDuringBuilds: true` no ESLint** — bugs de JSX/import indefinido não aparecem no build, só em produção. Considerar ligar lint no CI ou pelo menos rodar `react/jsx-no-undef` manualmente antes de PRs que mexem em ícones/imports.
- **Sem CHANGELOG formal/versionamento semântico** — histórico completo de decisões e bugs corrigidos vive em `CONTEXTO_PROJETO.md` (seção 12 tem a única funcionalidade explicitamente recusada até agora: master ver senhas de usuários em texto puro — recusado por segurança).
- Ver `CONTEXTO_PROJETO.md` seção 13 pra lista completa de "coisas a saber" e próximos passos sugeridos.

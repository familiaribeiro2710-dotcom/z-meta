# Z Meta — Visão Geral do Projeto

## O que é

Z Meta é um SaaS de gestão de equipes de varejo (moda/atacado), multi-tenant, criado por **Felipe dos Santos Ribeiro**, fundador da **FORGE GROUP**. O sistema organiza o dia a dia operacional de lojas: tarefas diárias, metas de vendas em camadas, comissionamento, advertências e premiações — para colaboradores, gerentes, supervisores e sócios de empresas-cliente, com um painel de Master Admin no topo para operar o negócio como um todo (faturamento, cobrança por usuário cadastrado, saúde das lojas).

## Propósito

O produto nasceu de uma dor real de gestão de equipes de loja: falta de visibilidade sobre quem está batendo meta, quem está com tarefas pendentes, e como calcular comissão/premiação de forma justa e automática. O Z Meta resolve isso dando a cada nível da hierarquia (colaborador, gerente, supervisor, sócio) exatamente a visão que precisa — meta do dia, progresso, ranking, atividades pendentes — sem depender de planilha manual.

**Não é um produto interno só da FORGE GROUP** — foi desenhado desde a fundação para ser multi-tenant e **vendido a outras empresas de varejo**, com o Master Admin cobrando por usuário cadastrado em cada empresa-cliente.

## Contexto: FORGE GROUP

O Z Meta é uma das unidades da **FORGE GROUP**, a holding de Felipe, que atua em três frentes:

- **ZENITHBR** — moda masculina premium (quiet luxury, minimalismo, posicionamento por percepção de valor).
- **MOVA** — produtos de consumo de alto giro/tendência (TikTok Shop, e-commerce de volume, testes rápidos).
- **Z FINANCE** — fintech de organização financeira pessoal, modelo SaaS por assinatura.

O Z Meta é o produto de **tecnologia de gestão** do grupo — e tem potencial de se tornar receita recorrente própria, vendido para fora, assim como a Z Finance.

## Como funciona (hierarquia de papéis)

```
master_admin  → dono do Z Meta. Vê e opera todas as empresas-cliente.
   └── sócio         → dono de uma empresa-cliente. Vê todas as lojas da empresa.
         └── supervisor  → escopo definido por acesso explícito a lojas específicas.
               └── gerente     → dono de uma equipe dentro de uma loja.
                     └── colaborador → nível operacional (marca tarefas, lança vendas, vê sua meta/comissão).
```

Cada papel tem sua própria experiência de tela, mas todos compartilham os mesmos componentes centrais — o que garante consistência visual e evita duplicar lógica de negócio.

## O que o sistema resolve, na prática

- **Metas em camadas** (Meta, Super Meta, Hiper Meta...) que não somam — sempre vale o próximo nível ainda não batido, e a comissão é calculada pela maior camada realmente atingida.
- **Comissionamento automático** por colaborador/gerente, com regra de não-atingimento configurável.
- **Tarefas recorrentes** (diárias, semanais ou únicas) com checklist e histórico preservado.
- **Advertências** com desconto configurável de pontos.
- **Premiações** lançadas por gestor.
- **Rankings** (vendedores, lojas, tarefas concluídas, comissionados) por loja e por empresa.
- **Faturamento e cobrança** centralizados no painel do Master Admin, por empresa-cliente e por usuário cadastrado.

## Stack técnica (resumo)

- **Frontend/Backend:** Next.js 14 (App Router), JavaScript puro.
- **Estilo:** Tailwind CSS, fonte Inter.
- **Dados:** Supabase (Postgres + Auth + RLS + Storage).
- **Deploy:** Vercel.
- **Login:** usuário + senha (sem e-mail real, internamente convertido para login técnico no Supabase Auth).

## Status atual

Produto em desenvolvimento ativo, já com empresas de teste rodando dados reais (ex.: ArmyBR). O ritmo de trabalho é de melhoria contínua: correção de bugs de cálculo (metas, comissão, faturamento), refino de UX (consistência visual entre papéis, mobile-first) e novas funcionalidades sob demanda. Toda decisão técnica e histórico de mudanças fica documentado em `CONTEXTO_PROJETO.md`, dentro da própria pasta do projeto — a fonte de verdade persistente para retomar o trabalho em qualquer novo chat.

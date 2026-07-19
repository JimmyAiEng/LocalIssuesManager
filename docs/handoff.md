# Handoff — Intenção do AI Development Workflow

Fonte: `docs/AIDevelopmentWorkfow.drawio` (análise de 2026-07-17).
Este documento resume a intenção do autor para o futuro do issue-manager.
Não descreve o estado atual do código.

## Problema de hoje

O modo atual depende de sessões interativas: o engenheiro escreve uma demanda, abre sessão com o agente e itera (Lint → Unit → E2E → Mutation) até o code review humano.
Diagnóstico registrado no diagrama: dependência excessiva de sessões e impossibilidade de escalar.

## Visão

Substituir sessões por **Issues como unidade de orquestração**.
Cada etapa roda com autonomia total em **worktree + Docker isolados**, com liberdade para executar o que precisar até os testes passarem.
Legenda do diagrama: azul = SW Engineer (humano), vermelho = AI Agent, verde = Code (etapa determinística/automatizada).

## Macro-fluxo

1. **Issue Writing** (humano) cria a Issue inicial.
2. **Requirement Engineering Workflow** consome essa Issue e produz N Issues de Design (fan-out).
3. Cada Issue de Design passa pelo **Design Workflow**, que gera M **Units of Work** (segundo fan-out — paralelização em dois níveis).
4. Todas as Units of Work convergem para **Quality Review** (agente) → **Merge & Pull Request** → **SonarQube** → **PR Analysis** (agente) → **Code Review** (humano, gate final).

## Requirement Engineering Workflow

Entrada: Issue inicial com `TAG=Planning` + artefatos.
O **Requirement Engineering Agent** produz um **Full PRD** e gera requisitos com critérios de aceite.
O engenheiro participa de um loop de refinamento na mesma sessão, realimentando o agente até alinhar.
Alinhado, uma Issue de decomposição é gerada automaticamente.
O **Breaking Issues Agent** agrupa requisitos por semelhança em **clusters de PRD**.
Cada cluster recebe seus requisitos com critérios de aceite e vira uma **nova Issue `TAG=Design`**.

## Design Workflow

Entrada: Issue `TAG=Design` + artefatos.
O **Architect Agent** decide na bifurcação **"Changed?"** se a arquitetura precisa mudar para atender o cluster.

Se **não muda**: pula direto para o **Implementation Plan**, sem loop e sem revisão humana de desenho.

Se **muda**: o agente produz o desenho em quatro níveis — High Level, Package Level, Class Level e Interface/Data Model.
Cada artefato passa por **UML Validation** automática e revisão do engenheiro.
O loop roda dentro da mesma sessão (sem trocar de Issue) até o **Acceptance** humano aprovar.

Aprovado o desenho, sai um **Implementation Plan** validado por código.
O **Breaking Issues Agent** o decompõe em **Small Implementation Plans**, cada um validado individualmente.
Cada plano pequeno vira uma **Issue `TAG=Implement`**, concorrente ou sequencial, conforme tamanho da alteração e possibilidade de paralelização.

## Unit of Work (execução de Implement)

TDD com dois agentes distintos.
O **Test Coding** escreve os testes primeiro.
O **Coding Agent** itera contra os gates automáticos: Lint → Unit Tests → Arch Fitness Functions → E2E Tests, com falhas voltando para ele.
Passando tudo: **Code Review por agente** e **Mutation Tests**.
Falha de mutação volta para o **Test Coding** — o problema é teste fraco, não código.

## Onde o humano é necessário

1. **Issue Writing** — origina a demanda.
2. **Requirement Engineering** — loop de refinamento do PRD e dos requisitos.
3. **Design Workflow** — revisão dos quatro artefatos de arquitetura e decisão de **Acceptance** (apenas quando "Changed?" = sim).
4. **Code Review final do PR** — último gate antes de integrar.

O humano fica nas pontas (intenção e aceite) e nos dois momentos de alinhamento conceitual (requisitos e desenho).
Todo o resto é agente ou automação.

## Validação por código

Princípio: nenhum artefato chega a um revisor (humano ou agente) sem antes passar por validação determinística por código.

- **Especificação:** UML Validation nos 4 níveis de arquitetura; Implementation Plan Validation; Small Implementation Plan Validation.
- **Implementação:** Lint, Unit Tests, Arch Fitness Functions, E2E Tests, Mutation Tests.
- **PR:** Merge & Pull Request e SonarQube antes da PR Analysis por agente.

A validação por código filtra o mecânico; humano e agente revisor só gastam atenção com o semântico.

## Síntese

O issue-manager deve evoluir para um **orquestrador de pipeline de SDLC assíncrono e escalável**.
Agentes especializados (Requirement, Breaking Issues, Architect, Test Coding, Coding, Quality Review, PR Analysis) trabalham em Issues isoladas e paralelas.
A linhagem Planning → Design → Implement avança por criação de novas Issues encadeadas, coerente com o modelo Issue-only já adotado.
Os pontos novos que o diagrama detalha: os fan-outs (1 Planning → N Design → N×M Implement), a separação Test Coding / Coding Agent no TDD, e o loop de desenho condicional a mudança arquitetural.

---
name: sdlc-workflow
description: >-
  SDLC de desenvolvimento com issues-local: modelo Issue-only (type + action),
  autonomia AFK/HITL, gates por action, evidência obrigatória e linhagem entre
  Issues. Use ao reivindicar ou trabalhar qualquer Issue devolvida por `issues next`.
---

# sdlc-workflow (camada 0)

**Não** executa nenhuma fase — só orienta o processo e roteia a skill da action.
Válido em **qualquer projeto** que use este pack + o CLI `issues` do issues-local.

## Modelo: só Issues

Não existem Tickets.
Uma **Issue** é a unidade de trabalho de uma sessão: pequena, com uma entrega única.

- **type** diz o problema: `Fix` · `Feat` · `Research` · `Refactor`.
- **action** diz a entrega esperada: `Planning` · `Design` · `Implement` · `QA` · `Deploy`.
- Status: `OPEN → CLAIMED → (AWAITING →) CLOSED`.
- Trabalho maior vira **novas Issues relacionadas** (`--relates`), nunca uma Issue gorda.
- Não há validação de sequência entre actions: você pode criar uma Issue `Implement` sem `Design` anterior — use o bom senso do fluxo (`docs/AIDevelopmentWorkfow.drawio`).

## Linhagem (relates)

Issues podem se relacionar (`issues relate` ou `--relates` no create).
Quem reivindica uma Issue recebe no prompt os **artefatos das relacionadas** — é assim que o design congelado chega à sessão de implementação.
Ao decompor trabalho, crie as novas Issues já relacionadas à origem.

## O loop do agente

A cada rodada, rode `issues next --prompt --project <p> --agent <ia>` para reivindicar a próxima Issue.
Execute **só** a action da Issue reivindicada, conclua com evidência e repita.

## Roteamento por action

| action | Skill | Entrega obrigatória (gate de conclusão) |
|---|---|---|
| `Planning` | `planning-phase` | Requisitos Gherkin válidos (`issues requirements set`), máx. 5 Features **+** Full PRD válido (`issues prd set`) com clusters **+** **uma filha `Design` por cluster** (`issues decompose`): sem a decomposição completa, o gate aponta o cluster descoberto e não fecha |
| `Design` | `design-phase` | Decisão de arquitetura (`issues design changed --value true\|false`) + plano válido (`issues plan set`) **+** **≥1 filha `Implement`** (`issues decompose`, uma por Small Plan). Se `true`: `design.md` + os 4 níveis (High Level, Package, Class, Interface/DataModel) em PlantUML válido e **nunca fecha AFK** (só `AWAITING`, aceite humano). Se `false`: dispensa diagramas e revisão humana |
| `Implement` | `implement-phase` | Worktree usada + check do projeto passando (roda sozinho no fechamento). Com `--test-paths` configurado, exige também a ordem TDD no histórico da worktree: um commit só-de-testes antes do primeiro commit de produção (cita o commit infrator) |
| `QA` | `qa-phase` | Artefato .md da validação requisito×comportamento (`issues artifact`) |
| `Deploy` | `deployment-phase` | Nunca fecha AFK: só `AWAITING` com link http(s) de PR + resultado da análise na thread; fecha só via `decide` humano |

## Qualificação (no claim)

Se a Issue reivindicada não tem `complexity` e `risk`, classifique antes de trabalhar: `issues tag --id <id> --complexity … --risk … --agent <ia>`.
A IA só **escala** tags; rebaixar supervisão é prerrogativa humana.
Se a Issue for grande demais para uma sessão, **feche-a** (reason `obsoleto`) e crie Issues menores relacionadas.

## Autonomia e conclusão

- **AFK (padrão)**: a IA fecha direto — `issues status --id <id> --agent <ia> --status CLOSED --comment "<evidência>" --reason concluido`.
- **HITL**, `risk=ALTO` ou `complexity=ALTA`: a IA **não fecha**; envia para decisão humana — `issues status … --status AWAITING --comment "<evidência>"` — e o humano decide no painel web.
- A **evidência é obrigatória**: um relatório curto do que foi feito, os passos e as decisões tomadas.
- O gate da action roda nas duas saídas (AWAITING e CLOSED); sem a entrega, o comando falha explicando o que falta.

## Limite de tamanho (300 palavras)

Todo texto (problema, artefato, comentário, evidência) é limitado a **300 palavras**; requisitos, a **5 Features**.
Se o sistema rejeitar por tamanho, o remédio nunca é resumir à força: **feche a Issue e decomponha** em Issues menores relacionadas.

## Comandos (issues-local)

```text
issues project create --name <p> --repo <path> [--container <img>] [--check <cmd>] [--test-paths <csv>]   # registra projeto (repo + check de Implement; --container = imagem Docker com o toolchain, roda cada check isolado; --test-paths liga o enforcement de TDD)
issues project list
issues create --title <t> --project <p> --type <T> --action <A> --problem <txt>
              [--acceptance-criteria <c>] [--relates a,b] [--artifact-file <a.md>]
              [--complexity …] [--risk …] [--human-need HITL|AFK] (--agent <ia>|--human)
issues next --prompt --project <p> --agent <ia>      # reivindica a próxima Issue (o loop)
issues get --id <id> [REQUIREMENTS|DESIGN|PLAN] | issues list [--status --project --type --title]
issues comment --id <id> --comment <t> [--attach <arquivo>] [--role <papel>]
issues tag --id <id> [--complexity …] [--risk …] [--human-need …] (--agent <ia>|--human)
issues relate --id <id> --relates <a,b>              # linhagem entre Issues
issues decompose --id <id> --into <arquivo.json> (--agent <ia>|--human)  # fan-out: cria as filhas (Design por cluster / Implement por Small Plan)
issues artifact --id <id> --file <a.md>              # grava/substitui o Artefato .md (≤300 palavras)
issues status --id <id> --agent <ia> --status AWAITING|CLOSED --comment <evidência> [--reason <r>] [--role <papel>]
issues worktree add|remove --id <id>                 # worktree git no repo do projeto
issues requirements set --id <id> --file <req.json>  # Features Gherkin (entrega de Planning)
issues prd set --id <id> --file <prd.json>           # Full PRD com clusters (entrega de Planning)
issues design doc|add --issue <id> [--kind <k>] --file <f>   # entrega de Design
issues design changed --issue <id> --value true|false        # decisão de arquitetura (entrega de Design)
issues plan set --id <id> --file <plan.json>         # plano de implementação (entrega de Design)
```

`HITL` = human in the loop (a conclusão é decisão humana, no web).
`AFK` = away from keyboard (a IA fecha sozinha, com evidência).
Detalhes de sintaxe: `issues --help`.

## Progressive disclosure (obrigatório)

1. Você está na camada 0 (este arquivo) — carregue-o em todo claim.
2. Leia a skill da action da Issue reivindicada (tabela acima).
3. A skill da action diz o que a fase entrega e como concluí-la; o **como** executar é decisão do agente.
4. **Não** carregue skills de outras actions neste claim.

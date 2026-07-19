# Action `Deploy`

Preparar PR/entrega e pedir o go/no-go humano.

## Objetivo

Preparar PR / entrega / handoff operacional.
No diagrama: **Merge & Pull Request** → análise estática → **PR Analysis** → Code Review humano.

## Validações da fase

- Prepare o PR com o conjunto integrado; **não** faça o merge.
- Se o repositório tiver análise estática de PR (ex.: SonarQube), aguarde/colete o resultado.
- **PR Analysis**: analise o diff do PR e os apontamentos da análise estática; trate ou registre cada um antes de pedir o go/no-go.

## Heurísticas

- Retrabalho de produto → nova Issue `Implement` relacionada, não esta action.
- **Não faça merge**: prepare PR/nota e peça o go/no-go via `AWAITING`.
- **Como** entregar (PR, deploy, checklist) é decisão do agente.

## Encerramento

Deploy **nunca fecha AFK**: o go/no-go do deploy é decisão humana.
O agente só entrega para `AWAITING` — pedir `CLOSED` numa Issue Deploy é barrado com erro orientando usar `AWAITING`.
O gate exige evidência estruturada na thread: um **link http(s) do PR** e a palavra `análise`, `PR Analysis` ou `Sonar` com o resultado, no comentário do `AWAITING` ou em `issues comment` anterior.

```bash
issues status --id <id> --agent <ia> --status AWAITING \
  --comment "PR: https://github.com/org/repo/pull/42 — análise estática: 0 bugs, 0 vulnerabilidades, 2 code smells tratados."
```

Só o `decide` humano fecha a Issue depois — e o Code Review final fica auditado (`decided_by`).
Entregue para `AWAITING` e **encerre a sessão**: não busque outra Issue.

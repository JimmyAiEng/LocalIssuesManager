---
name: deployment-phase
description: >-
  Action Deploy do workflow: preparar PR/entrega e pedir o go/no-go humano.
  Use quando a Issue reivindicada tem action=Deploy.
---

# deployment-phase (camada 1)

Acionada quando a Issue reivindicada tem **action=`Deploy`**.

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
O gate exige evidência estruturada na thread: um **link http(s) do PR** e o **resultado da análise** (SonarQube/PR Analysis), no comentário do `AWAITING` ou em `issues comment` anterior.
`issues status --id <id> --agent <ia> --status AWAITING --comment "<link PR http(s) + resultado da análise>"`.
Só o `decide` humano fecha a Issue depois — e o Code Review final fica auditado (`decided_by`).

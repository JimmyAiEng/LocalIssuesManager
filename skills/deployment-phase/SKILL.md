---
name: deployment-phase
description: >-
  Fase Deploy do workflow: preparar PR/entrega e pedir o gate G4 (go/no-go).
  Use quando o Ticket claimado tem type=Deploy.
---

# deployment-phase (camada 1)

Acionada quando o Ticket claimado tem **type=`Deploy`**.

## Objetivo

Preparar PR / entrega / handoff operacional.
No diagrama: **Merge & Pull Request** → análise estática → **PR Analysis** → Code Review humano.
Gate **G4**: go / no-go de merge.

## Validações da fase

- Prepare o PR com o conjunto integrado; **não** faça o merge.
- Se o repositório tiver análise estática de PR (ex.: SonarQube), aguarde/colete o resultado.
- **PR Analysis**: analise o diff do PR e os apontamentos da análise estática; trate ou registre cada um antes de pedir G4.

## Heurísticas

- Fluxo feliz: após G3 aprovado (Ticket `Deploy` já criado pelo gate).
- Retrabalho de produto → Tickets Implement, não esta fase.
- **Não faça merge**: prepare PR/nota e peça G4 via `AWAITING`.
- **Como** entregar (PR, deploy, checklist) é decisão do agente.

## Saídas

PR e/ou nota de entrega; pedido explícito de G4 no comentário.

## Encerramento

Mova o **Ticket** para `AWAITING` com `--last` (Deploy é a fase final; a flag é sticky e dispara o Confirmation quando o Ticket for fechado):
`issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…" --last`.

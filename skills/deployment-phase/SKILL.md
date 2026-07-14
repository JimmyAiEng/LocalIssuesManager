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
Gate **G4**: go / no-go de merge.

## Heurísticas

- Fluxo feliz: após G3 aprovado (Ticket `Deploy` já criado pelo gate).
- Retrabalho de produto → Tickets Implement, não esta fase.
- **Não faça merge**: prepare PR/nota e peça G4 via `AWAITING`.
- **Como** entregar (PR, deploy, checklist) é decisão do agente.

## Saídas

PR e/ou nota de entrega; pedido explícito de G4 no comentário.

## Encerramento

Mova o **Ticket** para `AWAITING`:
`issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…"`.

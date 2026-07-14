---
name: planning-phase
description: >-
  Fase Planning do workflow: alinhar problema, requisitos e domínio, e pedir o
  gate G1. Use quando o Ticket claimado tem type=Planning.
---

# planning-phase (camada 1)

Acionada quando o Ticket claimado tem **type=`Planning`**.

## Objetivo

Alinhar problema, requisitos (RF/RNF) e domínio.
Gate **G1**: humano aceita → fecha Planning → abre Design.

## Heurísticas

- Escopo grande demais para uma sessão → **criar** Tickets de continuação.
- Preferir fatias revisáveis pelo humano.
- O tipo do Ticket é imutável; avanço de fase = **novo Ticket** do tipo seguinte.
- **Como** planejar (pesquisa, glossário, ADRs, etc.) é decisão do agente.

## Saídas

Problema e requisitos registrados na Issue, prontos para o humano decidir G1.

## Encerramento

Mova o **Ticket** para `AWAITING`:
`issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…"`.

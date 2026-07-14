---
name: design-phase
description: >-
  Fase Design do workflow: explorar desenho/prototipar se preciso, congelar a
  spec, fatiar Tickets independentes e pedir o gate G2. Use quando o Ticket
  claimado tem type=Design.
---

# design-phase (camada 1)

Acionada quando o Ticket claimado tem **type=`Design`**.

## Objetivo

Congelar a spec e fatiar o trabalho em Tickets **independentes**.
Gate **G2**: humano aceita → fecha Design → abre Implement.

## Heurísticas

- **Explorar desenho** (opcional): só se os requisitos não bastarem para especificar; apresente opções + trade-offs e peça o gate de **direção** (humano escolhe) antes da spec.
- **Prototipar** (opcional): artefato **descartável** em worktree, antes e/ou depois do gate de direção; não vira produto.
- Se os requisitos bastam, vá direto para spec + fatiamento.
- Tickets fatiados são independentes, sem grafo de dependência obrigatória; paralelo ok.
- **Como** desenhar e especificar é decisão do agente.

## Saídas

Spec pronta para aceite; Tickets Implement (e outros se preciso) criados via `issues ticket create`.

## Encerramento

Mova o **Ticket** para `AWAITING`:
`issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…"`.

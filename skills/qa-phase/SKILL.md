---
name: qa-phase
description: >-
  Fase QA do workflow: validar o conjunto entregue (≠ review de Implement) e
  pedir o gate G3. Use quando o Ticket claimado tem type=QA.
---

# qa-phase (camada 1)

Acionada quando o Ticket claimado tem **type=`QA`**.

## Objetivo

Validar o conjunto entregue contra requisitos e spec.
Gate **G3**: humano aprova → Deploy; reprova → novos Tickets Implement.

## Heurísticas

- **Não** trate isto como o review interno de Implement; QA valida o conjunto, não a fatia.
- Preferir **outro** harness/modelo que o da Implement — recomendado, não obrigatório.
- Retrabalho: `decide OPEN` ou cria Tickets Implement novos (independentes).
- **Como** validar (perspectivas, ferramentas, cobertura) é decisão do agente.

## Saídas

Veredicto + achados; pedido claro de G3 no comentário.

## Encerramento

Mova o **Ticket** para `AWAITING`:
`issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…"`.

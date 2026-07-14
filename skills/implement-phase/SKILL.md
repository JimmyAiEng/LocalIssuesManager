---
name: implement-phase
description: >-
  Fase Implement do workflow: entregar fatia funcional com testes e review
  interno, e pedir revisão da fatia. Use quando o Ticket claimado tem type=Implement.
---

# implement-phase (camada 1)

Acionada quando o Ticket claimado tem **type=`Implement`**.

## Objetivo

Entregar fatia **funcional/integrável** conforme a spec, com testes e review interno.
Humano revisa a fatia.
Quando o conjunto Implement acordado estiver feito, abre-se Ticket(s) **QA**.

## Heurísticas

- Cada Ticket = código integrável, revisável pelo humano.
- Fatia grande → fecha **criando** Tickets de continuação; paralelo ok.
- Review interno **não** substitui um Ticket tipo `QA`.
- **Como** implementar (TDD, ferramentas, review) é decisão do agente.

## Saídas

Código + testes da fatia; achados de review tratados ou registrados.

## Encerramento

Mova o **Ticket** para `AWAITING`:
`issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…"`.

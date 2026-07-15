---
name: confirmation-phase
description: >-
  Fase de confirmação: verificar se a Issue foi de fato resolvida e destravar o
  agregado. Use quando o Ticket claimado tem type=Confirmation.
---

# confirmation-phase (camada 1)

Acionada quando o Ticket claimado tem **type=`Confirmation`**.

Este Ticket é **gerado pelo sistema** ao fechar o último Ticket de uma Issue `ON-GOING`.
Ele reabre a Issue na fila (`next`) para que alguém decida se o trabalho realmente terminou — sem ele, uma Issue `ON-GOING` sem Tickets `OPEN` ficaria presa.

## Objetivo

Confirmar se o problema descrito na Issue foi resolvido pelos Tickets já concluídos.

## Heurísticas

- Releia o `problem` e os critérios da Issue; confronte com o que os Tickets `CLOSED` entregaram.
- **Como** verificar (rodar o produto, revisar artefatos, checar aceitação) é decisão do agente.
- Não crie outro Ticket `Confirmation`: fechar este **não** gera um novo (o sistema quebra o loop).

## Encerramento

**Resolvido** → feche este Ticket. Ao fechar o `Confirmation` com todos os demais Tickets `CLOSED`, o sistema move a Issue para `AWAITING` automaticamente (decisão humana `OPEN|CLOSED`):

```
issues ticket status --issue <id> --id <tid> --agent <ia> --status CLOSED --comment "…" --reason concluido
```

Numa Issue HITL o `Confirmation` também é HITL: em vez de `CLOSED`, mande-o para `AWAITING` e o humano decide — o avanço da Issue acontece igual ao fechar.

```
issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…"
```

**Não resolvido** → crie os Tickets que faltam e feche este:

```
issues ticket create --issue <id> --type <T> --objective "…" --task "…" --acceptance-criteria "…" --agent <ia>
issues ticket status --issue <id> --id <tid> --agent <ia> --status CLOSED --comment "trabalho restante em novos Tickets" --reason concluido
```

Como restam Tickets `OPEN`, a Issue segue `ON-GOING` na fila até que todos fechem de novo.

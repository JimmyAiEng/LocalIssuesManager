# Grau de autonomia na solução dos problemas

## Contexto

O "grau de autonomia" É a tag `human_need` que já existe (`HITL` | `AFK`), aplicável a Issues e Tickets.
A regra do negócio precisa que essa tag governe o que a IA pode fazer com os Tickets de uma Issue.

## Regras forçadas pelo sistema

- Issue `AFK` (ou sem tag de autonomia): nenhuma restrição nova; a IA cria e encerra todos os Tickets e leva a Issue de OPEN até AWAITING.
- Issue `HITL`: todo Ticket precisa carregar a tag de autonomia (`human_need`).
- Issue `HITL`: Tickets de `Planning` e `Design` são obrigatoriamente `HITL` (não podem ser `AFK`).
- Issue `HITL`: os demais tipos (`Implement`, `QA`, `Deploy`) podem ser `AFK` ou `HITL`, escolhido na criação.

## Decisão de design

As tags eram aplicadas só depois da criação, via comando `tag` separado.
A regra HITL exige conhecer a autonomia do Ticket já na criação, então adicionamos a flag opcional `--human-need HITL|AFK` em `issues ticket create`, definindo a autonomia no nascimento do Ticket.

A validação vive no domínio, numa única função `assertTicketAutonomy(issueHumanNeed, type, humanNeed)` em `ticket_entity.ts`.
Ela é o choke point chamado pelos dois caminhos do agregado `Issue`: `addTicket` (criação) e `tagTicket` (marcação posterior).
Assim a mesma regra vale tanto ao criar quanto ao re-taguear, sem cópias divergentes.
Violações lançam `DomainError`, não ficam só na documentação.

## Compatibilidade

Retrocompatível: Issues e Tickets sem tag de autonomia continuam funcionando.
Só Issues `HITL` impõem as novas restrições.

---
name: implement-phase
description: >-
  Fase Implement do workflow (Unit of Work): entregar fatia funcional via TDD,
  passar o pipeline de validação e o review interno. Use quando o Ticket
  claimado tem type=Implement.
---

Seu objetivo é entregar fatia **funcional/integrável** conforme a spec, com testes e review interno.

Quando o conjunto Implement acordado estiver feito, abre-se Ticket(s) **QA**.

## Fluxo da Unit of Work

1. **Test Coding (TDD)**: escreva primeiro os testes que provam a fatia, a partir da spec e dos critérios de aceitação. Rode os testes. Eles devem falhar
2. **Coding**: implemente até os testes passarem.
3. **Pipeline de validação**, nesta ordem — falhou, volte ao código:
   Lint > testes unitários > fitness functions de arquitetura > testes E2E (se aplicável) > testes de mutação **só na parte alterada**.
4. **Review interno** da fatia (mutantes sobreviventes e achados de review viram novos testes/código — volte ao passo 1).

Use as ferramentas que o **próprio repositório** define (scripts, CI, docs); esta skill não fixa qual lint, framework de teste ou comando rodar.
Se uma etapa não existir no repositório (ex.: sem mutação configurada), registre isso no comentário do Ticket e siga.

## Heurísticas

- Cada Ticket = código integrável, revisável pelo humano.
- Fatia grande → fecha **criando** Tickets de continuação; paralelo ok.
- Review interno **não** substitui um Ticket tipo `QA`.
- **Como** implementar (ferramentas, desenho do teste, review) é decisão do agente.

## Saídas

Código + testes da fatia; pipeline de validação verde; achados de review tratados ou registrados; Evidências textuais de que o código passou, inclusive com descrição sumária do que foi implementado.

## Encerramento

Mova o **Ticket** para `AWAITING`:
`issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…"`.

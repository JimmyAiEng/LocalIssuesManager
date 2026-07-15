---
name: issue-qualification
description: >-
  Qualificação de Issue: ao reivindicar uma Issue SEM Tickets, qualificar tags,
  explorar o contexto, registrar o Artefato e criar o 1º Ticket. Use quando
  `next` devolve {issue, ticket:null} (decomposição).
---

# issue-qualification (camada 1)

Acionada quando o agente reivindica uma **Issue sem Tickets** para decompor —
`next` devolveu `{ issue, ticket: null }`.

Só **orienta**: usa os comandos já existentes, sem automação nova.

## Objetivo

Entender a intenção da Issue e preparar a decomposição, deixando a Issue pronta
para a primeira fase com contexto persistido em um **Artefato** Markdown.

## Passos

1. **Qualificar as tags** da Issue via `issues tag --id <issueId> --complexity <…> --human-need <…> --risk <…>`.
2. **Explorar** o codebase/contexto e entender a intenção real do problema.
3. **Redigir o Artefato** Markdown (exploração + critérios de aceite) em um `.md`
   e anexar: `issues artifact --id <issueId> --file <p.md>`.
   O Artefato fica no nível Issue e é compartilhado pelos Tickets (devolvido
   automaticamente por `next`/`get`).
4. **Definir os critérios de aceite** da Issue se faltarem.
5. **Criar o 1º Ticket** via `issues ticket create` (pipeline da Issue):
   - Issue `Feat` → Ticket `Planning`.
   - Issue `Fix` → Ticket `Design`.

Criar o 1º Ticket leva a Issue a `ON-GOING`.

## Encerramento

Handoff para a fila: o próximo `next` roteia o Ticket criado para a skill de
fase correspondente ao seu tipo.

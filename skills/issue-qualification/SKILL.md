---
name: issue-qualification
description: >-
  Qualificação de Issue: ao reivindicar uma Issue SEM Tickets, qualificar tags,
  explorar o contexto, registrar o Artefato e criar o 1º Ticket. Use quando
  `next` devolve {issue, ticket:null} (decomposição).
---

Ao receber uma Issue, você deve se esforçar para entender perfeitamente o contexto. Para isso, você deverá explorar o texto da Issue, o codebase e, se houver alguma lacuna ou falta de entendimento sobre qual é o objetivo da Issue, você deverá questionar ao usuário. 

Ao final, sua entrega é um Relatório, em Markdown, indicando, pelo menos:
1. Quais são os módulos/componentes/arquivos envolvidos na Issue
2. Quais são os critérios de aceite da Issue (caso já não tenha sido especificado por mim)
3. Quais são as restrições observadas

## Orientação por tipo de Issue

Cada Issue possui um tipo, com um escopo delimitado: 

- **Fix**: corrigir um comportamento defeituoso.
  Para adicionar contexto, deve-se reproduzir o bug e deve-se incluir testes que protejam contra a repetição do bug.
  A conclusão da Issue depende de evidências (fotos/vídeos) do bug reproduzido e do teste final que comprova a correção.
- **Feat**: entregar uma capacidade nova.
  Alinhe intenção e requisitos, fatie em Tickets integráveis e mantenha o escopo no que foi pedido (YAGNI).
- **Research**: reduzir incerteza.
  Formule as perguntas, investigue e registre achados/decisões para embasar o trabalho seguinte.
- **Refactor**: melhorar a estrutura sem mudar o comportamento.
  Preserve a semântica observável e apoie-se em testes para garantir a equivalência.

## Passos

1. **Qualificar as tags** da Issue via `issues tag --id <issueId> --complexity <…> --human-need <…> --risk <…>`, caso já não tenha sido qualificada.
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

Handoff para a fila: o próximo `next` roteia o Ticket criado para a skill de fase correspondente ao seu tipo.

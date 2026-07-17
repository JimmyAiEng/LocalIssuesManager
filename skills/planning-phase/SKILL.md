---
name: planning-phase
description: >-
  Fase Planning do workflow: alinhar problema, requisitos e domínio, e pedir o
  gate G1. Use quando o Ticket claimado tem type=Planning.
---
Estude o problema/ideia do ticket, o repositóro do projeto e me entreviste ativamente sobre cada aspecto da Issue até nós termos um entendimento comum do que deve ser feito. Busque identificar os requisitos funcionais e não funcionais da Issue, e resolva os problemas por meio de 3 em 3 perguntas. Para cada pergunta, sugira uma resposta. 

Faça-me as perguntas a cada grupo de 3 perguntas, esperando o feedback de cada grupo de perguntas antes de continuar. Se um *fato* puder ser encontrado/respondido explorando o codebase ou o texto da Issue, explore-o ao invés de me perguntar. As decisões de requisitos funcionais, contudo, são minhas. 

**Heurísticas**:
- Escopo grande demais para uma sessão → **criar** Tickets de continuação.
- Preferir fatias revisáveis pelo humano.
- O tipo do Ticket é imutável; avanço de fase = **novo Ticket** do tipo seguinte.
- **Como** planejar (pesquisa, glossário, ADRs, etc.) é decisão do agente.

**Saídas**:
Seu objetivo é entregar um conjunto de requisitos com critérios de aceitação verificável e que reflitam realmente o que o usuário quer. 
Foque nos requisitos funcionais, descritos em termos do usuário/domínio, não da solução. A entrega envolve: Problema e requisitos registrados na Issue, prontos para o humano decidir G1. 

Nunca entregue o Ticket enquanto não tiver a convicção de que o usuário irá aceitar e, se a Issue for grande, sugira a mim (antes de mover o Ticket) a divisão da Issue em duas ou mais Issues. 

**Encerramento**
Ao final, mova o **Ticket** para `AWAITING` ou para `CLOSED`:
`issues ticket status --issue <id> --id <tid> --agent <ia> --status [AWAITING|CLOSED] --comment "…"`.

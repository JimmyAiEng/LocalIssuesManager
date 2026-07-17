---
name: design-phase
description: >-
  Fase Design do workflow: explorar desenho/prototipar se preciso, congelar a
  spec, fatiar Tickets independentes e pedir o gate G2. Use quando o Ticket
  claimado tem type=Design.
---

Seu objetivo é congelar a spec e fatiar o trabalho em Tickets **independentes**.
Gate **G2**: humano aceita → fecha Design → abre Implement.


## Heurísticas

- **Explorar desenho** (opcional): só se os requisitos não bastarem para especificar; apresente opções + trade-offs e peça o gate de **direção** (humano escolhe) antes da spec.
- **Prototipar** (opcional): artefato **descartável** em worktree, antes e/ou depois do gate de direção; não vira produto.
- Heurística do diagrama (**Risk, Human Requirement, Complexity**): quanto maior o risco/complexidade ou a necessidade de humano, mais alinhamento (Design Alignment) antes de congelar a spec.
- Se os requisitos bastam, vá direto para spec + fatiamento.
- Fatie em **Units of Work** pequenas: cada Ticket `Implement` deve entregar uma fatia funcional/integrável com testes e review interno (review ≠ QA).
- Tickets fatiados são independentes, sem grafo de dependência obrigatória; paralelo ok.
- **Como** desenhar e especificar é decisão do agente.

## Entrega da spec (pacote de design)

A spec é entregue como **pacote de design do Ticket** (não mais só `issues artifact`):

- `issues design doc --issue <id> --ticket <tid> --file <design.md>` — grava o `design.md` do Ticket (vazio é rejeitado).
- `issues design add --issue <id> --ticket <tid> --kind <class|component|package|activity|state|deployment> --file <d.puml>` — adiciona um diagrama PlantUML.
A sintaxe é validada fail-fast e o kind deve corresponder ao tipo do diagrama; regravar o mesmo kind substitui.
- `issues get DESIGN --id <issueId>` — consulta o pacote agregado com `validation.ready_for_awaiting` e os erros do gate.

## Saídas

Spec pronta para aceite; Tickets Implement (e outros se preciso) criados via `issues ticket create`.

## Encerramento

Mova o **Ticket** para `AWAITING`:
`issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…"`.

**Regra do gate**: a transição para `AWAITING` é **bloqueada** sem `design.md` não vazio + ≥1 diagrama válido.
Em falha o comando sai com exit 1 e JSON `{"errors":[…]}` no stderr, listando todas as pendências; o Ticket permanece no status atual.

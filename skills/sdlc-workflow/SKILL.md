---
name: sdlc-workflow
description: >-
  SDLC de novo desenvolvimento com issues-local: estágios, gates, paralelismo,
  Review≠QA e progressive disclosure de skills. Use ao claimar ou trabalhar
  qualquer Issue de novo desenvolvimento, antes da skill de fase.
---

# sdlc-workflow (camada 0)

Mapa global do workflow. **Não** executa a fase — só orienta o processo.  
Válido em **qualquer projeto** que use este pack + issues-local.

## Modelo: Issue agregado + Tickets

- **Issue** é um **agregado tipado** (tipo `Fix` · `Feat` · `Research` · `Refactor`): nasce de uma ideia/problema e é resolvida por um ou mais **Tickets**.
- **Ticket** é uma **fatia tipada** da solução (`TicketType`: `Planning` · `Design` · `Implement` · `QA` · `Deploy`); o **tipo do Ticket** carrega a fase SDLC e roteia a skill.
- Uma Issue `CLAIMED` é **decomposta** em Tickets; ao criar o **1º** Ticket ela vai a `ON-GOING`.
- A Issue só avança `ON-GOING → AWAITING` quando **todos** os seus Tickets estão `CLOSED`.
- **Destrava automática:** ao fechar o **último** Ticket de uma Issue `ON-GOING`, o sistema injeta um Ticket `Confirmation` `OPEN`. Ele reabre a Issue na fila para o agente confirmar a resolução (→ `AWAITING`) ou criar os Tickets que faltam. Sem ele, a Issue ficaria presa em `ON-GOING` sem Tickets `OPEN`. Fechar o próprio `Confirmation` não gera outro. Roteia para `confirmation-phase`.
- Fila `next`: prioriza o Ticket `OPEN` mais antigo (FIFO) de Issues `ON-GOING`; se não houver, reivindica a Issue `OPEN` mais antiga para decompor. Retorno: `{ issue, ticket? }`.

## Caminho feliz

**Obrigatório:** Planning → Spec (Design) → Implement → QA → Deploy (tipos de Ticket).

**Opcionais** (heurística na skill de fase): Explorar desenho · Prototipar em worktree.

```text
P Planning ──G1──► [E explorar?] ──► [Proto?] ──► S Spec ──G2──► I Implement* ──► Q QA ──G3──► D Deploy ──G4──► fim
```

`*` Implement = um ou mais Tickets independentes (paralelo ok).

## Estágios ↔ tipo do Ticket

| Estágio | Tipo do Ticket | Obrigatório? |
|---|---|---|
| Planning (problema, RF/RNF, domínio) | `Planning` | sim |
| Explorar desenho / Prototipar | `Design` | não |
| Especificar + fatiar Tickets | `Design` | sim |
| Implementar (TDD + review interno) | `Implement` | sim |
| QA multi-perspectiva | `QA` | sim |
| Deploy / PR / go-no-go | `Deploy` | sim |

Não há tipo `Maintenance`: manutenção vira Issue de tipo `Fix`/`Refactor`.

## Gates humanos

| Gate | Após | Efeito |
|---|---|---|
| G1 | Planning | Fecha Planning → abre Design |
| Direção | E (se houve) | Humano escolhe opção antes de Spec |
| G2 | Spec | Fecha Design → abre Implement |
| Fatia | cada Implement | Aceita fatia ou pede continuação |
| G3 | QA | Aprova → Deploy; reprova → novos Tickets Implement |
| G4 | Deploy | Go / no-go de merge |

Retrabalho: `decide OPEN` ou fecha e cria Issue nova. Não há reopen de `CLOSED`.

## Independência e paralelismo

- Tickets **não** têm dependência obrigatória de ordem/claim (ordem é convenção, não regra).
- Paralelo entre Tickets (mesma Issue ou Issues distintas) é permitido quando fizer sentido.
- Fatia grande → o Ticket fecha e novos Tickets são **criados** como continuações; não bloqueia a fila.

## Review ≠ QA

- **Review interno** roda dentro de um Ticket `Implement`; não substitui QA.
- **QA** é um Ticket tipo `QA`; outro harness/modelo é recomendado, não obrigatório.

## Progressive disclosure (obrigatório)

```text
AGENTS.md
  └─ sdlc-workflow                (camada 0 — este arquivo; sempre)
        └─ <tipo-do-ticket>-phase (camada 1 — só o tipo do Ticket claimado)
```

1. Já está em camada 0.
2. Tipo do Ticket → skill `*-phase` (tabela no `AGENTS.md` do projeto).
3. A skill de fase diz o que a fase entrega e como fechá-la; o **como** executar é decisão do agente.
4. Não carregue skills de outras fases neste claim.

## Issues-local

Sintaxe e ciclo de vida dos comandos: tabela do `AGENTS.md` (fonte única) ou `issues --help`.

## Critério de conclusão

Agente sabe: Issue agregado + Tickets, fila com prioridade `ON-GOING`, caminho feliz, gates, independência, Review≠QA, e o próximo passo é a skill de fase do tipo do Ticket.

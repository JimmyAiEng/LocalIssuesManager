---
name: sdlc-workflow
description: >-
  SDLC de desenvolvimento com issues-local: modelo Issue+Ticket, estágios,
  gates humanos, paralelismo e progressive disclosure das skills de fase.
  Use ao reivindicar ou trabalhar qualquer unidade devolvida por `issues next`.
---

# sdlc-workflow (camada 0)

**Não** executa nenhuma fase — só orienta o processo e roteia a skill de fase.
Válido em **qualquer projeto** que use este pack + o CLI `issues` do issues-local.

## Modelo: Issue agregado + Tickets

- **Issue** é um **agregado tipado** (`Fix` · `Feat` · `Research` · `Refactor`): nasce de uma ideia/problema e é resolvida por um ou mais **Tickets**.
- **Ticket** é uma **fatia tipada** da solução (`Planning` · `Design` · `Implement` · `QA` · `Deploy` · `Confirmation`); o **tipo do Ticket** carrega a fase SDLC e roteia a skill.
- Uma Issue `CLAIMED` deve ser **decomposta** em Tickets; ao criar o **1º** Ticket ela vai a `ON-GOING`.
- A Issue só avança `ON-GOING → AWAITING` quando **todos** os seus Tickets estão `CLOSED`.
- **Destrava automática:** ao fechar o **último** Ticket de uma Issue `ON-GOING`, o sistema injeta um Ticket `Confirmation` `OPEN` para alguém confirmar a resolução ou criar os Tickets que faltam.
- Fila `next`: prioriza o Ticket `OPEN` mais antigo (FIFO) de Issues `ON-GOING`; se não houver, reivindica a Issue `OPEN` mais antiga para decompor.

## O loop do agente

A cada rodada, rode `issues next --prompt --project <p> --agent <ia>` para reivindicar a próxima unidade.
Execute **só** a fase da unidade reivindicada, encerre o Ticket e repita.
Nem toda Issue precisa de todas as fases; fases podem ter Tickets em paralelo ou em sequência.

## Caminho feliz (diagrama)

```text
Qualificação ─► Planning ──G1──► Design ──G2──► Implement* ─► QA (Quality Review) ──G3──► Deploy (PR) ──G4──► Confirmation ─► fim
```

`*` Implement = uma ou mais **Units of Work** independentes (paralelo ok), cada uma um Ticket.

| Estágio (diagrama) | Tipo do Ticket | Skill |
|---|---|---|
| Issue Qualification and Ticket Generation | Issue sem Ticket | `issue-qualification` |
| Planner Agent (Problem Alignment, requisitos + AC) | `Planning` | `planning-phase` |
| Design Agent (Design Alignment, spec, Design Validation) | `Design` | `design-phase` |
| Unit of Work (Test Coding → Coding → checks → review) | `Implement` | `implement-phase` |
| Quality Review (conjunto entregue) | `QA` | `qa-phase` |
| Merge & PR → análise estática → PR Analysis | `Deploy` | `deployment-phase` |
| Confirmação da resolução (gerado pelo sistema) | `Confirmation` | `confirmation-phase` |

As **validações** de cada estágio (gates de artefato, pipeline de checks, critérios) estão descritas na skill da própria fase — não aqui.

## Gates humanos

| Gate | Após | Efeito |
|---|---|---|
| G1 | Planning | Confirma requisitos/intenção; fecha Planning → abre Design |
| Direção | Exploração de desenho (se houve) | Humano escolhe a opção antes da spec |
| G2 | Design | Confirma a spec; fecha Design → abre Implement |
| Fatia | cada Implement | Aceita a fatia ou pede continuação |
| G3 | QA | Aprova → Deploy; reprova → novos Tickets Implement |
| G4 | Deploy | Go/no-go do merge (Code Review humano do PR) |

Gates são decisões humanas: **pare e peça**, não avance sozinho.
Encerre cada fase movendo o Ticket para `AWAITING` (use `--last` no último; a flag é sticky e dispara o `Confirmation` quando o Ticket fechar).
Em Issue `AFK` a IA pode fechar (`CLOSED`) direto; em `HITL` o Ticket vai a `AWAITING` e o humano decide.
Retrabalho: `decide OPEN` ou fecha e cria Ticket/Issue nova; não há reopen de `CLOSED`.

## Progressive disclosure (obrigatório)

1. Você está na camada 0 (este arquivo) — carregue-o em todo claim.
2. `next` devolveu **Issue sem Ticket** → leia `issue-qualification`.
3. `next` devolveu **Ticket** → leia a skill da linha correspondente ao tipo na tabela acima.
4. A skill de fase diz o que a fase entrega, suas validações e como fechá-la; o **como** executar é decisão do agente.
5. **Não** carregue skills de outras fases neste claim.

## Independência e paralelismo

- Tickets não têm dependência obrigatória de ordem/claim (ordem é convenção, não regra).
- Paralelo entre Tickets (mesma Issue ou Issues distintas) é permitido quando fizer sentido.
- Fatia grande → o Ticket fecha e novos Tickets são **criados** como continuações; não bloqueia a fila.
- **Review ≠ QA**: o review interno roda dentro de um Ticket `Implement`; QA valida o conjunto em Ticket próprio.

## Comandos (issues-local)

```text
issues next --prompt --project <p> --agent <ia>      # reivindica a próxima unidade (o loop)
issues get --id <id> | issues list [--status --project --type --title]
issues comment --id <id> --comment <t> [--attach <arquivo>]
issues tag --id <id> [--complexity BAIXA|MEDIA|ALTA] [--risk BAIXO|MEDIO|ALTO] [--human-need HITL|AFK]
issues artifact --id <id> --file <a.md>              # grava/substitui o Artefato .md da Issue
issues ticket create --issue <id> --type <T> --objective <o> --task <t> --acceptance-criteria <c>
                     [--depends-on a,b] [--references <r>] [--human-need HITL|AFK] [--artifact-file <a.md>]
issues ticket claim --issue <id> --id <tid> --agent <ia>
issues ticket status --issue <id> --id <tid> --agent <ia> --status <S> --comment <t> [--last]
issues ticket get|list|comment|tag|artifact --issue <id> [--id <tid>] ...
issues worktree add|remove --id <id>                 # worktree git isolada da Issue
```

`HITL` = human in the loop (humano necessário para concluir).
`AFK` = away from keyboard (a IA pode fechar se entender que o trabalho foi concluído).
Detalhes de sintaxe: `issues --help`.

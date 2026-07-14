# AGENTS.md — pack de discovery (novo desenvolvimento)

**Entregável portátil.** Este arquivo + as skills do pack formam o progressive disclosure do workflow de novo desenvolvimento. Destino: **qualquer projeto** e os harnesses `cursor` · `claude-code` · `codex` · `pi`.

As skills vivem no diretório de skills do harness (padrão do pack: `.agents/skills/<nome>/SKILL.md`). Sempre que este arquivo citar uma skill pelo nome, obtenha-a nesse diretório.

- Idioma: **pt-BR**
- Tracker: **issues-local** (CLI `issues`)
- Glossário do projeto consumidor (se existir): `CONTEXT.md`

---

## Sempre no contexto (camada 0)

Antes de trabalhar Issues de **novo desenvolvimento**, leia e siga a skill **`sdlc-workflow`**.

Camada 0: estágios, gates, paralelismo, Review≠QA. **Não** carregue o catálogo inteiro de skills de uma vez.

---

## Ao claimar trabalho (camada 1)

1. Claim via `issues next` (tabela abaixo); o retorno é `{ issue, ticket? }`.
2. **Se veio um `ticket`:** leia o **tipo do Ticket** e acione **somente** a skill de fase correspondente.
3. **Se veio só a `issue`** (sem `ticket`): a Issue foi reivindicada para **decompor**; crie os Tickets do agregado (`issues ticket create …`) conforme o tipo da Issue e os requisitos.

| Tipo do Ticket | Skill de fase |
|---|---|
| `Planning` | `planning-phase` |
| `Design` | `design-phase` |
| `Implement` | `implement-phase` |
| `QA` | `qa-phase` |
| `Deploy` | `deployment-phase` |

4. A skill de fase diz o que a fase entrega e como fechá-la; o **como** executar é decisão do agente.
5. Skills de outras fases ficam fora do contexto.

---

## Issues-local — contexto mínimo

Dados em `~/issues-manager` (ou `ISSUES_ROOT`). Saída JSON; use `--pretty` se precisar ler.

Issue:

| Comando | Quem | Efeito |
|---|---|---|
| `issues next --agent <ia> [--project <p>]` | IA | Claim da fila → `{ issue, ticket? }` |
| `issues get --id <uuid>` | qualquer | Detalhe da Issue **+ seus Tickets** |
| `issues list [--status|--project|--title|--type|--limit|--offset]` | qualquer | Listagem de Issues |
| `issues create --title --project --type <T> --problem [--artifacts] [--acceptance-criteria] (--human\|--agent <ia>)` | humano/IA | Nova Issue |
| `issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"` | IA | `ON-GOING` → `AWAITING` (exige **todos** os Tickets `CLOSED`) |
| `issues decide --id <uuid> --human --status OPEN\|CLOSED --comment "…" [--reason …]` | humano | Decisão em `AWAITING` |
| `issues reset --id <uuid> --human --comment "…"` | humano | `CLAIMED` → `OPEN` (não há reset de `ON-GOING`) |

Ticket (grupo `ticket`; um Ticket pertence a exatamente uma Issue):

| Comando | Quem | Efeito |
|---|---|---|
| `issues ticket create --issue <id> --type <T> --objective "…" --task "…" --acceptance-criteria "…" [--artifacts "…"] [--references "…"] (--human\|--agent <ia>)` | IA/humano | Novo Ticket `OPEN`; o **1º** move a Issue `CLAIMED` → `ON-GOING` |
| `issues ticket claim --issue <id> --id <tid> (--human\|--agent <ia>)` | IA/humano | `OPEN` → `CLAIMED` (IA normalmente via `next`) |
| `issues ticket status --issue <id> --id <tid> (--human\|--agent <ia>) --status AWAITING\|OPEN\|CLOSED --comment "…" [--reason …]` | owner | Transição a partir de `CLAIMED` |
| `issues ticket decide --issue <id> --id <tid> --human --status OPEN\|CLOSED --comment "…" [--reason …]` | humano | Decisão em `AWAITING` |
| `issues ticket get --issue <id> --id <tid>` | qualquer | Detalhe do Ticket |
| `issues ticket list --issue <id> [--type <T>] [--status <S>]` | qualquer | Tickets da Issue |

Agentes: `cursor` · `claude-code` · `codex` · `pi`  
Motivos: `obsoleto` · `duplicado` · `concluido` · `errado`  
Tipo da Issue (imutável): `Fix` · `Feat` · `Research` · `Refactor`  
Tipo do Ticket: `Planning` · `Design` · `Implement` · `QA` · `Deploy`

```text
humano: create (--human)
IA:     next --agent <ia>            → { issue, ticket? }
IA:     ticket create …             → Issue vai a ON-GOING (no 1º)
IA:     ticket status … AWAITING    → Ticket AWAITING
humano: ticket decide OPEN|CLOSED
IA:     status … AWAITING           → Issue AWAITING (todos Tickets CLOSED)
humano: decide OPEN|CLOSED
```

`next` prioriza Tickets `OPEN` de Issues `ON-GOING` (FIFO por Ticket); se não houver, reivindica a Issue `OPEN` mais antiga para decompor. Claim explícito de Ticket por `--id` via `ticket claim`.

---

## Regras rápidas

- Issue = agregado tipado; um ou mais **Tickets** tipados a resolvem; Tickets independentes, paralelo ok.
- A Issue só avança para `AWAITING` quando **todos** os seus Tickets estão `CLOSED`.
- Review interno (Ticket `Implement`) **≠** QA (Ticket `QA`).
- Manutenção / bugfix não é fase: vira Issue de tipo `Fix` ou `Refactor`, resolvida pelos Tickets adequados.
- O pack tem só camadas 0+1 (discovery): `sdlc-workflow` + uma skill por fase, todas no mesmo diretório de skills.
- Esta tabela de comandos é a **fonte única** da sintaxe da CLI no pack; em dúvida, rode `issues --help`.

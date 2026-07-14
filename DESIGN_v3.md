# DESIGN v3 — Issues + Tickets

| Campo | Valor |
|-------|--------|
| Documento | Especificação técnica do modelo Issue + Ticket |
| Versão | 3.0 (spec — Design) |
| Status | Em refinamento — aguardando gate G2 |
| Requisitos | `PRD_v3.md` |
| Origem | Issue `6bf9b312-25b8-471c-a161-de6beaaa36c7` — Design |
| Relação com DESIGN.md | Ainda não compilado; substitui o design v1 quando aprovado |
| Migração | **Fora de escopo** — store zerado; v3 assume base limpa |

---

## 1. Arquitetura (inalterada)

Camadas atuais preservadas: `domain` (entidades + regras), `app` (use cases), `cli.ts`, `web` (server + api + client).
Persistência: um arquivo JSON por **agregado Issue** em `~/issues-manager/projects/<projeto>/<pasta-status>/<id>.json`.
Tickets são persistidos **dentro** do JSON da Issue (fazem parte do agregado); não há storage próprio de Ticket.

---

## 2. Value objects (`src/domain/value_objects.ts`)

| Constante | Valores |
|-----------|---------|
| `AGENT_IDS` | `cursor` · `claude-code` · `codex` · `pi` (inalterado) |
| `CLOSED_REASONS` | `obsoleto` · `duplicado` · `concluido` · `errado` (inalterado; reutilizado por Ticket) |
| `ISSUE_TYPES` | `Fix` · `Feat` · `Research` · `Refactor` (**novo**; substitui `TAGS`) |
| `TICKET_TYPES` | `Planning` · `Design` · `Implement` · `QA` · `Deploy` (**novo**) |
| `ISSUE_STATUSES` | `OPEN` · `CLAIMED` · `ON-GOING` · `AWAITING` · `CLOSED` |
| `TICKET_STATUSES` | `OPEN` · `CLAIMED` · `AWAITING` · `CLOSED` |

Notas:
- O enum antigo `TAGS` (fase na Issue) é **removido**; `Maintenance` deixa de existir; `Deployment` vira `Deploy`.
- O tipo `Phase = { status; timestamp }` (histórico de status) do v1 fica **inalterado** — não há colisão de nomes com `TicketType`.
- Novos parsers `parseIssueType`, `parseTicketType`, `parseIssueStatus`, `parseTicketStatus` seguindo o `parseEnum` existente.

---

## 3. Entidades

### 3.1 Issue (raiz do agregado — `issue_entity.ts`)

Campos (deltas do v1 em **negrito**):

`id`, `title`, `project`, **`type: IssueType`** (antes `tag`), `problem`, `artifacts?`, `acceptance_criteria?`, `status: IssueStatus`, `owner: AgentId | null`, `closed_reason`, `claimed_at`, `created_at`, `status_changed_at`, `human_presence`, `thread: Thread[]`, `phases: Phase[]` (histórico de status, inalterado), **`tickets: Ticket[]`**.

`artifacts` e `acceptance_criteria` passam a ser **opcionais** (default `""`); só `title`, `project`, `type`, `problem` são obrigatórios na criação.

Métodos e invariantes:

| Método | Regra |
|--------|-------|
| `create(input, actor)` | `status=OPEN`, `tickets=[]`, `human_presence = actor==='human'` |
| `claim(agent)` | `OPEN → CLAIMED`; grava owner; sem thread |
| `addTicket(ticket)` | permitido em `CLAIMED` ou `ON-GOING`; o **primeiro** Ticket dispara `CLAIMED → ON-GOING` |
| `await(agent, comment)` | exige `ON-GOING` **e** todos os Tickets `CLOSED`; senão `DomainError`; `ON-GOING → AWAITING` |
| `decide(status, comment, reason?)` | humano; `AWAITING → OPEN\|CLOSED` |
| `reset(comment)` | humano; **só** `CLAIMED → OPEN` (não há reset de `ON-GOING`) |
| `closeByAgent(agent, …)` | mantém regra v1: só `OPEN` e sem `human_presence` |
| `closeByHuman(…)` | `OPEN → CLOSED` |

A IA **nunca** move a Issue para `OPEN`/`CLOSED` a partir de `CLAIMED`/`ON-GOING`/`AWAITING`.

### 3.2 Ticket (entidade do agregado — `ticket_entity.ts`, novo)

Campos: `id`, `issue_id`, `objective`, `task`, `acceptance_criteria` (os três obrigatórios), `type: TicketType`, `status: TicketStatus`, `owner: Actor | null`, `closed_reason`, `artifacts?`, `references?`, `created_at`, `status_changed_at`, `thread: Thread[]`.

`owner` é `Actor` (IA **ou** humano — Q6). `references` é texto livre citando artefatos de outros Tickets da mesma Issue.

| Método | Regra |
|--------|-------|
| `create(input)` | `status=OPEN` |
| `claim(actor)` | `OPEN → CLAIMED`; grava owner (IA ou humano) |
| `changeStatus(actor, status, comment, reason?)` | só o **owner**; `CLAIMED → AWAITING\|OPEN\|CLOSED`; `CLOSED` exige `reason` e comentário |
| `decide(status, comment, reason?)` | humano; `AWAITING → OPEN\|CLOSED` |

Todo Ticket `CLOSED` exige `closed_reason`; um Ticket fechado como `concluido` é o que conta para liberar `await` da Issue.

---

## 4. Transições

### 4.1 Issue

```text
OPEN ─claim(IA)→ CLAIMED ─addTicket(1º)→ ON-GOING ─await(todos Tickets CLOSED)→ AWAITING ─decide(humano)→ CLOSED | OPEN
                    │
                    └── reset(humano) ──→ OPEN
OPEN ─closeByAgent(sem humano) / closeByHuman→ CLOSED
```

### 4.2 Ticket

```text
OPEN ─claim(IA|humano)→ CLAIMED ─changeStatus(owner)→ AWAITING | OPEN | CLOSED
                                        AWAITING ─decide(humano)→ CLOSED | OPEN
```

---

## 5. Fila e persistência

### 5.1 `queue_repository.ts`

- `FOLDERS` ganha `"ON-GOING": "ongoing"`.
- `save`/`load`/`list` inalterados na forma (agregado inteiro por arquivo); o guard de _stale save_ passa a considerar mudanças em Tickets (o `history`/`status_changed_at` da Issue cobre transições de Issue; para Ticket, o save da Issue reescreve o agregado — o guard compara o `history` da Issue como hoje).
- `oldestOpen(project?)` mantém a seleção de Issue para decompor.
- **Novo** `oldestOpenTicket(project?)`: varre Issues `ON-GOING`, coleta Tickets `OPEN`, ordena por `created_at` do Ticket (desempate por id) e devolve `{ issue, ticket }` mais antigo — **Q3**.

### 5.2 `NextIssueUseCase`

```text
next(agent, project?):
  alvo = oldestOpenTicket(project)
  se alvo:  alvo.ticket.claim(agent); save(alvo.issue); retorna { issue, ticket }
  senão:    issue = oldestOpen(project); se issue: issue.claim(agent); save; retorna { issue }
  senão:    null
```

Prioriza terminar Tickets de Issues `ON-GOING` antes de abrir nova Issue.

---

## 6. Superfície de comandos (Formato A)

### 6.1 CLI (`cli.ts`)

Issue:
- `issues create --title --project --type --problem [--artifacts] [--acceptance-criteria] (--human|--agent <ia>)`
- `issues next --agent <ia> [--project <p>]` → `{ issue, ticket? }`
- `issues status --id <id> --agent <ia> --status AWAITING --comment "…"` (valida todos Tickets `CLOSED`)
- `issues decide --id <id> --human --status OPEN|CLOSED --comment "…" [--reason …]`
- `issues reset --id <id> --human --comment "…"`
- `issues get --id <id>` (Issue + Tickets)
- `issues list [--status|--project|--title|--type|--limit|--offset]`

Ticket (novo grupo `ticket`):
- `issues ticket create --issue <id> --type <T> --objective "…" --task "…" --acceptance-criteria "…" [--artifacts "…"] [--references "…"] (--human|--agent <ia>)`
- `issues ticket claim --issue <id> --id <tid> (--human|--agent <ia>)` (claim explícito; IA normalmente via `next`)
- `issues ticket status --issue <id> --id <tid> (--human|--agent <ia>) --status AWAITING|OPEN|CLOSED --comment "…" [--reason …]`
- `issues ticket decide --issue <id> --id <tid> --human --status OPEN|CLOSED --comment "…" [--reason …]`
- `issues ticket get --issue <id> --id <tid>`
- `issues ticket list --issue <id> [--type <T>] [--status <S>]`

### 6.2 Web (`web/api.ts` + client)

- `GET /:id` já devolve a Issue com `tickets`.
- **Novos**: `POST /:id/tickets` (criar), `POST /:id/tickets/:tid/status`, `POST /:id/tickets/:tid/decision`.
- `GET /?type=` adiciona filtro por tipo.
- Client: a tela de detalhe da Issue passa a renderizar os Tickets (tipo, status, thread) e permitir criar/transicionar Ticket.

---

## 7. Impacto no pack de skills e docs

- `AGENTS.md`: a tabela de roteamento passa de **TAG da Issue → skill** para **tipo do Ticket → skill**; a tabela de comandos ganha o grupo `ticket` e o novo retorno de `next`.
- `sdlc-workflow`: Issue = agregado tipado; Ticket = fatia tipada (`TicketType`); fila com prioridade `ON-GOING`; Review≠QA mantido.
- Skills `*-phase`: acionadas pelo **tipo do Ticket**; conteúdo praticamente igual; `deployment-phase` referencia o tipo `Deploy`; remove menções a `Maintenance`.
- `CONTEXT.md`: `Ticket` vira termo de primeira classe (sai do _Avoid_); `TAG` redefinido como **tipo** da Issue; o tipo de trabalho (Planning…Deploy) passa a ser propriedade do Ticket; acrescenta `ON-GOING`, `Ticket`, `Objective/Task`.

---

## 8. Fatiamento — Issues de Implement (independentes)

| # | Issue (Implement) | Entrega |
|---|-------------------|---------|
| S1 | Domínio: enums + entidade Ticket + mudanças na Issue | `value_objects` (novos enums), `ticket_entity.ts`, `Issue` com `type`, `tickets`, `addTicket`, `await` com gate, `reset` restrito; testes unitários + mutation |
| S2 | Persistência + seleção de fila | pasta `ongoing`, `oldestOpenTicket`, save/guard do agregado com Tickets; testes |
| S3 | Use cases + CLI (Formato A) | `NextIssueUseCase` ticket-first, use cases de Ticket (create/claim/status/decide/get/list), `issues create --type`, wiring no `cli.ts`; testes |
| S4 | Web (api + client) | rotas de Ticket, filtro `--type`, render de Tickets no detalhe; testes de client |
| S5 | Pack de skills + docs | `AGENTS.md`, `sdlc-workflow`, `*-phase`, `CONTEXT.md` reescritos para roteamento por tipo do Ticket; remove `Maintenance` |

Sem grafo de dependência obrigatória; ordem natural S1→S5, mas cada fatia é revisável de forma independente.
S1 é a fundação; S2–S4 assentam sobre ela; S5 é documental e pode correr em paralelo.

---

## 9. Critérios de aceite deste Design (G2)

1. Entidades, enums, transições e invariantes (Issue + Ticket) conferem com o PRD_v3.
2. Superfície de comandos (Formato A) e o comportamento do `next` unificado estão corretos.
3. Impacto no pack de skills (roteamento por tipo do Ticket) está aceitável.
4. O fatiamento S1–S5 é adequado para abrir as Issues de Implement no gate.

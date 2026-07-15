# Design — Issues Locais (CLI + web + pack)

| Campo | Valor |
|-------|--------|
| Versão | 3.1 (compilado) |
| Status | Vigente |
| Fontes compiladas | `DESIGN.md` (v1) · modelo v3 Issue+Ticket |
| Requisitos | `PRD.md` |
| Migração de store | Fora de escopo (base limpa no rollout v3) |

---

## 1. Arquitetura

Camadas:

```text
cli.ts / web/*  →  app/*_use_case  →  domain (Issue, Ticket, Queue, Loop, Harness)
```

| Camada | Pode importar | Não pode |
|--------|---------------|----------|
| `domain/*` (exceto Queue/loop FS) | outros `domain/*` | `app/`, `cli` |
| `queue_repository.ts` / stores FS | `domain/*` + FS | `app/`, `cli` |
| `app/*` | `domain/*` | `cli` |
| `cli.ts` | `app/*`, `web/server` no comando `web` | `domain/*` direto |
| `web/*` | só `app/*` + HTTP/browser | `domain/*`, persistência direta |

### Layout do repositório (essencial)

```text
WorkflowDev/
├── CONTEXT.md · PRD.md · DESIGN.md · AGENTS.md
├── skills/                    ← pack source (SKILL.md)
├── .agents/skills → skills/   ← discovery (dogfood; ver skills/INSTALL.md)
├── bin/issues
└── src/
    ├── domain/     issue_entity · ticket_entity · value_objects · queue · loop · harness …
    ├── app/        *_use_case.ts (incl. init_pack, worktree, harness, loop)
    ├── cli.ts
    └── web/        server · api · client/
```

### Disco (runtime)

```text
~/issues-manager/projects/<project>/{open,claimed,ongoing,awaiting,closed}/<id>.json
~/issues-manager/loop/{harnesses,loops}.json · <loop>.log
```

Um JSON por **agregado Issue**; Tickets vão **dentro** do JSON. Transição de Issue = `mv` entre pastas.

---

## 2. Value objects

| Constante | Valores |
|-----------|---------|
| `AGENT_IDS` | `cursor` · `claude-code` · `codex` · `pi` |
| `CLOSED_REASONS` | `obsoleto` · `duplicado` · `concluido` · `errado` |
| `ISSUE_TYPES` | `Fix` · `Feat` · `Research` · `Refactor` |
| `TICKET_TYPES` | `Planning` · `Design` · `Implement` · `QA` · `Deploy` · `Confirmation` |
| `ISSUE_STATUSES` | `OPEN` · `CLAIMED` · `ON-GOING` · `AWAITING` · `CLOSED` |
| `TICKET_STATUSES` | `OPEN` · `CLAIMED` · `AWAITING` · `CLOSED` |
| Tags | `complexity` BAIXA\|MEDIA\|ALTA · `human_need` HITL\|AFK · `risk` BAIXO\|MEDIO\|ALTO |

Enums antigos `TAGS` (fase na Issue) e `Maintenance` **removidos**. `Deployment` (Issue) → tipo Ticket `Deploy`.

---

## 3. Entidades

### 3.1 Issue (`issue_entity.ts`)

Campos: `id`, `title`, `project`, `type`, `problem`, `artifacts?`, `acceptance_criteria?`, `status`, `owner`, `closed_reason`, timestamps, `human_presence`, `thread`, `phases`, `tickets[]`, `tags`, `worktree?`.

| Método | Regra |
|--------|-------|
| `create` | `OPEN`, `tickets=[]` |
| `claim` | `OPEN → CLAIMED`; sem thread |
| `addTicket` | `CLAIMED`/`ON-GOING`; 1º → `ON-GOING`; rejeita create de `Confirmation` |
| `await` | `ON-GOING` + todos Tickets `CLOSED` → `AWAITING` |
| `decide` | humano; `AWAITING → OPEN\|CLOSED` |
| `reset` | humano; só `CLAIMED → OPEN` |
| `closeByAgent` / `closeByHuman` | regras `human_presence` |
| `tag` / `tagTicket` | merge tags; `assertTicketAutonomy` |
| `#confirmWhenDone` | injeta Ticket `Confirmation` ao fechar o último Ticket não-Confirmation |

### 3.2 Ticket (`ticket_entity.ts`)

Campos: `id`, `issue_id`, `objective`, `task`, `acceptance_criteria`, `type`, `status`, `owner` (Actor), `closed_reason`, `artifacts?`, `references?`, `depends_on[]`, timestamps, `thread`, `tags`.

| Método | Regra |
|--------|-------|
| `create` | `OPEN` |
| `claim` | `OPEN → CLAIMED` (IA ou humano) |
| `changeStatus` | owner; `CLAIMED → AWAITING\|OPEN\|CLOSED` |
| `decide` | humano; `AWAITING → OPEN\|CLOSED` |

---

## 4. Fila e persistência

- `Queue.oldestOpenTicket(project?)` — Tickets `OPEN` em Issues `ON-GOING`, FIFO por `created_at`, respeitando `depends_on`.
- `NextIssueUseCase`: Ticket-first; senão `oldestOpen` da Issue.
- Stale save: revisão/`history` do agregado; mutação de Ticket reescreve o JSON da Issue.

---

## 5. Superfície de comandos

### CLI (Formato A)

Issue: `create` · `next` → `{ issue, ticket? }` · `status` · `decide` · `reset` · `get` · `list` · `comment` · `tag`

Ticket: `ticket create|claim|comment|tag|status|decide|get|list`

Infra: `harness` · `loop` · `worktree` · `init` · `web`

`init --dogfood` / `npm run skills:link`: liga `skills/` → paths de discovery dos harnesses (pack source).

### Web

- Quadro por Status (incl. `ON-GOING`); filtro tipo/projeto/título.
- Detalhe: Tickets, tags editor, ações humanas, criar Ticket.
- Rotas: Issues CRUD de fluxo humano + Tickets create/status/decision/tags; conflito → 409.

---

## 6. Pack de skills

| Path | Papel |
|------|-------|
| `skills/<nome>/SKILL.md` | Source publicado no npm |
| `.agents/skills/` | Cópia canônica no consumidor (`init`) |
| `.cursor/.claude/.codex/.pi/skills` | Symlinks → `.agents/skills` |

Roteamento: tipo do Ticket → `*-phase`. Detalhe: `skills/INSTALL.md`.

---

## 7. Infra opcional (fora do núcleo de domínio de Tickets)

| Peça | Design |
|------|--------|
| **Worktree** | CLI `worktree add/remove`; field na Issue; sandbox git por Issue; loop ainda não força cwd |
| **Harness** | `{ name, agent, command com {prompt} }` |
| **Loop** | Drain com concurrency; spawn no host; prompt força AGENTS + fase; agendamento SO |
| **dpi / Docker** | Tooling pessoal fora deste repo; não faz parte do domínio |

---

## 8. Fitness functions

| ID | Regra |
|----|-------|
| FF-01 | `domain/` (exceto FS em repositórios) não importa `app/`/`cli` |
| FF-02 | Adaptadores importam só `app/` |
| FF-03 | Arquivo ≤ 300 linhas |
| FF-04 | Função ≤ 20 linhas |
| FF-05 | Zero Ports desnecessários |
| FF-06 | Módulos profundos (API pública estreita) |

---

## 9. Critérios de aceite do design

1. Enums, entidades e transições conferem com `PRD.md`.
2. `next` unificado e grupo `ticket` implementados.
3. Web consome os mesmos use cases; Tags e Tickets no detalhe.
4. Pack instalável com discovery nos quatro harnesses.
5. Confirmation e `depends-on` documentados e implementados no domínio.

---

## 10. Histórico de fatiamento v3 (Implement — referência)

| Fatia | Entrega |
|-------|---------|
| S1 | Domínio Issue+Ticket + enums |
| S2 | Persistência `ongoing` + `oldestOpenTicket` |
| S3 | Use cases + CLI |
| S4 | Web Tickets |
| S5 | Pack/docs roteamento por Ticket |

Extensões posteriores: tags/HITL, depends-on, Confirmation, loop/harness/worktree, init wiring multi-harness.

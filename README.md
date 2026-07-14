# WorkflowDev — Issues Locais

Gerenciador local de Issues via CLI, para humanos e agentes (`cursor`, `claude-code`, `codex`, `pi`). O trabalho humano fica em **planejar** e **validar**; as IAs **claimam** e entregam via fila FIFO.

Saída padrão: **JSON**. Use `--pretty` para JSON indentado.

---

## Instalação

Num projeto consumidor (pacote npm com CLI + pack de skills):

```bash
npm install @jimmypgomes/issues-local   # ou npm i -g / npx
npx issues init [--harness claude-code|cursor|codex|pi|all]
```

O `issues init` instala `AGENTS.md` + `.agents/skills/` e o wiring por harness (ver `skills/INSTALL.md`).

Neste repositório (desenvolvimento):

```bash
npm install
npm link          # opcional: coloca `issues` no PATH
./bin/issues <comando> [flags]
```

Dados ficam em `~/issues-manager` (ou no caminho de `ISSUES_ROOT`):

```text
~/issues-manager/projects/<projeto>/{open,claimed,awaiting,closed}/<id>.json
```

---

## Conceitos rápidos

| Status | Significado |
|--------|-------------|
| `OPEN` | Na fila, pronta para claim |
| `CLAIMED` | Travada por uma IA (`owner`) |
| `AWAITING` | IA terminou; espera decisão humana |
| `CLOSED` | Encerrada (não reabre) |

**Agentes:** `cursor` · `claude-code` · `codex` · `pi`  
**Tags (imutáveis):** `Planning` · `Design` · `Implement` · `QA` · `Deployment` · `Maintenance`  
**Motivos de fechamento:** `obsoleto` · `duplicado` · `concluido` · `errado`

`human_presence`: se a Issue foi criada ou tocada por humano, a IA **não** pode fechá-la sozinha a partir de `OPEN`.

---

## Referência de Comandos — Issues

| Comando | Função | Obrigatório | Opcional |
|---------|--------|-------------|----------|
| **create** | Criar Issue | `--title` `--project` `--type` `--problem` `--acceptance-criteria` + (`--human` \| `--agent`) | `--artifacts` |
| **next** | Claimar próxima OPEN (FIFO) | `--agent` | `--project` |
| **comment** | Adicionar comentário | `--id` + (`--human` \| `--agent`) | `--comment` `--attach` |
| **tag** | Adicionar tags | `--id` | `--complexity` `--human-need` `--risk` |
| **status** | Mudar status | `--id` `--status` `--comment` + (`--human` \| `--agent`) | `--reason` |
| **decide** | Decisão humana (AWAITING) | `--id` `--status` `--comment` `--human` | `--reason` |
| **reset** | Liberar claim (CLAIMED→OPEN) | `--id` `--comment` `--human` | — |
| **get** | Detalhe completo | `--id` | — |
| **list** | Listar Issues | — | `--status` `--project` `--title` `--type` `--limit` `--offset` |

### Exemplos — Issues

```bash
# Create
issues create --title "Implementar login" --project "app" --type Implement \
  --problem "Usuário não autentica" --acceptance-criteria "Email + senha" --human

# Workflow
issues next --agent codex --project app                    # Claimar
issues status --id <uuid> --agent codex --status AWAITING --comment "Pronto"
issues decide --id <uuid> --human --status CLOSED --comment "Aceito" --reason concluido

# Rejeitar
issues decide --id <uuid> --human --status OPEN --comment "Corrigir testes"

# Liberar travada
issues reset --id <uuid> --human --comment "IA travou"

# Consulta
issues get --id <uuid> --pretty
issues list --project app --status OPEN --pretty
```

---

## Referência de Comandos — Tickets

| Comando | Função | Obrigatório | Opcional |
|---------|--------|-------------|----------|
| **ticket create** | Criar Ticket (subtarefa de Issue) | `--issue` `--type` `--objective` `--task` `--acceptance-criteria` + (`--human` \| `--agent`) | `--artifacts` `--references` `--depends-on` `--human-need` |
| **ticket claim** | Claimar Ticket | `--issue` `--id` + (`--human` \| `--agent`) | — |
| **ticket comment** | Comentário em Ticket | `--issue` `--id` + (`--human` \| `--agent`) | `--comment` `--attach` |
| **ticket tag** | Tags em Ticket | `--issue` `--id` | `--complexity` `--human-need` `--risk` |
| **ticket status** | Mudar status Ticket | `--issue` `--id` `--status` `--comment` + (`--human` \| `--agent`) | `--reason` |
| **ticket decide** | Decisão em Ticket AWAITING | `--issue` `--id` `--status` `--comment` `--human` | `--reason` |
| **ticket get** | Detalhe Ticket | `--issue` `--id` | — |
| **ticket list** | Listar Tickets da Issue | `--issue` | `--type` `--status` |

---

## Referência de Comandos — Infraestrutura

**Harness** (conectar CLI a editores/agentes):

```bash
issues harness add --name codex --agent codex --command "codex <args>"
issues harness list
issues harness remove --name codex
```

**Worktree** (clonar repo para Issue):

```bash
issues worktree add --id <uuid> [--path <p>]
issues worktree remove --id <uuid>
```

**Loop** (automação recorrente):

```bash
issues loop add --name "daily-qa" --harness codex --interval "0 9 * * *" [--project <p>] [--concurrency <n>]
issues loop list
issues loop install --name "daily-qa" [--cron] [--now]
issues loop run --name "daily-qa"
issues loop remove --name "daily-qa"
```

**Web** (UI local):

```bash
issues web [--port <n>] [--no-open]
```

**Init** (scaffold projeto consumidor):

```bash
issues init [--harness claude-code|cursor|codex|pi|all] [--target <dir>] [--force]
```

---

## Regras de Validação

| Regra | Efeito |
|-------|--------|
| `--human` XOR `--agent` | Comandos que precisam de ator: escolha um, nunca ambos |
| `--limit`, `--offset`, `--concurrency` | Devem ser inteiros ≥ 0 |
| `--id` (UUID) | Identifica Issue ou Ticket |
| `--reason` (fechamento) | Valores: `obsoleto` \| `duplicado` \| `concluido` \| `errado` |
| `--status` (Issue) | Valores: `OPEN` \| `CLAIMED` \| `AWAITING` \| `CLOSED` |
| `--status` (Ticket) | Valores: `OPEN` \| `CLAIMED` \| `AWAITING` \| `CLOSED` |
| `--type` (Issue) | Valores: `Planning` \| `Design` \| `Implement` \| `QA` \| `Deployment` \| `Maintenance` |
| `--type` (Ticket) | Customizável por projeto |
| `--complexity`, `--human-need`, `--risk` | Tags opcionais; strings livres |
| `--depends-on` (Ticket) | CSV de UUIDs; bloqueia `next` até `AWAITING` ou `CLOSED` |
| `human_presence` | Se Issue criada/tocada por humano, IA não pode fechá-la de `OPEN` sozinha |

---

## Fluxo Típico

```
Humano:  create (--human)
  ↓
IA:      next (--agent …)                    → CLAIMED
  ↓
IA:      status … --status AWAITING          → AWAITING
  ↓
Humano:  decide --status OPEN (retrabalho)  → OPEN → IA: next de novo
   ou    decide --status CLOSED               → CLOSED
```

**Atalhos:**

- Claim travada → `reset --human`
- Issue errada em OPEN → `status --human --status CLOSED --reason …`
- Mudar fase SDLC → fechar Issue atual e **criar nova** com novo `--type`

---

## Fluxo típico

```text
humano: create (--human)
    ↓
IA:     next (--agent …)          → CLAIMED
    ↓
IA:     status … AWAITING         → AWAITING
    ↓
humano: decide OPEN  (retrabalho) → OPEN  → next de novo
   ou   decide CLOSED             → CLOSED
```

Atalhos:

- Claim preso → `reset --human`
- Issue errada ainda `OPEN` → `status --human --status CLOSED --reason …`
- Avançar de fase SDLC → fechar a Issue atual e **criar outra** com a nova tag (tag não muda)

---

## Variáveis de ambiente

| Variável | Efeito |
|----------|--------|
| `ISSUES_ROOT` | Raiz de persistência (default: `~/issues-manager`) |

---

## Desenvolvimento

```bash
npm test
npm run typecheck
npm run check:fitness
```

Documentação de produto e design: `PRD.md`, `DESIGN.md`, `CONTEXT.md`.

**Entregável — pack de agentes:** `AGENTS.md` + `skills/` (discovery do workflow de novo desenvolvimento). Portátil para qualquer projeto e harness; instalação em `skills/INSTALL.md`. Spec de origem: `docs/features/common-agent-workflow/`.

# WorkflowDev — Issues Locais

Gerenciador local de Issues via CLI, para humanos e agentes (`cursor`, `claude-code`, `codex`, `pi`).
O trabalho humano fica em **planejar** e **validar**; as IAs **claimam** e entregam via fila.

Saída padrão: **JSON**. Use `--pretty` para JSON indentado.

Modelo vigente: **Issue** (agregado tipado) + **Tickets** (fatias tipadas SDLC). Glossário: `CONTEXT.md`.

---

## Instalação

Num projeto consumidor (pacote npm com CLI + pack de skills):

```bash
npm install @jimmypgomes/issues-local   # ou npm i -g / npx
npx issues init [--harness claude-code|cursor|codex|pi|all]
```

O `issues init` garante o ponteiro `sdlc-workflow` no `AGENTS.md` (cria ou acrescenta), copia `.agents/skills/` e cria symlinks de discovery (`.cursor`, `.claude`, `.codex`, `.pi`). Detalhes: `skills/INSTALL.md`.

Neste repositório (desenvolvimento / pack source):

```bash
npm install
npm link          # opcional: coloca `issues` no PATH
npm run skills:link   # expõe skills/ nos paths que os harnesses leem
./bin/issues <comando> [flags]
```

Dados ficam em `~/issues-manager` (ou `ISSUES_ROOT`):

```text
~/issues-manager/projects/<projeto>/{open,claimed,on-going,awaiting,closed}/…
```

---

## Conceitos rápidos

### Issue (agregado)

| Campo | Valores |
|--------|-------------|
| Status | `OPEN` · `CLAIMED` · `ON-GOING` · `AWAITING` · `CLOSED` |
| Tipo (imutável) | `Fix` · `Feat` · `Research` · `Refactor` |

`ON-GOING`: Issues com Tickets criados. Só vai a `AWAITING` quando **todos** os Tickets estão `CLOSED`.

### Ticket (fatia SDLC)

| Campo | Valores |
|--------|-------------|
| Status | `OPEN` · `CLAIMED` · `AWAITING` · `CLOSED` (sem `ON-GOING`) |
| Tipo | `Planning` · `Design` · `Implement` · `QA` · `Deploy` · `Confirmation` (só sistema) |

### Outros

| Conceito | Valores / notas |
|--------|-------------|
| Agentes | `cursor` · `claude-code` · `codex` · `pi` |
| Motivos de fechamento | `obsoleto` · `duplicado` · `concluido` · `errado` |
| Tags | `complexity` · `human_need` (HITL/AFK) · `risk` |
| `human_presence` | Se a Issue foi tocada por humano, a IA não fecha a Issue sozinha |

---

## Referência de Comandos — Issues

| Comando | Função | Obrigatório | Opcional |
|---------|--------|-------------|----------|
| **create** | Criar Issue | `--title` `--project` `--type` `--problem` + (`--human` \| `--agent`) | `--artifacts` `--acceptance-criteria` |
| **next** | Claimar próximo trabalho | `--agent` | `--project` |
| **comment** | Adicionar comentário | `--id` + (`--human` \| `--agent`) | `--comment` `--attach` |
| **tag** | Tags | `--id` | `--complexity` `--human-need` `--risk` |
| **status** | Mudar status | `--id` `--status` `--comment` + (`--human` \| `--agent`) | `--reason` |
| **decide** | Decisão humana (AWAITING) | `--id` `--status` `--comment` `--human` | `--reason` |
| **reset** | Liberar claim (CLAIMED→OPEN) | `--id` `--comment` `--human` | — |
| **get** | Detalhe + Tickets | `--id` | — |
| **list** | Listar Issues | — | `--status` `--project` `--title` `--type` `--limit` `--offset` |

### Exemplos — Issues

```bash
# Create (tipo da Issue = intenção, não fase SDLC)
issues create --title "Login com e-mail" --project "app" --type Feat \
  --problem "Usuário não autentica" --acceptance-criteria "Email + senha" --human

# Workflow
issues next --agent codex --project app
issues status --id <uuid> --agent codex --status AWAITING --comment "Pronto"
issues decide --id <uuid> --human --status CLOSED --comment "Aceito" --reason concluido

# Consulta
issues get --id <uuid> --pretty
issues list --project app --status OPEN --pretty
```

`next` retorna `{ issue, ticket? }`: com `ticket` → trabalhar a fase; sem ticket → decompor a Issue em Tickets.

---

## Referência de Comandos — Tickets

| Comando | Função | Obrigatório | Opcional |
|---------|--------|-------------|----------|
| **ticket create** | Criar Ticket | `--issue` `--type` `--objective` `--task` `--acceptance-criteria` + (`--human` \| `--agent`) | `--artifacts` `--references` `--depends-on` `--human-need` |
| **ticket claim** | Claimar Ticket | `--issue` `--id` + (`--human` \| `--agent`) | — |
| **ticket comment** | Comentário | `--issue` `--id` + (`--human` \| `--agent`) | `--comment` `--attach` |
| **ticket tag** | Tags | `--issue` `--id` | `--complexity` `--human-need` `--risk` |
| **ticket status** | Mudar status | `--issue` `--id` `--status` `--comment` + (`--human` \| `--agent`) | `--reason` |
| **ticket decide** | Decisão AWAITING | `--issue` `--id` `--status` `--comment` `--human` | `--reason` |
| **ticket get** | Detalhe | `--issue` `--id` | — |
| **ticket list** | Listar | `--issue` | `--type` `--status` |

---

## Referência de Comandos — Infraestrutura

**Harness** (registrar runner para o loop):

```bash
issues harness add --name pi --agent pi --command 'pi -p {prompt} --no-session'
issues harness list
issues harness remove --name pi
```

**Worktree** (sandbox git por Issue; manual — o loop ainda não muda o cwd automaticamente):

```bash
issues worktree add --id <uuid> [--path <p>]
issues worktree remove --id <uuid>
```

**Loop** (dreno periódico da fila via SO — systemd/cron):

```bash
issues loop add --name "pi-dev" --harness pi --interval "1h" [--project <p>] [--concurrency <n>]
issues loop list
issues loop install --name "pi-dev" [--cron] [--now]
issues loop run --name "pi-dev"
issues loop remove --name "pi-dev"
```

Detalhes: `docs/loop.md`.

**Web** (UI local):

```bash
issues web [--port <n>] [--no-open]
```

**Init** (scaffold consumidor + links de skills):

```bash
issues init [--harness claude-code|cursor|codex|pi|all] [--target <dir>] [--force]
issues init --dogfood   # só no pack source: liga skills/ → paths dos harnesses
```

---

## Regras de Validação

| Regra | Efeito |
|-------|--------|
| `--human` XOR `--agent` | Comandos com ator: escolha um |
| `--limit`, `--offset`, `--concurrency` | Inteiros ≥ 0 |
| `--reason` (fechamento) | `obsoleto` \| `duplicado` \| `concluido` \| `errado` |
| `--status` (Issue) | `OPEN` \| `CLAIMED` \| `ON-GOING` \| `AWAITING` \| `CLOSED` |
| `--status` (Ticket) | `OPEN` \| `CLAIMED` \| `AWAITING` \| `CLOSED` |
| `--type` (Issue) | `Fix` \| `Feat` \| `Research` \| `Refactor` |
| `--type` (Ticket) | `Planning` \| `Design` \| `Implement` \| `QA` \| `Deploy` (`Confirmation` só sistema) |
| `--depends-on` (Ticket) | CSV de UUIDs; `next` só entrega quando deps estão `AWAITING`/`CLOSED` |
| Tags | `complexity`: BAIXA\|MEDIA\|ALTA · `human_need`: HITL\|AFK · `risk`: BAIXO\|MEDIO\|ALTO |
| HITL | Em Issue HITL, Planning/Design devem ser HITL; todo Ticket precisa de `human_need` |

---

## Fluxo típico

```text
humano: create (--human)                          → Issue OPEN
IA:     next --agent <ia>                         → { issue } (decompor) ou { issue, ticket }
IA:     ticket create … (1º)                      → Issue ON-GOING
IA:     ticket status … AWAITING                  → gate humano (G1/G2/fatia/…)
humano: ticket decide OPEN|CLOSED
… (Planning → Design → Implement* → QA → Deploy)
sistema: injeta Confirmation ao fechar o último Ticket
IA:     Confirmation → Issue AWAITING
humano: decide OPEN|CLOSED na Issue
```

`*` vários Tickets `Implement` em paralelo, se fizer sentido.

Atalhos:

- Claim preso → `reset --human` (só `CLAIMED`; não há reset de `ON-GOING`)
- Retrabalho → `decide OPEN` ou novos Tickets
- Fechar Issue com Tickets abertos → bloqueado até todos `CLOSED`

---

## Pack de agentes (skills)

| Camada | O quê |
|--------|--------|
| 0 | `AGENTS.md` → skill `sdlc-workflow` |
| 1 | Uma skill `*-phase` por tipo de Ticket claimado |

O pack **não** inclui skills de execução (TDD, review, mutation, Sonar). O *como* executar fica a cargo do agente ou de skills do repo consumidor.

Wiring: `skills/INSTALL.md`. Spec: `docs/features/common-agent-workflow/`.

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
npm run skills:link
```

Documentação de domínio: `CONTEXT.md`. Produto/design: `PRD.md`, `DESIGN.md`.

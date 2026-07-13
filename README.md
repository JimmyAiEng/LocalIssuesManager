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

## Comandos

### `create` — criar Issue

Obrigatório: `--title`, `--project`, `--tag`, `--problem`, `--artifacts`, `--acceptance-criteria` e **um** de `--human` ou `--agent <id>`.

```bash
issues create \
  --title "Implementar login" \
  --project "app" \
  --tag Implement \
  --problem "Usuário não autentica" \
  --artifacts "src/auth" \
  --acceptance-criteria "Login com email e senha" \
  --human

# ou criada por IA:
issues create ... --agent pi
```

### `next` — claimar próxima OPEN (FIFO)

```bash
issues next --agent codex
issues next --agent codex --project app   # filtra por projeto
```

Retorna a Issue claimada ou `null` se a fila estiver vazia.

### `status` — transições de status

**IA** (owner em `CLAIMED` → `AWAITING`):

```bash
issues status --id <uuid> --agent codex --status AWAITING --comment "Pronto para review"
```

**IA** (fechar `OPEN` sem presença humana):

```bash
issues status --id <uuid> --agent pi --status CLOSED --comment "Issue incorreta" --reason errado
```

**Humano** (fechar `OPEN`):

```bash
issues status --id <uuid> --human --status CLOSED --comment "Não faz sentido" --reason obsoleto
```

### `decide` — decisão humana em `AWAITING`

Sempre com `--human`.

```bash
# rejeitar → volta a OPEN (libera claim)
issues decide --id <uuid> --human --status OPEN --comment "Corrigir testes"

# aceitar → CLOSED
issues decide --id <uuid> --human --status CLOSED --comment "Aceito" --reason concluido
```

### `reset` — liberar claim (`CLAIMED` → `OPEN`)

Só humano:

```bash
issues reset --id <uuid> --human --comment "IA travou; liberar fila"
```

### `get` — detalhe completo

```bash
issues get --id <uuid>
issues get --id <uuid> --pretty
```

### `list` — listagem resumida

Filtros opcionais: `--status`, `--project`, `--title`, `--limit`, `--offset`.

```bash
issues list --project app --status OPEN
issues list --title login --limit 10 --offset 0 --pretty
```

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

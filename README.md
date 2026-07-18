# WorkflowDev — Issues Locais

Gerenciador local de Issues via CLI, para humanos e agentes (`cursor`, `claude-code`, `codex`, `pi`).
O trabalho humano fica em **planejar** e **validar**; as IAs **claimam** e entregam via fila.

Saída padrão: **JSON**. Use `--pretty` para JSON indentado.

Modelo vigente: **Issue-only** — cada Issue tem um `type` (o problema) e uma `action` (a entrega esperada).
Não existem Tickets: trabalho maior vira novas Issues **relacionadas** (linhagem).

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
~/issues-manager/projects/<projeto>/{project.json,open,claimed,awaiting,closed,artifacts,design,requirements,attachments}
```

---

## Conceitos rápidos

### Projeto

Issues só existem em projeto **registrado**: `issues project create --name <p> --repo <path> [--check <cmd>]`.
O `--repo` aponta o repositório git (base das worktrees); o `--check` é o script que uma Issue `Implement` precisa passar para ser concluída.

### Issue (unidade de trabalho)

| Campo | Valores |
|--------|-------------|
| Status | `OPEN` · `CLAIMED` · `AWAITING` · `CLOSED` |
| Tipo (imutável) | `Fix` · `Feat` · `Research` · `Refactor` |
| Action (imutável) | `Planning` · `Design` · `Implement` · `QA` · `Deploy` |
| Relates | ids de outras Issues (linhagem; artefatos herdados no prompt) |

### Outros

| Conceito | Valores / notas |
|--------|-------------|
| Agentes | `cursor` · `claude-code` · `codex` · `pi` |
| Motivos de fechamento | `obsoleto` · `duplicado` · `concluido` · `errado` |
| Tags | `complexity` · `human_need` (HITL/AFK) · `risk` |
| Autonomia | HITL, `risk=ALTO` ou `complexity=ALTA` → só o humano fecha (via web) |
| Limite de tamanho | Textos ≤ **300 palavras**; requisitos ≤ **5 Features**. Estourou? Decomponha em Issues menores |

---

## Referência de Comandos

| Comando | Função | Obrigatório | Opcional |
|---------|--------|-------------|----------|
| **project create** | Registrar projeto | `--name` `--repo` | `--check` |
| **project list** | Listar projetos | — | — |
| **create** | Criar Issue | `--title` `--project` `--type` `--action` `--problem` + (`--human` \| `--agent`) | `--acceptance-criteria` `--relates` `--artifact-file` `--complexity` `--risk` `--human-need` `--attach` |
| **next** | Claimar a próxima Issue | `--agent` + (`--project` \| `--id`) | `--prompt` |
| **comment** | Adicionar comentário | `--id` + (`--human` \| `--agent`) | `--comment` `--attach` |
| **tag** | Tags | `--id` + (`--human` \| `--agent`) | `--complexity` `--human-need` `--risk` |
| **relate** | Relacionar Issues (linhagem) | `--id` `--relates` | — |
| **status** | Concluir pela IA (com gate) | `--id` `--agent` `--status` `--comment` | `--reason` |
| **decide** | Decisão humana (AWAITING) | `--id` `--status` `--comment` `--human` | `--reason` |
| **reset** | Liberar claim (CLAIMED→OPEN) | `--id` `--comment` `--human` | — |
| **artifact** | Gravar Artefato .md (≤300 palavras) | `--id` `--file` | — |
| **get** | Detalhe (+ relacionadas) | `--id` | `REQUIREMENTS` \| `DESIGN` |
| **list** | Listar Issues | — | `--status` `--project` `--title` `--type` |

### Exemplos

```bash
# Projeto primeiro (repo + check de Implement)
issues project create --name app --repo ~/code/app --check "npm run check"

# Create (type = problema; action = entrega esperada)
issues create --title "Login com e-mail" --project app --type Feat --action Planning \
  --problem "Usuário não autentica" --human

# Workflow da IA
issues next --prompt --agent codex --project app
issues status --id <uuid> --agent codex --status CLOSED --comment "evidência: o que foi feito e decidido" --reason concluido

# HITL: a IA envia para decisão humana
issues status --id <uuid> --agent codex --status AWAITING --comment "evidência"
issues decide --id <uuid> --human --status CLOSED --comment "Aceito" --reason concluido

# Linhagem: a Issue de implementação herda o artefato do design no prompt
issues relate --id <implId> --relates <designId>
```

---

## Gates de conclusão (por action)

A IA só conclui (`AWAITING`/`CLOSED`) se a entrega da action existir:

| Action | Gate |
|--------|------|
| `Planning` | Requisitos Gherkin válidos (`issues requirements set`), máx. 5 Features |
| `Design` | `design.md` + ≥1 diagrama PlantUML válido (`issues design doc/add`) |
| `Implement` | Worktree criada (`issues worktree add`) + `--check` do projeto passando na worktree |
| `QA` / `Deploy` | Sem validação automatizada por enquanto (evidência na thread) |

Falhas de gate saem com exit 1 e mensagem orientando o que fazer; erros de Design saem como JSON `{"errors":[…]}`.
A **evidência** (comentário de conclusão) é sempre obrigatória para a IA: relatório curto do que foi feito, passos e decisões.
O fechamento humano (`decide` / web) não passa por gate: é override.

### Design (pacote da Issue)

```bash
issues design doc --issue <id> --file design.md
issues design add --issue <id> --kind class --file class.puml
issues get DESIGN --id <id>     # pacote + validation.ready
```

`--kind`: `class` · `component` · `package` · `activity` · `state` · `deployment`.

---

## Infraestrutura

```bash
issues worktree add --id <uuid> [--path <p>]   # sandbox git no repo do projeto
issues worktree remove --id <uuid>
issues web [--port <n>] [--no-open]            # UI local (decisões humanas)
issues init [--harness …] [--target <dir>] [--force]
issues init --dogfood                          # só no pack source
```

---

## Fluxo típico

```text
humano: project create --name app --repo …        → projeto registrado
humano: create --action Planning (--human)        → Issue OPEN
IA:     next --prompt --agent <ia> --project app  → claima e executa a action
IA:     cria novas Issues relacionadas (Design, Implement, …) conforme explora
IA:     status CLOSED --comment "<evidência>"     → AFK fecha direto (gate da action roda)
IA:     status AWAITING --comment "<evidência>"   → HITL/risco ALTO/complexidade ALTA
humano: decide OPEN|CLOSED na web
```

Atalhos:

- Claim preso → `reset --human` (só `CLAIMED`)
- Retrabalho → `decide OPEN` ou nova Issue relacionada
- Issue grande (limite de 300 palavras estourando) → feche e decomponha em Issues menores relacionadas

---

## Pack de agentes (skills)

| Camada | O quê |
|--------|--------|
| 0 | `AGENTS.md` → skill `sdlc-workflow` |
| 1 | Uma skill `*-phase` por action da Issue claimada |

O pack **não** inclui skills de execução (TDD, review, mutation, Sonar). O *como* executar fica a cargo do agente ou de skills do repo consumidor.

Wiring: `skills/INSTALL.md`. Fluxo de referência: `docs/AIDevelopmentWorkfow.drawio`.

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

Documentação de domínio: `CONTEXT.md`. Produto/design: `PRD.md`, `DESIGN.md`. Decisões: `docs/adr/`.

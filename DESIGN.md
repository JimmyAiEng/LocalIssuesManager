# Design — Issues Locais (CLI v1)

Status: **aceito (v1.3)** — implementação vigente.  
Fontes: `PRD.md`, `CONTEXT.md`, decisões Lavish, ADRs.

---

## 1. Organização de pastas

### 1.1 Repositório (código)

```
WorkflowDev/
├── CONTEXT.md
├── PRD.md
├── DESIGN.md
├── docs/adr/
├── package.json
├── tsconfig.json
├── bin/
│   └── issues
└── src/
    ├── domain/
    │   ├── issue_entity.ts
    │   ├── value_objects.ts      ← VOs, enums e parsers consolidados
    │   ├── domain_error.ts
    │   └── queue_repository.ts   ← Queue concreto (FS via comandos Linux)
    ├── app/
    │   ├── create_issue_use_case.ts
    │   ├── next_issue_use_case.ts
    │   ├── status_issue_use_case.ts
    │   ├── decide_issue_use_case.ts
    │   ├── reset_claim_use_case.ts
    │   ├── get_issue_use_case.ts
    │   ├── list_issues_use_case.ts
    │   └── required_issue.ts
    └── cli.ts
```

**Sem pasta `infra/`.**  
Convenções: entities e repositórios mantêm arquivos próprios; VOs pequenos ficam consolidados em `domain/value_objects.ts`; use cases usam `app/*_use_case.ts`.

| Camada | Pode importar | Não pode |
|--------|---------------|----------|
| `domain/*` (exceto Queue) | só outros `domain/*` puros | `app/`, `cli` |
| `queue_repository.ts` | `domain/*` + shell/FS (`mv`, etc.) | `app/`, `cli` |
| `app/*` | `domain/*` | `cli` |
| `cli.ts` | só `app/*` | `domain/*` direto |

### 1.2 Disco (runtime)

```
~/issues-manager/projects/<project>/{open,claimed,awaiting,closed}/<id>.json
```

Transição = `mv` entre pastas. `next` / `list` leem por pasta.

---

## 2. Classes e responsabilidades

| Símbolo | Arquivo | Tipo | Responsabilidade |
|---------|---------|------|------------------|
| `Issue` | `issue_entity.ts` | Entity | Agregado + matriz + `human_presence` |
| `Thread` | `value_objects.ts` | VO | Entrada de histórico |
| VOs e parsers | `value_objects.ts` | VO | Tag, Status, AgentId, ClosedReason, Actor e validação dos enums |
| `DomainError` | `domain_error.ts` | erro | Falhas de regra |
| `Queue` | `queue_repository.ts` | **Repositório concreto** | Persistência + FIFO + `mv`/`mkdir`/leitura no disco. **Não é Port/interface.** |

**Removidos:** `IssueStore`, `IssueApp`, `FsQueueRepository`, pasta `infra/`, Port `Queue`.

### API de `Queue` (classe concreta)

```
class Queue {
  save(issue: Issue): void
  load(id: string): Issue | null
  list(filter: ListFilter): Issue[]
  oldestOpen(project?: string): Issue | null
}
```

Implementação: comandos Linux (`mkdir -p`, `mv`, leitura de diretório) dentro de `queue_repository.ts`.

### Comandos de `Issue`

```
Issue.create · claim · await · reset · decide · closeByAgent · closeByHuman
```

Claim sem `Thread`; demais transições appendam `Thread` com comentário.

### Use cases (`app/`)

| Use case | RF |
|----------|-----|
| `CreateIssueUseCase` | RF-01 |
| `NextIssueUseCase` | RF-02 |
| `StatusIssueUseCase` | RF-03 |
| `DecideIssueUseCase` | RF-04 |
| `ResetClaimUseCase` | RF-05 |
| `GetIssueUseCase` | RF-06 |
| `ListIssuesUseCase` | RF-07 |

### Dependências

```
cli → app/*_use_case → domain (Issue, Queue)
```

`cli` instancia `Queue` e injeta nos use cases (composition root), sem importar demais tipos de domínio além do necessário via app — **FF-02:** `cli` não importa `domain/` (use cases recebem `Queue` já construído… *ou* cli só importa app e um factory em app).

**Composition root pragmático:** `cli.ts` pode importar apenas `app/*` e um `create_container` em `app/` que instancia `Queue` — assim cli não toca `domain/`. Alternativa aceita no design: wiring mínimo no cli que importa `Queue` só para `new Queue()` — **preferência congelada:** factory em `app/container.ts` (opcional, 1 arquivo) **ou** cli importa só use cases e passa paths; use case constrói `Queue` internamente (mais simples, menos DI).

**Decisão v1.2 (simples):** cada use case faz `new Queue()` (ou recebe path root). Sem container. Cli só chama use cases.

---

## 3. Fitness Functions

| ID | Regra | Falha quando |
|----|-------|--------------|
| **FF-01** | `domain/` (exceto mecanismos de I/O em `queue_repository.ts`) não importa `app/` nem `cli` | Import domain→app/cli |
| **FF-02** | `cli.ts` importa só `app/`; não importa `domain/` | CLI usa entity/regras direto |
| **FF-03** | Arquivo ≤ 300 linhas | Arquivo > 300 |
| **FF-04** | Função/método ≤ 20 linhas | Função > 20 |
| **FF-05** | Abstração mínima (zero Ports; só classes concretas) | Introduzir interface/port sem necessidade |
| **FF-06** | Módulos profundos: interface pública / tamanho total pequeno | API larga / wrappers rasos |

---

## 4. Critérios de Aceite testáveis

CA-01 … CA-11 (create, next FIFO, await, decide humana, reset, proibidas, human_presence, get/list, PATH, --human/JSON, path=status). Detalhe no histórico do DESIGN / PRD §12.

---

## 5. Mapa CLI

`create` · `next` · `status` · `decide` · `reset` · `get` · `list`  
Flags: `--human`, `--agent`, `--pretty`; JSON default.

---

## 6. Fora de escopo

Implementação, UI, sync, links, delete físico, reabrir CLOSED, prioridade ≠ FIFO.

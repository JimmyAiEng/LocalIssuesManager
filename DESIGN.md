# Design — Issues Locais (CLI v1)

Status: **aceito (v1.4)** — CLI vigente e arquitetura da UI v1 definida; implementação web pendente.
Fontes: `PRD.md`, `PRD-UI.md`, `UX.md`, `CONTEXT.md`, decisões Lavish, ADRs.

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
    ├── cli.ts
    └── web/                    ← adaptador HTTP/browser local
        ├── server.ts            ← servidor loopback e ciclo de vida
        ├── api.ts               ← rotas HTTP → casos de uso
        └── client/              ← páginas, componentes e estado do navegador
```

`web/` é uma camada de entrada, como `cli.ts`: páginas e componentes só conversam com `app/`. Ela não importa `domain/`, não lê/escreve os JSONs das Issues e não contém regras de transição.

**Sem pasta `infra/`.**  
Convenções: entities e repositórios mantêm arquivos próprios; VOs pequenos ficam consolidados em `domain/value_objects.ts`; use cases usam `app/*_use_case.ts`.

| Camada | Pode importar | Não pode |
|--------|---------------|----------|
| `domain/*` (exceto Queue) | só outros `domain/*` puros | `app/`, `cli` |
| `queue_repository.ts` | `domain/*` + shell/FS (`mv`, etc.) | `app/`, `cli` |
| `app/*` | `domain/*` | `cli` |
| `cli.ts` | `app/*` e `web/server.ts` somente para o comando `web` | `domain/*` direto |
| `web/*` | só `app/*` e APIs HTTP/browser/Node necessárias | `domain/*`, `cli.ts`, arquivos de persistência |

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
web → app/*_use_case → domain (Issue, Queue)
```

`cli` instancia `Queue` e injeta nos use cases (composition root), sem importar demais tipos de domínio além do necessário via app — **FF-02:** `cli` não importa `domain/` (use cases recebem `Queue` já construído… *ou* cli só importa app e um factory em app).

**Composition root pragmático:** `cli.ts` pode importar apenas `app/*` e um `create_container` em `app/` que instancia `Queue` — assim cli não toca `domain/`. Alternativa aceita no design: wiring mínimo no cli que importa `Queue` só para `new Queue()` — **preferência congelada:** factory em `app/container.ts` (opcional, 1 arquivo) **ou** cli importa só use cases e passa paths; use case constrói `Queue` internamente (mais simples, menos DI).

**Decisão v1.2 (simples):** cada use case faz `new Queue()` (ou recebe path root). Sem container. Cli só chama use cases.

---

## 3. Fitness Functions

| ID | Regra | Falha quando |
|----|-------|--------------|
| **FF-01** | `domain/` (exceto mecanismos de I/O em `queue_repository.ts`) não importa `app/` nem `cli` | Import domain→app/cli |
| **FF-02** | Adaptadores (`cli.ts`, `web/*`) importam só `app/`; não importam `domain/` | Adaptador usa entity/regras/persistência direto |
| **FF-03** | Arquivo ≤ 300 linhas | Arquivo > 300 |
| **FF-04** | Função/método ≤ 20 linhas | Função > 20 |
| **FF-05** | Abstração mínima (zero Ports; só classes concretas) | Introduzir interface/port sem necessidade |
| **FF-06** | Módulos profundos: interface pública / tamanho total pequeno | API larga / wrappers rasos |

---

## 4. Critérios de Aceite testáveis

CA-01 … CA-11 (create, next FIFO, await, decide humana, reset, proibidas, human_presence, get/list, PATH, --human/JSON, path=status). Detalhe no histórico do DESIGN / PRD §12.

---

## 5. Mapa CLI

`create` · `next` · `status` · `decide` · `reset` · `get` · `list` · `web`
Flags existentes permanecem inalteradas; `web` inicia o client local.

## 6. Arquitetura web v1

### 6.1 Inicialização e limites

`issues web` inicia um único servidor HTTP no processo da CLI, em `127.0.0.1` (nunca em interface de rede externa), entrega o client estático e informa a URL local. `--port <n>` seleciona a porta (`0` escolhe uma livre); por padrão o navegador é aberto e `--no-open` suprime essa tentativa. Encerrar o processo encerra o servidor.

Não haverá autenticação, API remota, sincronização, polling ou atualização automática. CLI e web continuam concorrendo pela mesma fonte de verdade em disco.

### 6.2 Fluxo e responsabilidades

```text
bin/issues → cli.ts (web) → web/server.ts
browser client ⇄ web/api.ts → app/*_use_case → domain/Queue → JSON local
```

- `server.ts` configura loopback, assets estáticos, shutdown e encaminha requisições.
- `api.ts` valida o formato HTTP, chama os casos de uso e traduz apenas suas respostas/erros para JSON e códigos HTTP; não implementa regras de Issue.
- `client/` contém páginas de Quadro, detalhes e nova Issue, componentes e estado efêmero de navegador (filtros, rolagem, rascunhos, diálogo e último refresh).
- `app/` continua sendo o único caminho de aplicação. A web usa `Create`, `List`, `Get`, `Status`, `Decide` e `Reset`; `next` permanece uma operação de IA via CLI.

Rotas iniciais: `GET /api/issues`, `GET /api/issues/:id`, `POST /api/issues`, `POST /api/issues/:id/close`, `POST /api/issues/:id/decision` e `POST /api/issues/:id/reset`. As rotas do browser são quadro, `/issues/:id` e nova Issue; a estratégia pode ser history fallback ou hash, desde que preserve a navegação definida em `UX.md`.

### 6.3 Consistência e respostas

A UI relê após uma mutação bem-sucedida e apenas então atualiza a representação. O adaptador traduz falha conhecida de salvamento obsoleto (`Stale Issue save`) para `409 Conflict`; o client preserva o rascunho, informa o conflito e oferece atualização. Erros de validação/regra são `4xx`; erros inesperados são `5xx`, sem detalhes internos. Nenhuma transição é otimista.

A listagem da API deve suportar todos os filtros do quadro, inclusive TAG, antes de paginação/limites; filtrar TAG somente no browser sobre resposta paginada é proibido. A ordenação do quadro é `created_at` crescente por coluna.

### 6.4 Entrega e qualidade

A implementação começa sem framework nem dependência de servidor obrigatória: Node/TypeScript e client estático são suficientes para a v1. Uma dependência só pode entrar se reduzir complexidade comprovadamente e sem criar outra camada de domínio. Assets distribuídos devem ser incluídos no pacote instalado. Testes cobrem launcher, API integrada à mesma Queue, estado de client e os fluxos humanos; mantém-se as fitness functions e os limites de tamanho.

---

## 7. Fora de escopo

Implementação nesta Issue de Design, UI além da v1, sync, links, delete físico, reabrir CLOSED, prioridade ≠ FIFO, acesso remoto, autenticação e novas regras de domínio.

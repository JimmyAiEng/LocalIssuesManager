# Design — Issues Locais

| Campo | Valor |
|---|---|
| Versão | 4.0 |
| Status | Vigente |
| Modelo | Issue-only · Workflow por Action · Artifact unificado |
| Decisões | ADR 0005 e ADR 0006 |

## 1. Arquitetura

```text
CLI / Web
    ↓
Application use cases + Workflow services
    ↓
Domain (Issue, Artifact, Workflow, GatePolicy)
    ↓
Queue + ArtifactStore concretos
    ↓
Filesystem / Git / PlantUML / project checks
```

- `Issue` protege identidade, transições, Owner, Thread, tags e relações.
- `Artifact` valida os dados intrínsecos de cada Artifact Type.
- `Workflow` é selecionado pela `Action` e não é persistido.
- `GatePolicy` combina validade da entrega e necessidade de decisão humana.
- `app/services/workflows` coleta evidências e orquestra a conclusão por Action.
- `Queue` persiste Issues e projetos. `ArtifactStore` concentra a persistência de Artifacts.
- CLI e Web utilizam os mesmos use cases; não acessam persistência diretamente.

## 2. Domínio

### Issue

Agregado da unidade de trabalho. Campos principais:

```text
id · title · project · type · action · problem · acceptance_criteria
status · owner · closed_reason · tags · relates · worktree
architecture_changed · thread · phases · revision
```

Transições:

```text
OPEN --claim--> CLAIMED
CLAIMED --submit--> AWAITING
CLAIMED --closeByAgent/closeByHuman--> CLOSED
AWAITING --decide--> OPEN | CLOSED
CLAIMED --reset--> OPEN
```

A Issue não executa PlantUML, Git, checks, consultas à linhagem ou regras específicas de Workflow.

### Artifact

Artifact Types:

```text
doc | requirements | prd | design | plan | media
```

Regras intrínsecas:

- `doc` e documentos breves: até 300 palavras;
- `requirements`: Features Gherkin válidas;
- `prd`: estrutura e referências válidas contra Requirements;
- `design`: documentos breves e diagramas validados pelo adapter PlantUML;
- `plan`: estrutura de Small Plan válida;
- `media`: imagem/vídeo suportado, até 25 MiB.

`Attachment` permanece como façade compatível para o contrato persistido da Thread e para `/api/attachments`, mas é internamente um Artifact `media`.

### Workflow e GatePolicy

`workflowFor(action)` seleciona:

| Action | Workflow | Entrega principal |
|---|---|---|
| Planning | Requirement Engineering | Requirements + PRD + filhas Design |
| Design | Design | Plan; pacote UML quando arquitetura muda; filhas Implement |
| Implement | Unit of Work | Worktree + TDD configurado + checks do Projeto |
| QA | Quality Review | Artifact `doc` de validação |
| Deploy | Merge/PR Analysis | PR + análise; decisão humana obrigatória |

`GateAssessment` possui três resultados:

```text
approved | human-required | rejected
```

Entrega inválida é rejeitada antes do roteamento. `human_need=HITL`, risco ALTO, complexidade ALTA, mudança arquitetural e Deploy podem exigir decisão humana.

## 3. Aplicação

`statusIssue` mantém o contrato público e delega a conclusão da IA para:

```text
src/app/services/workflows/
  index.ts       completeIssue (dispatcher)
  planning.ts
  design.ts
  implement.ts
  qa.ts
  deploy.ts
```

Cada módulo conhece somente a orquestração da sua Action. Dependências externas permanecem na aplicação:

- PlantUML: `plantuml_check.ts`;
- Git/TDD: `implement_gate.ts`;
- checks do projeto: `project_use_cases.ts`;
- filesystem: `Queue` e `ArtifactStore` concretos.

O fechamento humano direto continua sendo override para cancelamento/classificação administrativa. A decisão de uma Issue `AWAITING` continua exclusiva do humano.

## 4. Persistência

O layout físico existente é preservado para compatibilidade:

```text
projects/<project>/
  project.json
  open|claimed|awaiting|closed/<issue-id>.json
  artifacts/<issue-id>.md
  requirements/<issue-id>.json
  prd/<issue-id>.json
  design/<issue-id>/{design.md,plan.json,<kind>.puml}
  attachments/<artifact-id>.<ext>
```

Apesar do layout legado, todos os tipos são acessados pela API única de `ArtifactStore`. Os antigos métodos de Artifact em `Queue` existem apenas como façade de compatibilidade local; novos callers usam `queue.artifacts`.

## 5. Regras estruturais

- arquivo de código ≤ 300 linhas;
- função ≤ 20 linhas;
- domínio não importa aplicação ou bordas;
- CLI/Web não acessam domínio diretamente fora dos contratos permitidos;
- sem interfaces Port/Repository especulativas;
- Workflow não é entidade persistida;
- Artifacts relacionados compõem contexto, mas não satisfazem o gate da Issue atual.

## 6. Validação

```bash
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run check:fitness
npm run build
```

A suíte contém testes unitários de Artifact, ArtifactStore, Workflow, GatePolicy e dispatcher, além do E2E completo Planning → Design → Implement → QA → Deploy.

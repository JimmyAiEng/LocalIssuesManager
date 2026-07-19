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
Filesystem / PlantUML
```

- `Issue` protege identidade, transições, Owner, Thread, tags e relações.
- `domain/artifacts/` define o padrão de Artifact e a validação intrínseca de cada Artifact Type.
- `domain/gates/` seleciona um Gate por `Action`; Gates não são persistidos.
- `GatePolicy` combina validade da entrega e necessidade de decisão humana.
- `app/services/workflows` coleta evidências e orquestra a conclusão por Action.
- `Queue` persiste Issues e projetos. `ArtifactStore` concentra a persistência de Artifacts.
- CLI e Web utilizam os mesmos use cases; não acessam persistência diretamente.

## 2. Domínio

### Issue

Agregado da unidade de trabalho. Campos principais:

```text
id · title · project · type · action · problem · acceptance_criteria
status · owner · closed_reason · tags · relates
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

A Issue não executa PlantUML, consultas à linhagem ou regras específicas de Workflow.

### Artifact

Artifact Types:

```text
media | document | requirement | uml | implementation-plan
```

Regras intrínsecas:

- `DocumentArtifact`: Markdown breve, até 300 palavras;
- `RequirementArtifact`: PRD/Requirements como conjunto de Features estruturadas (JSONL, uma por linha);
- `UmlArtifact`: kind e sintaxe UML compatíveis com o resultado do adapter PlantUML;
- `ImplementationPlanArtifact`: estrutura de Small Plan válida;
- `MediaArtifact`: imagem/vídeo suportado, até 25 MiB.

Cada tipo vive em `src/domain/artifacts/*_artifact.ts` e expõe sua validação interna. `artifact.ts` mantém a identidade e o dispatcher comum; `artifact_store.ts` preserva o layout físico.

`Attachment` permanece como façade compatível para o contrato persistido da Thread e para `/api/attachments`, mas é internamente um Artifact `media`.

### Gates e GatePolicy

`gateFor(action)` seleciona um Gate com o mesmo contrato declarativo: requisitos de Artifacts, execução de código e aprovação humana.

| Action | Artifacts | Execução de código | Aprovação humana |
|---|---|---|---|
| Planning | RequirementArtifact | Não | Condicional às tags |
| Design | ImplementationPlanArtifact; Document + UML quando arquitetura muda | PlantUML quando arquitetura muda | Quando arquitetura muda ou pelas tags |
| Implement | Nenhum | Não | Condicional às tags |
| Review | Artifact `doc` de validação | Não | Condicional às tags |
| Deploy | Nenhum | Análise externa do PR | Sempre |

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

- PlantUML: `uml-validation/plantuml_check.ts`;
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

A suíte contém testes unitários de Artifact, ArtifactStore, Workflow, GatePolicy e dispatcher, além do E2E completo Planning → Design → Implement → Review → Deploy.

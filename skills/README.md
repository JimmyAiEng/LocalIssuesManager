# Pack de discovery + skills Planning/Design/Implement/QA/Deployment (camadas 0–2)

**Entregável** do projeto Issue Manager / WorkflowDev: pack portátil de progressive disclosure para **novo desenvolvimento**, usável em **qualquer projeto** e nos harnesses `cursor` · `claude-code` · `codex` · `pi`.

Instalação: [`INSTALL.md`](INSTALL.md).

## Camadas 0 e 1 — discovery

| Skill | Camada | Papel |
|---|---|---|
| [`sdlc-workflow`](sdlc-workflow/SKILL.md) | 0 | Mapa SDLC; sempre via `AGENTS.md` |
| [`planning-phase`](planning-phase/SKILL.md) | 1 | Disclosure TAG=`Planning` |
| [`design-phase`](design-phase/SKILL.md) | 1 | Disclosure TAG=`Design` |
| [`implement-phase`](implement-phase/SKILL.md) | 1 | Disclosure TAG=`Implement` |
| [`qa-phase`](qa-phase/SKILL.md) | 1 | Disclosure TAG=`QA` |
| [`deployment-phase`](deployment-phase/SKILL.md) | 1 | Disclosure TAG=`Deployment` |

## Camada 2 — Planning (após `planning-phase`)

| Skill | Papel |
|---|---|
| [`wayfinder`](wayfinder/SKILL.md) | Mapa de Issues de decisão (issues-local) |
| [`research`](research/SKILL.md) | Pesquisa em fontes primárias → Markdown |
| [`domain-modeling`](domain-modeling/SKILL.md) | Glossário / ADRs |
| [`teach`](teach/SKILL.md) | Workspace de ensino multi-sessão |
| [`handoff`](handoff/SKILL.md) | Documento de troca de sessão/harness |

Adaptação: [`../docs/features/common-agent-workflow/ADAPTATION-PLANNING.md`](../docs/features/common-agent-workflow/ADAPTATION-PLANNING.md).

## Camada 2 — Design (após `design-phase`)

| Skill | Papel |
|---|---|
| [`codebase-design`](codebase-design/SKILL.md) | Exploração E: opções + trade-offs |
| [`prototype`](prototype/SKILL.md) | Proto throwaway em **worktree** |
| [`to-spec`](to-spec/SKILL.md) | Congelar Spec em markdown |
| [`to-tickets`](to-tickets/SKILL.md) | Issues independentes no issues-local |

Adaptação: [`../docs/features/common-agent-workflow/ADAPTATION-DESIGN.md`](../docs/features/common-agent-workflow/ADAPTATION-DESIGN.md).

## Camada 2 — Implement (após `implement-phase`)

| Skill | Papel |
|---|---|
| [`implement`](implement/SKILL.md) | Orquestra fatia (TDD + review) |
| [`tdd`](tdd/SKILL.md) | Red-green-refactor |
| [`code-review`](code-review/SKILL.md) | Review interno ≠ QA |

## Camada 2 — QA (após `qa-phase`)

| Skill | Papel |
|---|---|
| [`quality-assurance`](quality-assurance/SKILL.md) | Orquestra validação multi-perspectiva + recomendação G3 |
| [`software-architect`](software-architect/SKILL.md) | Perspectiva arquitetura |
| [`qa-engineer`](qa-engineer/SKILL.md) | Perspectiva critérios / regressão |
| [`data-engineer`](data-engineer/SKILL.md) | Perspectiva dados |
| [`security-engineer`](security-engineer/SKILL.md) | Perspectiva segurança |
| [`devops-engineer`](devops-engineer/SKILL.md) | Perspectiva ops (modo QA) |

Adaptação: [`../docs/features/common-agent-workflow/ADAPTATION-QA.md`](../docs/features/common-agent-workflow/ADAPTATION-QA.md).

## Camada 2 — Deployment (após `deployment-phase`)

| Skill | Papel |
|---|---|
| [`devops-engineer`](devops-engineer/SKILL.md) | PR / entrega / handoff operacional + pedido G4 (modo entrega) |

Adaptação: [`../docs/features/common-agent-workflow/ADAPTATION-DEPLOYMENT.md`](../docs/features/common-agent-workflow/ADAPTATION-DEPLOYMENT.md).

Entrada do pack: [`../AGENTS.md`](../AGENTS.md).

Spec de origem (só no repositório produtor): `docs/features/common-agent-workflow/`. Os arquivos do pack são **auto-contidos** para o projeto consumidor.

## Adaptação a partir de mattpocock/skills

Fonte: [mattpocock/skills](https://github.com/mattpocock/skills).

| Ideia mattpocock | Adaptação neste pack |
|---|---|
| `AGENTS.md` como índice | Canônico em pt-BR; discovery + issues-local |
| Progressive disclosure | Camadas 0→1→2: `sdlc-workflow` → `*-phase` → skills concretas |
| Router (`ask-matt`) | TAG da Issue → `*-phase` |
| Tracker configurável | Fixo: **issues-local** |
| Labels de triage | Status/TAG do Issue Manager |
| Tickets com blocking edges | Issues **independentes** (D10); ver `wayfinder` / `to-tickets` |
| Proto na árvore do feature | Proto em **git worktree** (D03); ver `prototype` |
| Maintenance / diagnosing-bugs | Fora deste workflow |

Contrato estável: `AGENTS.md` + `skills/<nome>/SKILL.md` no projeto consumidor.

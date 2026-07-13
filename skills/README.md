# Pack de discovery + skills Planning/Design/Implement/QA/Deployment (camadas 0–2)

Pack portátil de progressive disclosure para **novo desenvolvimento**, usável em **qualquer projeto** e nos harnesses `cursor` · `claude-code` · `codex` · `pi`.
Entrada do pack: o `AGENTS.md` instalado na raiz do projeto.
Instalação: [`INSTALL.md`](INSTALL.md).

Contrato estável: `AGENTS.md` na raiz + `<dir de skills>/<nome>/SKILL.md`.
Os arquivos do pack são **auto-contidos**: nenhuma skill depende de documentos do repositório que as produziu.

## Camadas 0 e 1 — discovery

| Skill | Camada | Papel |
|---|---|---|
| `sdlc-workflow` | 0 | Mapa SDLC; sempre via `AGENTS.md` |
| `planning-phase` | 1 | Disclosure TAG=`Planning` |
| `design-phase` | 1 | Disclosure TAG=`Design` |
| `implement-phase` | 1 | Disclosure TAG=`Implement` |
| `qa-phase` | 1 | Disclosure TAG=`QA` |
| `deployment-phase` | 1 | Disclosure TAG=`Deployment` |

## Camada 2 — Planning (após `planning-phase`)

| Skill | Papel |
|---|---|
| `wayfinder` | Mapa de Issues de decisão (issues-local) |
| `research` | Pesquisa em fontes primárias → Markdown |
| `domain-modeling` | Glossário / ADRs |
| `teach` | Workspace de ensino multi-sessão |
| `handoff` | Documento de troca de sessão/harness |

## Camada 2 — Design (após `design-phase`)

| Skill | Papel |
|---|---|
| `codebase-design` | Exploração E: opções + trade-offs |
| `prototype` | Proto throwaway em **worktree** |
| `to-spec` | Congelar Spec em markdown |
| `to-tickets` | Issues independentes no issues-local |

## Camada 2 — Implement (após `implement-phase`)

| Skill | Papel |
|---|---|
| `implement` | Orquestra fatia (TDD + review) |
| `tdd` | Red-green-refactor |
| `code-review` | Review interno ≠ QA |

## Camada 2 — QA (após `qa-phase`)

| Skill | Papel |
|---|---|
| `quality-assurance` | Orquestra validação multi-perspectiva + recomendação G3 |
| `software-architect` | Perspectiva arquitetura |
| `qa-engineer` | Perspectiva critérios / regressão |
| `data-engineer` | Perspectiva dados |
| `security-engineer` | Perspectiva segurança |
| `devops-engineer` | Perspectiva ops (modo QA) |

## Camada 2 — Deployment (após `deployment-phase`)

| Skill | Papel |
|---|---|
| `devops-engineer` | PR / entrega / handoff operacional + pedido G4 (modo entrega) |

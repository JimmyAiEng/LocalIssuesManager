# Catálogo de skills — novo desenvolvimento

Status: catálogo vivo. Planning, Design, Implement, QA e Deployment materializadas em `skills/` (Issues `c547eb96`, `9855f155`, `658c5c36`, `7ed02fef`, `0e648d2b`).

Base: adaptar [mattpocock/skills](https://github.com/mattpocock/skills). Itens ★ são novos (Issues futuras).

Discovery: **progressive disclosure** em três camadas (ver `WORKFLOW.md` §5).

---

## Camada 0 — sempre no contexto ★

| Skill | Responsabilidade | Entradas | Saídas | Notas |
|---|---|---|---|---|
| `sdlc-workflow` | Explicar o SDLC/workflow de novo desenvolvimento | Claim / Issue | Orientação de processo (estágios, gates, paralelismo, Review≠QA) | Em `skills/sdlc-workflow/`; **sempre** via `AGENTS.md` |

## Camada 1 — disclosure por fase ★

Uma skill por TAG. Só a da Issue claimada é acionada; ela revela o conjunto permitido da camada 2.

| Skill | TAG | Disclosure (skills permitidas) |
|---|---|---|
| `planning-phase` | Planning | `wayfinder`, `research`, `domain-modeling`, `teach`, `handoff` |
| `design-phase` | Design | `codebase-design`, `prototype`, `to-spec`, `to-tickets` (+ heurísticas E/Proto) |
| `implement-phase` | Implement | `implement`, `tdd`, `code-review` |
| `qa-phase` | QA | `quality-assurance` + perspectivas (`software-architect`, `qa-engineer`, `data-engineer`, `security-engineer`, `devops-engineer`) |
| `deployment-phase` | Deployment | `devops-engineer` |

Cada `*-phase` também lembra: independência de Issues, quando ir a `AWAITING`, e o que criar ao fechar.

## Camada 2 — skills concretas

### Planning (implementadas em `skills/`)

| Skill | Responsabilidade | Entradas | Saídas | Notas |
|---|---|---|---|---|
| `wayfinder` | Mapear trabalho grande em Issues de decisão | Objetivo amplo | Mapa Markdown + Issues issues-local | User-invoked; sem blocking obrigatório (D10) |
| `research` | Investigar fontes confiáveis | Pergunta | Markdown citado | Model-invoked; background |
| `domain-modeling` | Afiar linguagem ubíqua / ADRs | Issue + código | `CONTEXT.md` / ADRs | Canônica no pack; formatos inclusos |
| `teach` | Ensinar conceito ao humano em sessões | Tópico | Workspace de ensino | User-invoked |
| `handoff` | Compactar sessão para outro agente | Conversa | Doc de handoff (tmpdir) | Troca de harness/sessão |

### Design (implementadas em `skills/`)

| Skill | Responsabilidade | Entradas | Saídas | Notas |
|---|---|---|---|---|
| `codebase-design` | Opções de módulos profundos / seams | Requisitos | Opções + trade-offs | Só se heurística pedir exploração |
| `prototype` | Protótipo descartável em worktree | Pergunta de desenho | App/UI throwaway | Antes e/ou depois do gate de direção |
| `to-spec` | Sintetizar alinhamento em spec | Conversa/requisitos | Spec | Congela desenho |
| `to-tickets` | Fatiar em Issues **independentes** | Spec | Issues | Sem grafo de dependência obrigatória; paralelo ok |

## Implement (implementadas em `skills/`)

| Skill | Responsabilidade | Entradas | Saídas | Notas |
|---|---|---|---|---|
| `implement` | Construir conforme spec/tickets | Issue Implement | Código | Orquestra TDD + review |
| `tdd` | Red-green-refactor por fatia | Fatia | Testes + código | Sem gate humano entre red e green |
| `code-review` | Standards + fidelidade à spec | Diff | Achados | Review **interno**; ≠ QA |

## QA (implementadas em `skills/`)

| Skill | Responsabilidade | Entradas | Saídas | Notas |
|---|---|---|---|---|
| `quality-assurance` ★ | Orquestrar validação multi-perspectiva | Issue QA + artefatos | Veredicto + achados | Preferir outro harness/modelo (não obrigatório) |
| `software-architect` ★ | Perspectiva de arquitetura / seams | Escopo QA | Achados do eixo | Via `quality-assurance` |
| `qa-engineer` ★ | Perspectiva de critérios / regressão | Escopo QA | Achados do eixo | Via `quality-assurance` |
| `data-engineer` ★ | Perspectiva de dados / migrações | Escopo QA | Achados do eixo | Via `quality-assurance` |
| `security-engineer` ★ | Perspectiva de segurança | Escopo QA | Achados do eixo | Via `quality-assurance` |
| `devops-engineer` ★ | Perspectiva ops (QA) + entrega (Deploy) | Escopo QA ou Issue Deployment | Achados ou PR/nota G4 | Reuso; ver ADAPTATION-QA |

## Deployment (implementada em `skills/`)

| Skill | Responsabilidade | Entradas | Saídas | Notas |
|---|---|---|---|---|
| `devops-engineer` ★ | PR / entrega / go-no-go operacional (G4) | Issue Deployment (+ QA aprovada) | PR / nota + `AWAITING` G4 | Canônica em `skills/devops-engineer/`; reuso como perspectiva QA |

---

## Limites e sobreposições

| Tensão | Resolução |
|---|---|
| Catálogo inteiro no contexto | Progressive disclosure: só `sdlc-workflow` + fase atual + skills concretas necessárias |
| `sdlc-workflow` vs `*-phase` | Camada 0 = mapa global; camada 1 = menu da TAG; não misturar responsabilidades |
| `domain-modeling` local vs mattpocock | Pack do repo (`skills/domain-modeling`) é a canônica sob `planning-phase` |
| `code-review` vs `quality-assurance` | Review = dentro de Implement; QA = Issue TAG=QA separada |
| `prototype` vs Implement | Proto é throwaway em worktree; não substitui TDD de produto |
| `to-tickets` vs dependências | Tickets/Issues **independentes**; continuação = criar Issues ao fechar, não bloquear claim |
| `implement` vs agente default | `implement` é a orquestração; o harness default só executa sob essa skill |
| `devops-engineer` em QA e Deploy | Mesmo papel reutilizado; Deployment é a Issue que o invoca para entrega |

## Fora deste catálogo (de propósito)

- Skills de Maintenance / `diagnosing-bugs` (outro workflow)
- Instalação em Cursor/Claude/Codex/Pi (Issues futuras)
- Instalação automática em todos os harnesses além do contrato `skills/<nome>/SKILL.md` (opcional por harness)

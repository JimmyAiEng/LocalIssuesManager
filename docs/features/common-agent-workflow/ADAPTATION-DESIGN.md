# Adaptação mattpocock → skills Design (camada 2)

Issue: `9855f155` · TAG `Implement`. Fonte: [mattpocock/skills](https://github.com/mattpocock/skills) (`codebase-design`, `prototype`, `to-spec`, `to-tickets`).

## Entregue

| Skill | Path |
|---|---|
| `codebase-design` | `skills/codebase-design/` (+ `DEEPENING.md`, `DESIGN-IT-TWICE.md`) |
| `prototype` | `skills/prototype/` (+ `LOGIC.md`, `UI.md`) |
| `to-spec` | `skills/to-spec/SKILL.md` |
| `to-tickets` | `skills/to-tickets/SKILL.md` |

Disclosure: apenas via [`design-phase`](../../../skills/design-phase/SKILL.md).

## O que reaproveitamos

| Upstream | Uso |
|---|---|
| Glossário deep modules / seams | `codebase-design` |
| Design It Twice + deepening por categoria de dependência | Arquivos satélite |
| Ramos LOGIC vs UI do prototype | `LOGIC.md` / `UI.md` |
| Template de Spec (problem/solution/stories/…) | `to-spec` |
| Fatias verticais (tracer bullets) | `to-tickets` |

## O que mudamos

| mattpocock | Adaptação |
|---|---|
| Idioma EN | **pt-BR** |
| Proto na árvore do feature (ou branch throwaway genérica) | Proto **obrigatório em git worktree** (D03); não na default |
| `to-spec` publica no tracker + label `ready-for-agent` | Spec em **markdown no repo**; Issues só via `to-tickets` |
| `to-tickets` com **Blocked by** / grafo | Issues **independentes**; paralelo ok; continuação = criar Issues (D10) |
| Setup GitHub/Linear/`tickets.md` | **issues-local** (`issues create` / fila FIFO) |
| Skills user-invoked flat | Obtidas **após** `design-phase` (progressive disclosure) |
| Gate de direção implícito | Explícito após E (`codebase-design`); E/Proto opcionais por heurística da fase |

## Critérios cobertos

- [x] Quatro skills Design no pack
- [x] Prototype em worktree; E/Proto opcionais; gate de direção se houver E
- [x] `to-tickets` → Issues independentes no issues-local
- [x] Adaptação mattpocock (issues-local, pt-BR, workflow do usuário)
- [x] Disclosure só via `design-phase`

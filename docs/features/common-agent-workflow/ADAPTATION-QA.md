# Adaptação → skills QA (camada 2)

Issue: `7ed02fef` · TAG `Implement`. Fonte de práticas: [mattpocock/skills](https://github.com/mattpocock/skills) (padrão de eixos paralelos em `code-review`; `qa` deprecated **não** reutilizado).

## Entregue

| Skill | Path |
|---|---|
| `quality-assurance` | `skills/quality-assurance/SKILL.md` |
| `software-architect` | `skills/software-architect/SKILL.md` |
| `qa-engineer` | `skills/qa-engineer/SKILL.md` |
| `data-engineer` | `skills/data-engineer/SKILL.md` |
| `security-engineer` | `skills/security-engineer/SKILL.md` |
| `devops-engineer` | `skills/devops-engineer/SKILL.md` (modo QA + modo Deployment) |

Disclosure: apenas via [`qa-phase`](../../../skills/qa-phase/SKILL.md) (perspectivas). `devops-engineer` também via [`deployment-phase`](../../../skills/deployment-phase/SKILL.md) no modo entrega.

## O que reaproveitamos (mattpocock)

| Upstream | Uso |
|---|---|
| Eixos paralelos sem ranking único (`code-review`) | Orquestração multi-perspectiva em `quality-assurance` |
| Limite de tamanho / evidência por achado | Briefs ≤400 palavras; cite path/critério |
| Vocabulário de deep modules (via pack Design) | Perspectiva `software-architect` |

## O que é novo (★ / D14)

| Item | Motivo |
|---|---|
| Skill `quality-assurance` + 5 perspectivas nomeadas | Catálogo do workflow do usuário; mattpocock não tem equivalente ativo |
| `qa` deprecated (sessão conversacional + `gh issue create`) | Fora de escopo: Maintenance/bugs e tracker GitHub |
| Gate G3 + Issue TAG=`QA` | D11/D12 — distinto de review interno |
| Preferência de outro harness | D12 — recomendado, não obrigatório |
| `devops-engineer` reutilizado em Deployment | Mesmo papel; modos separados na skill |

## O que mudamos vs práticas genéricas

| Genérico / upstream | Adaptação |
|---|---|
| Idioma EN / trackers GitHub | **pt-BR** + **issues-local** (`AWAITING` + Decisão) |
| Um “QA approve” monolítico | Cinco seções + recomendação G3 agregada |
| Skills user-invoked flat | Obtidas **após** `qa-phase` (progressive disclosure) |
| Dependências entre tickets de retrabalho | Issues Implement **independentes** (D10) |

## Critérios cobertos

- [x] Skill `quality-assurance` orquestra validação multi-perspectiva
- [x] Subagents/prompts: architect, qa-engineer, data, security, devops
- [x] QA ≠ `code-review`; TAG=`QA`; outro harness recomendado
- [x] Adaptação mattpocock (padrão de eixos) + gaps ★; issues-local; pt-BR; workflow do usuário
- [x] Disclosure via `qa-phase` apenas (exceto reuso Deployment de `devops-engineer`)

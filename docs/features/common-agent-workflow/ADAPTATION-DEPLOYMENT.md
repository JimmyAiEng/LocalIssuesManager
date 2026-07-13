# Adaptação → skill Deployment (camada 2)

Issue: `0e648d2b` · TAG `Implement`. Fonte: práticas de entrega/PR do ecossistema [mattpocock/skills](https://github.com/mattpocock/skills) + ★ `devops-engineer` (novo; sem skill homônima upstream).

## Entregue

| Skill | Path |
|---|---|
| `devops-engineer` | `skills/devops-engineer/SKILL.md` |

Disclosure: apenas via [`deployment-phase`](../../../skills/deployment-phase/SKILL.md) no claim TAG=`Deployment`. Reuso como perspectiva sob pack QA (mesmo arquivo).

## O que reaproveitamos

| Prática / ideia | Uso |
|---|---|
| Forma `skills/<nome>/SKILL.md` + frontmatter | Idem |
| Fechamento com PR + summary / test plan | Modo Entrega |
| Handoff operacional (rollback, smoke) | Checklist + nota no PR/Issue |
| Papel “devops” em revisão multi-perspectiva | Modo Perspectiva (QA) |

## O que mudamos / criamos

| Upstream / default | Adaptação |
|---|---|
| (sem `devops-engineer` no mattpocock) | ★ Skill nova alinhada a `WORKFLOW.md` §D |
| Ship via labels GitHub/Linear | Gate **G4** = `AWAITING` + `issues decide --human` (D07) |
| Merge pelo agente | Só prepara PR/nota; humano go/no-go |
| EN | **pt-BR** |
| Tracker configurável | Fixo **issues-local** |
| Skill só de QA ou só de Deploy | Uma cópia; dois modos (Entrega / Perspectiva) |

## Critérios cobertos

- [x] Skill de Deployment cobre PR/entrega e handoff operacional (`devops-engineer`)
- [x] Gate G4 (go/no-go) refletido via issues-local (`AWAITING` → Decisão)
- [x] Adaptação: issues-local, pt-BR, workflow do usuário (D06–D07, D14)
- [x] Disclosure via `deployment-phase` apenas; reuso coerente com pack QA

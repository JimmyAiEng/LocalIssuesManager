# Adaptação mattpocock → skills Planning (camada 2)

Issue: `c547eb96` · TAG: Implement · Entrega: `wayfinder`, `research`, `domain-modeling`, `teach`, `handoff`.

Fonte: [mattpocock/skills](https://github.com/mattpocock/skills).

## O que reaproveitamos

| Upstream | Uso aqui |
|---|---|
| Forma `skills/<nome>/SKILL.md` + frontmatter | Idem em `skills/` |
| wayfinder: mapa + tickets de *decisão* + névoa | Mantido; mapa em Markdown no repo |
| research: fontes primárias + Markdown citado + background | Mantido |
| domain-modeling: CONTEXT/ADR lazy + disciplina ativa | Mantido + formatos |
| teach: workspace MISSION/lessons/resources/records | Mantido + formatos em pt-BR |
| handoff: doc temporário + skills sugeridas + redact | Mantido |

## O que mudamos (issues-local · pt-BR · workflow)

| mattpocock | Adaptação |
|---|---|
| Labels `wayfinder:*`, child issues, blocking nativo | Issue índice + arquivo mapa; tickets = Issues **irmãs independentes** (D10); fronteira ordenada no mapa |
| Claim por assignee | `issues next --agent <ia> --project <p>` (FIFO; sem claim por id) |
| HITL via conversa / labels AFK | HITL → `AWAITING` + `issues decide --human`; AFK research fecha com `CLOSED` quando permitido |
| `/grilling` + `/prototype` no wayfinder | `domain-modeling`; tipo `esboço` sem carregar `prototype` (fase Design) |
| Tracker configurável | Fixo **issues-local** |
| EN | **pt-BR** |
| domain-modeling duplicável com skill global do usuário | Pack do repo é a cópia canônica sob `planning-phase` |

## Disclosure

Só via [`planning-phase`](../../skills/planning-phase/SKILL.md). Skills de Design/Implement/QA/Deployment ficam fora deste claim.

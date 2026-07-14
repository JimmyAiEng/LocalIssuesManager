# Catálogo de skills — novo desenvolvimento

Status: catálogo vivo.
Todas as skills estão materializadas em `skills/`.

Decisão YAGNI (2026-07-13): o pack contém **apenas** skills que orientam o uso do workflow (fases, gates, entregáveis, issues-local).
Skills que ensinavam **como executar** cada fase (wayfinder, tdd, code-review, quality-assurance, perspectivas, etc.) foram removidas; a execução é decisão do agente.

Discovery: **progressive disclosure** em duas camadas (ver `WORKFLOW.md` §5).

---

## Camada 0 — sempre no contexto

| Skill | Responsabilidade | Entradas | Saídas | Notas |
|---|---|---|---|---|
| `sdlc-workflow` | Explicar o SDLC/workflow de novo desenvolvimento | Claim / Issue | Orientação de processo (estágios, gates, paralelismo, Review≠QA) | Em `skills/sdlc-workflow/`; **sempre** via `AGENTS.md` |

## Camada 1 — uma skill por fase

Só a skill do **tipo do Ticket** claimado é acionada.
Cada uma diz o objetivo da fase, o gate, as heurísticas de processo e como encerrar via issues-local.

| Skill | Tipo do Ticket | Gate |
|---|---|---|
| `planning-phase` | Planning | G1 |
| `design-phase` | Design | Direção (se houve exploração) + G2 |
| `implement-phase` | Implement | Revisão de fatia |
| `qa-phase` | QA | G3 |
| `deployment-phase` | Deploy | G4 |

## Fora deste catálogo (de propósito)

- Skills de execução (como pesquisar, desenhar, implementar, validar, entregar) — decisão do agente (YAGNI).
- Manutenção / bugfix não é fase: vira Issue de tipo `Fix`/`Refactor`, resolvida pelos Tickets adequados.

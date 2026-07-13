# Decisões — workflow comum de agentes

Issue: `8f78af65` · Projeto: `issue-manager` · TAG: Planning  
Artefato de debate: `.lavish/common-agent-workflow-debate.html`

## Decisões aceitas

| ID | Tema | Decisão |
|---|---|---|
| D01 | Planning a/b | Fundir em um único estágio Planning |
| D02 | Exploração / proto | Opcionais; só quando requisitos não bastam para especificar |
| D03 | Protótipo | Worktree; permitido antes e/ou depois do gate de direção |
| D04 | Quem decide E/Proto | Heurística no AGENTS.md (futuro) |
| D05 | Gate c→d | Se houver exploração, humano escolhe direção antes de especificar |
| D06 | Gates | G1 Planning · G2 Design · G3 QA · G4 Deploy (obrigatórios) |
| D07 | Gates ↔ Issues | Cada gate de fase = fechar/abrir Issue(s) |
| D08 | TDD | Agente segue sozinho; sem gate entre testes e código |
| D09 | Fatias Implement | Cada Issue entrega código funcional/integrável, revisável pelo humano |
| D10 | Independência | Issues **não** dependem das anteriores; podem rodar em **paralelo**; Issue grande encerra **criando** continuações |
| D11 | Review vs QA | Review interno ≠ QA; QA é Issue TAG=QA separada |
| D12 | Harness QA | Outro harness/modelo recomendado, não obrigatório |
| D13 | Discovery | AGENTS.md + skill pack por harness |
| D14 | Catálogo | Adaptar mattpocock/skills + `quality-assurance`/subagents novos |
| D15 | Maintenance | Fora deste workflow |
| D16 | Escopo desta Issue | Especificar workflow + catálogo; **não** implementar AGENTS.md nem skills |
| D17 | Progressive disclosure | Camada 0 `sdlc-workflow` sempre no contexto (via AGENTS.md); camada 1 `*-phase` por TAG faz disclosure; camada 2 = skills concretas obtidas sob demanda até completar a Issue |

## Rejeitado / corrigido

| Item | Motivo |
|---|---|
| Implementação imediata de `AGENTS.md`/`SKILLS.md` pelo agente `pi` | Humano pediu retorno ao debate; materialização prematura |
| Issues encadeadas com dependência obrigatória | Substituído por D10 (independência + paralelismo) |

## Pendências

| Item | Estado |
|---|---|
| Revisão humana do rascunho + Decisão G1 | Issue `8f78af65` em **AWAITING** |
| `af26b0dc` AGENTS.md + discovery | **AWAITING** — pack portátil `AGENTS.md` + `skills/` (+ `INSTALL.md`) para qualquer projeto/harness |
| `c547eb96` skills Planning | **AWAITING** — `wayfinder`, `research`, `domain-modeling`, `teach`, `handoff` |
| `9855f155` skills Design | **AWAITING** — `codebase-design`, `prototype` (worktree), `to-spec`, `to-tickets` |
| `658c5c36` skills Implement | **AWAITING** / materializada — `implement`, `tdd`, `code-review` |
| `7ed02fef` skills QA | **AWAITING** — `quality-assurance` + 5 perspectivas; ver `ADAPTATION-QA.md` |
| `0e648d2b` skills Deployment | **AWAITING** — `devops-engineer` (+ G4 via issues-local) |

Adaptação comum nas Issues Implement: analisar mattpocock/skills e adaptar para **issues-local**, **pt-BR** e o **workflow do usuário** (este pacote de docs).

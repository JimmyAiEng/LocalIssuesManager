# ADR 0005 — Modelo Issue-only: remoção do Ticket

Data: 2026-07-17. Status: aceito. Substitui o modelo Issue+Ticket dos ADRs 0001–0004 no que conflitar.

## Contexto

O modelo Issue (agregado) + Tickets (fatias) gerou sobrecarga humana: issues grandes, muitos gates intermediários e um fluxo travado (Confirmation, phaseBlocker, autonomia derivada por ticket).
A unidade de trabalho real de uma sessão de agente é pequena e tem uma entrega única.

## Decisão

- **Não existe Ticket.** A Issue é a unidade de trabalho: `type` (Fix/Feat/Research/Refactor) diz o problema e `action` (Planning/Design/Implement/QA/Deploy) diz a entrega esperada.
- Status reduzido: `OPEN → CLAIMED → (AWAITING →) CLOSED` (sem `ON-GOING`, sem `Confirmation`).
- Trabalho maior vira novas Issues **relacionadas** (`relates`): a view e o prompt carregam os artefatos das relacionadas (linhagem/herança de contexto).
Não há validação de sequência entre actions.
- **Gates por action na conclusão pela IA**: Planning exige requisitos Gherkin (≤5 Features); Design exige `design.md` + ≥1 `.puml` válido; Implement exige worktree e o `check` configurado do projeto passando (pre-close hook); QA/Deploy sem validação por enquanto.
- **Autonomia**: `requiresHuman()` = `human_need=HITL` ∨ `risk=ALTO` ∨ `complexity=ALTA`.
Fora disso a IA fecha direto, sempre com **evidência** (relatório curto) obrigatória.
A tabela `AUTONOMY_TRIGGERS` foi removida.
- **Limite de tamanho**: todo texto ≤300 palavras (`assertBrief`); estourou = Issue grande demais, o erro orienta fechar e decompor.
- **Projetos registrados** (`project.json`: name, repo, check): Issues só nascem em projeto registrado; a worktree usa o repo do projeto.

## Consequências

- CLI e Web reduzidas (sem subcomando `ticket`, sem rotas `/tickets`); design/requirements passam a ser keyed por `issueId`.
- Skills reescritas: roteamento por `action`; `issue-qualification` e `confirmation-phase` extintas.
- Dados antigos (Issues com `tickets[]`) são incompatíveis e foram descartados.

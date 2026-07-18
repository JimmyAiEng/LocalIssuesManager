# ADR 0006 — Modelo de domínio v4: Workflow, Artifact unificado e GatePolicy

Data: 2026-07-18. Status: aceito. Refina o modelo Issue-only do ADR 0005 sem mudar comportamento.

## Contexto

O comportamento do workflow está espalhado no código: gates por action em três arquivos e duas camadas (`design_gate.ts`, `implement_gate.ts`, `requirements_use_cases.ts`), cinco famílias de armazenamento duplicadas na Queue (artefato `.md`, design, requirements, prd, attachments) e a autonomia (`requiresHuman`) como mecanismo paralelo aos gates.
O diagrama `docs/AIDevelopmentWorkfow.drawio` é a fonte das regras, mas nenhum conceito do código o representa.

## Decisão

- **Workflow** vira conceito de domínio, selecionado pela `action` da Issue: define os Artifact Types exigidos e a GatePolicy da conclusão.
**Não é persistido** — a jornada é a linhagem (`relates`) até o problema original ser resolvido; as regras vêm do diagrama.
- **Artifact unificado**: doc `.md`, PRD, requirements, design, plan e media viram um só conceito com Artifact Type e regras por tipo (≤300 palavras nos textuais, ≤25MB nos media).
Reverte a separação Artefato ≠ anexo do vocabulário anterior.
- **GatePolicy** substitui "gate de conclusão" e **subsume a autonomia**: avaliada na conclusão pela IA, com três desfechos — aprovada (autoriza `CLOSED`, sem impedir escalonamento voluntário para `AWAITING`), exige decisão humana (somente `AWAITING`; HITL ∨ risco ALTO ∨ complexidade ALTA) ou reprovada (bloqueia).

## Alternativas rejeitadas

- Workflow como agregado persistido (jornada com identidade própria): estado novo sem necessidade — a linhagem já materializa a jornada.
- Manter attachments fora do Artifact: preservaria o vocabulário do ADR 0005, mas perpetua cinco famílias de armazenamento idênticas.
- GatePolicy só validação (autonomia à parte): dois mecanismos respondendo "a IA pode concluir?" em lugares diferentes.

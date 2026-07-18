---
name: design-phase
description: >-
  Action Design do workflow: explorar desenho se preciso, congelar a spec com
  diagramas PlantUML e preparar as Issues seguintes. Use quando a Issue
  reivindicada tem action=Design.
---

Seu objetivo é congelar a spec da solução e deixá-la herdável pelas Issues seguintes.

## Heurísticas

- **Explorar desenho** (opcional): só se os requisitos não bastarem para especificar; apresente opções + trade-offs e peça a direção ao humano antes de congelar.
- **Prototipar** (opcional): artefato **descartável** em worktree; não vira produto.
- Quanto maior o risco/complexidade, mais alinhamento antes de congelar a spec.
- Fatie o trabalho seguinte em Issues `Implement` pequenas e **relacionadas a esta** (`--relates <esta>`): cada uma deve entregar uma fatia funcional/integrável.
- **Como** desenhar e especificar é decisão do agente.

## Entrega (gate de conclusão)

A spec é o **pacote de design da Issue**.
A **decisão de arquitetura** define o caminho e é obrigatória para concluir:

- `issues design changed --issue <id> --value true|false` — declara se a arquitetura muda.
Com `true`, o gate exige os **4 níveis** de diagramas (High Level, Package, Class, Interface/DataModel) com PlantUML válido e o aceite é **humano** (nunca fecha AFK — só `AWAITING`, análogo ao Deploy).
Com `false`, os diagramas são dispensados: basta o **plano de implementação** (atalho direto ao Implementation Plan).
Sem a decisão, a conclusão falha com `decision_required`.

Mapeamento kind→nível: `component`/`deployment` → **High Level**; `package` → **Package**; `class` → **Class**; `activity`/`state` → **Interface/DataModel**.

- `issues design doc --issue <id> --file <design.md>` — grava o `design.md` (vazio ou >300 palavras é rejeitado).
- `issues design add --issue <id> --kind <class|component|package|activity|state|deployment> --file <d.puml>` — adiciona um diagrama PlantUML (só quando a arquitetura muda).
A sintaxe é validada fail-fast e o kind deve corresponder ao tipo do diagrama; regravar o mesmo kind substitui.
- `issues plan set --id <id> --file <plan.json>` — grava o **plano de implementação** validado por código.
O JSON precisa de `objetivo`, `passos` (ordenados), `arquivos` (afetados) e `criterio_pronto`; erros são acumulados e nada é gravado se inválido.
- `issues get DESIGN --id <id>` — consulta o pacote com `architecture_changed`, `validation.ready` e os erros do gate.
- `issues get PLAN --id <id>` — consulta o plano persistido.

Registre também um resumo no Artefato (`issues artifact`): é ele que viaja no prompt das Issues relacionadas.
O plano viaja junto: a Issue `Implement` filha recebe o plano do Design pai no prompt de `issues next --prompt`.

## Decomposição obrigatória (fan-out N→N×M)

O gate exige **ao menos uma filha `action=Implement`** (uma por Small Plan) antes de fechar.
Fatie o Design em Implements pequenos e crie-os de uma vez: `issues decompose --id <id> --into <arquivo.json> --agent <ia>`.
Formato: `{ "mode": "concurrent|sequential", "children": [{ "title", "type", "action": "Implement", "problem", "acceptance_criteria?", "plan": { "objetivo", "passos", "arquivos", "criterio_pronto" } }] }`.
Cada filha Implement traz o seu **Small Plan** no campo `plan` (mesmo formato do Implementation Plan): ele é persistido como o plano da filha e **prevalece** no prompt dela (`## Small Plan desta Issue`), enquanto o plano completo do Design pai continua disponível como contexto de linhagem.
`decompose` grava a linhagem parent/child recíproca; `mode: sequential` encadeia as filhas (see-also), `concurrent` (default) deixa-as independentes.

## Encerramento

Conclua com a evidência (as filhas Implement já foram criadas pelo `decompose`):
`issues status --id <id> --agent <ia> --status AWAITING|CLOSED --comment "<evidência>" [--reason concluido]`.
**Gate**: sem a decisão de arquitetura (`architecture_changed`), sem plano válido (`plan.json`) e **sem ao menos uma filha Implement**, o comando sai com exit 1 e JSON `{"errors":[…]}` no stderr; a Issue permanece no status atual.
Com `architecture_changed=true`, o gate ainda exige `design.md` + os 4 níveis cobertos por PlantUML válido e só aceita `AWAITING` (o fechamento é do humano, via `decide` no web).

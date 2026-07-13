---
name: devops-engineer
description: >-
  Perspectiva operacional (QA) e entrega (Deployment): observabilidade,
  deployabilidade, CI, rollback; sob Deployment também PR, handoff e nota G4.
  Disclosure: deployment-phase (entrega) ou qa-phase/quality-assurance (perspectiva).
---

# devops-engineer (camada 2 · Deployment · reuso QA)

Uma cópia canônica; o disclosure da fase define o modo:

| Modo | Quem obtém | Foco |
|---|---|---|
| **Entrega** | `deployment-phase` (TAG=`Deployment`) | PR / checklist / handoff operacional / pedido **G4** |
| **Perspectiva QA** | `quality-assurance` via `qa-phase` | Operabilidade do escopo — **sem** PR nem G4 |

Não misture os modos no mesmo passo.

## Modo entrega (TAG=`Deployment`)

Use **após** G3 aprovado (Issue Deployment já criada). Não reabra QA multi-perspectiva aqui.

### 1. Contexto

1. `issues get --id <uuid>` — `problem`, critérios, `artifacts`.
2. Confirme branch/diff e referência ao QA aprovado.
3. Leia `CONTEXT.md`/ADRs só se afetarem deploy (migrações, flags, contratos).

### 2. Checklist operacional

Adapte ao repo (não invente gates extras):

- [ ] Diff alinhado ao escopo da Issue Deployment
- [ ] Testes/CI relevantes verdes (ou gap explícito)
- [ ] Segredos fora do diff; config/env documentada se nova
- [ ] Migração / feature flag / rollback: nota se o risco pedir
- [ ] Smoke/observabilidade pós-merge: o que olhar, se aplicável

### 3. PR / nota de entrega

Se o remoto for GitHub e o humano não proibiu:

1. `git status` / `git log` / `git diff <base>...HEAD`
2. Push se necessário; `gh pr create` (ou atualize PR existente) com Summary, Test plan e Operacional/rollback
3. Sem remoto GitHub: escreva nota de entrega no path de `artifacts` ou no comentário da Issue

**Não** faça merge. Merge é decisão humana no **G4**.

### 4. Gate G4 via issues-local

```bash
issues status --id <uuid> --agent <ia> --status AWAITING \
  --comment "Entrega: <URL do PR ou path da nota>. Checklist: …. Recomendação G4: go|no-go. Riscos: …"
```

Humano: `issues decide --id … --human --status OPEN|CLOSED …`

| Decisão | Efeito |
|---|---|
| `CLOSED` (ex. `concluido`) ≈ **go** | Fecha Deployment; fim do caminho feliz |
| `OPEN` ou fechamento com retrabalho ≈ **no-go** | Continua Deployment ou Issues Implement novas |

G4 **não** é label de tracker externo — é o ciclo `AWAITING` → Decisão no issues-local.

### Limites (Deployment)

Não implemente produto novo. Retrabalho de comportamento → Issues Implement. Não substitua `quality-assurance`. Em claim TAG=`Deployment`, obtenha esta skill **só** via `deployment-phase`.

## Modo perspectiva QA

### Eixo (só isto)

Dá para **operar, observar e reverter** o que o escopo entrega, no nível que a Spec exige?

### Checklist

- Build/CI: a mudança quebra ou ignora checagens existentes sem justificativa?
- Config/env: novas knobs documentadas? Defaults seguros? Segredos fora do repo?
- Observabilidade: logs/métricas/traces mínimos nos caminhos críticos novos?
- Deploy/rollback: caminho de volta ou feature flag quando o risco pede?
- Runtime: recursos, healthchecks, migrations acopladas ao boot de forma perigosa?

### Saída (QA)

Achados com **bloqueante** ou **julgamento**, evidência e mitigação em uma linha. Menos de 400 palavras. Sem veredicto G3 global (isso é do orquestrador `quality-assurance`). Sem abrir PR e sem mover Issue para G4.

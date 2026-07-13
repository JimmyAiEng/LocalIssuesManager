# AGENTS.md — pack de discovery (novo desenvolvimento)

**Entregável portátil.** Este arquivo + a pasta `skills/` formam o pack de progressive disclosure do workflow de novo desenvolvimento. Destino: **qualquer projeto** e os harnesses `cursor` · `claude-code` · `codex` · `pi`.

Não é específico deste repositório produtor. Instale o pack no projeto consumidor (ver `skills/INSTALL.md`).

- Idioma: **pt-BR**
- Tracker: **issues-local** (CLI `issues`)
- Glossário do projeto consumidor (se existir): `CONTEXT.md`

---

## Sempre no contexto (camada 0)

Antes de trabalhar Issues de **novo desenvolvimento**, leia e siga:

→ [`skills/sdlc-workflow/SKILL.md`](skills/sdlc-workflow/SKILL.md)

Camada 0: estágios, gates, paralelismo, Review≠QA. **Não** carregue o catálogo inteiro de skills de uma vez.

---

## Ao claimar uma Issue (camada 1)

1. Claim via issues-local (tabela abaixo).
2. Leia a **TAG** da Issue claimada.
3. Acione **somente** a skill de fase correspondente:

| TAG | Skill de fase |
|---|---|
| `Planning` | [`skills/planning-phase/SKILL.md`](skills/planning-phase/SKILL.md) |
| `Design` | [`skills/design-phase/SKILL.md`](skills/design-phase/SKILL.md) |
| `Implement` | [`skills/implement-phase/SKILL.md`](skills/implement-phase/SKILL.md) |
| `QA` | [`skills/qa-phase/SKILL.md`](skills/qa-phase/SKILL.md) |
| `Deployment` | [`skills/deployment-phase/SKILL.md`](skills/deployment-phase/SKILL.md) |
| `Maintenance` | Fora deste workflow |

4. A fase faz o **disclosure** das skills concretas (camada 2). Obtenha só as necessárias para **esta** Issue.
5. Skills de outras fases ficam fora do contexto.

Caminhos acima são relativos à **raiz do projeto onde o pack foi instalado**.

---

## Issues-local — contexto mínimo

Dados em `~/issues-manager` (ou `ISSUES_ROOT`). Saída JSON; use `--pretty` se precisar ler.

| Comando | Quem | Efeito |
|---|---|---|
| `issues next --agent <ia>` | IA | Claim FIFO → `CLAIMED` |
| `issues next --agent <ia> --project <p>` | IA | Idem, filtrado por projeto |
| `issues get --id <uuid>` | qualquer | Detalhe completo |
| `issues list [--status|--project|--title|--tag|--limit|--offset]` | qualquer | Listagem |
| `issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"` | owner | `CLAIMED` → `AWAITING` |
| `issues status --id <uuid> --agent <ia> --status CLOSED --reason <motivo> --comment "…"` | IA | Fecha `OPEN` **sem** human_presence |
| `issues create … --human` \| `--agent <ia>` | humano/IA | Nova Issue |
| `issues decide --id <uuid> --human --status OPEN\|CLOSED --comment "…" [--reason …]` | humano | Decisão em `AWAITING` |
| `issues reset --id <uuid> --human --comment "…"` | humano | `CLAIMED` → `OPEN` |

Agentes: `cursor` · `claude-code` · `codex` · `pi`  
Motivos: `obsoleto` · `duplicado` · `concluido` · `errado`  
TAGs (imutáveis): `Planning` · `Design` · `Implement` · `QA` · `Deployment` · `Maintenance`

```text
humano: create (--human)
IA:     next --agent <ia>     → CLAIMED
IA:     status … AWAITING     → AWAITING
humano: decide OPEN|CLOSED
```

`next` é **FIFO** (`status_changed_at` entre OPENs). Não há claim por `--id`.

---

## Regras rápidas

- Issues **independentes**; paralelo ok; Issue grande fecha **criando** continuações.
- Gate humano = fechar Issue(s) da TAG atual e abrir a(s) da próxima.
- Review interno (Implement) **≠** QA (TAG=`QA`).
- Manutenção / bugfix: outro workflow — não use `*-phase` deste pack.
- Camadas 0+1 (discovery) e camada 2 (Planning → Deployment) estão neste pack em `skills/<nome>/SKILL.md`. Obtenha concretas só via a skill `*-phase` da TAG.

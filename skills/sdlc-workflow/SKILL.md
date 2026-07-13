---
name: sdlc-workflow
description: >-
  SDLC de novo desenvolvimento com issues-local: estágios, gates, paralelismo,
  Review≠QA e progressive disclosure de skills. Use ao claimar ou trabalhar
  qualquer Issue de novo desenvolvimento, antes da skill de fase.
---

# sdlc-workflow (camada 0)

Mapa global do workflow. **Não** executa a fase — só orienta o processo.  
Válido em **qualquer projeto** que use este pack + issues-local.

## Caminho feliz

**Obrigatório:** Planning → Spec (Design) → Implement → QA → Deployment.

**Opcionais** (heurística na skill de fase): Explorar desenho · Prototipar em worktree.

```text
P Planning ──G1──► [E explorar?] ──► [Proto?] ──► S Spec ──G2──► I Implement* ──► Q QA ──G3──► D Deploy ──G4──► fim
```

`*` Implement = uma ou mais Issues independentes (paralelo ok).

## Estágios ↔ TAG

| Estágio | TAG | Obrigatório? |
|---|---|---|
| Planning (problema, RF/RNF, domínio) | `Planning` | sim |
| Explorar desenho / Prototipar | `Design` | não |
| Especificar + fatiar Issues | `Design` | sim |
| Implementar (TDD + review interno) | `Implement` | sim |
| QA multi-perspectiva | `QA` | sim |
| Deploy / PR / go-no-go | `Deployment` | sim |

`Maintenance` está **fora** deste workflow.

## Gates humanos

| Gate | Após | Efeito |
|---|---|---|
| G1 | Planning | Fecha Planning → abre Design |
| Direção | E (se houve) | Humano escolhe opção antes de Spec |
| G2 | Spec | Fecha Design → abre Implement |
| Fatia | cada Implement | Aceita fatia ou pede continuação |
| G3 | QA | Aprova → Deployment; reprova → novas Issues Implement |
| G4 | Deployment | Go / no-go de merge |

Retrabalho: `decide OPEN` ou fecha e cria Issue nova. Não há reopen de `CLOSED`.

## Independência e paralelismo

- Issues **não** têm dependência obrigatória de claim.
- Paralelo entre Issues é permitido quando fizer sentido.
- Issue grande → fecha **criando** continuações; não bloqueia a fila.

## Review ≠ QA

- **Review interno** (`code-review`) roda dentro de Implement; não substitui QA.
- **QA** é Issue com TAG=`QA`; outro harness/modelo é recomendado, não obrigatório.

## Progressive disclosure (obrigatório)

```text
AGENTS.md
  └─ sdlc-workflow          (camada 0 — este arquivo; sempre)
        └─ <tag>-phase      (camada 1 — só a TAG claimada)
              └─ skills…    (camada 2 — sob demanda, instaladas no projeto)
```

1. Já está em camada 0.
2. TAG da Issue → skill `*-phase` (tabela no `AGENTS.md` do projeto).
3. Obtenha só as skills concretas que a fase divulgar para **esta** Issue.
4. Não carregue skills de outras fases neste claim.

## Issues-local

Sintaxe e ciclo de vida dos comandos: tabela do `AGENTS.md` (fonte única) ou `issues --help`.

## Critério de conclusão

Agente sabe: caminho feliz, gates, independência, Review≠QA, e o próximo passo é a skill de fase da TAG — sem puxar o catálogo inteiro.

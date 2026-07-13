---
name: planning-phase
description: >-
  Disclosure da fase Planning (pack portátil issues-local): skills concretas
  permitidas e entregáveis. Use ao claimar Issue com TAG=Planning (camada 1).
---

# planning-phase (camada 1)

Acionada só quando a Issue claimada tem **TAG=`Planning`**.

## Objetivo

Alinhar problema, requisitos e domínio. Gate **G1**: humano aceita → fecha Planning → abre Design.

## Skills permitidas (camada 2) — obter sob demanda

| Skill | Quando obter |
|---|---|
| [`wayfinder`](../wayfinder/SKILL.md) | Escopo grande demais para uma sessão; mapear Issues de decisão |
| [`research`](../research/SKILL.md) | Precisa de fontes confiáveis citadas |
| [`domain-modeling`](../domain-modeling/SKILL.md) | Afiar linguagem ubíqua / ADRs / `CONTEXT.md` do projeto |
| [`teach`](../teach/SKILL.md) | Humano pediu ensino do conceito em sessões |
| [`handoff`](../handoff/SKILL.md) | Troca de harness/sessão no meio do trabalho |

**Não** carregue skills de Design/Implement/QA/Deployment neste claim.

Obtenha só as concretas necessárias a **esta** Issue. Se algum `SKILL.md` estiver ausente no projeto consumidor, registre a lacuna em `AWAITING`. Adaptação (repo produtor): `docs/features/common-agent-workflow/ADAPTATION-PLANNING.md`.

## Heurísticas

- Preferir fatias revisáveis; mapa grande → `wayfinder` e/ou continuações.
- TAG é imutável; avanço de fase = fechar + criar Issue nova.

## Saídas

Problema/requisitos aceitos; `CONTEXT.md`/ADRs se necessário; handoff se houve troca de agente.

## Encerramento

`issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"`.

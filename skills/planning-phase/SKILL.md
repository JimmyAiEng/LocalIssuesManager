---
name: planning-phase
description: >-
  Disclosure da fase Planning: skills concretas permitidas e entregáveis.
  Use ao claimar Issue com TAG=Planning.
---

# planning-phase (camada 1)

Acionada só quando a Issue claimada tem **TAG=`Planning`**.

## Objetivo

Alinhar problema, requisitos e domínio. Gate **G1**: humano aceita → fecha Planning → abre Design.

## Skills permitidas (camada 2) — obter sob demanda

| Skill | Quando obter |
|---|---|
| `wayfinder` | Escopo grande demais para uma sessão; mapear Issues de decisão |
| `research` | Precisa de fontes confiáveis citadas |
| `domain-modeling` | Afiar linguagem ubíqua / ADRs / `CONTEXT.md` do projeto |
| `teach` | Humano pediu ensino do conceito em sessões |
| `handoff` | Troca de harness/sessão no meio do trabalho |

Obtenha só as concretas necessárias a **esta** Issue.
Se alguma skill acima estiver ausente no projeto, registre a lacuna em `AWAITING`.

## Heurísticas

- Preferir fatias revisáveis; mapa grande → `wayfinder` e/ou continuações.
- TAG é imutável; avanço de fase = fechar + criar Issue nova.

## Saídas

Problema/requisitos aceitos; `CONTEXT.md`/ADRs se necessário; handoff se houve troca de agente.

## Encerramento

`issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"`.

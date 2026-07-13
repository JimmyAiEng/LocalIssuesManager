---
name: design-phase
description: >-
  Disclosure da fase Design (pack portátil issues-local): E/Proto opcionais,
  Spec obrigatória, skills permitidas. Use ao claimar Issue com TAG=Design (camada 1).
---

# design-phase (camada 1)

Acionada só quando a Issue claimada tem **TAG=`Design`**.

## Objetivo

Congelar spec e fatiar trabalho em Issues **independentes**. Gate **G2**: humano aceita → fecha Design → abre Implement.

## Skills permitidas (camada 2) — obter sob demanda

| Skill | Quando obter |
|---|---|
| [`codebase-design`](../codebase-design/SKILL.md) | Requisitos **não** bastam para especificar; seams / trade-offs estruturais |
| [`prototype`](../prototype/SKILL.md) | Validar pergunta de desenho com artefato **descartável** em worktree |
| [`to-spec`](../to-spec/SKILL.md) | Sintetizar alinhamento em spec |
| [`to-tickets`](../to-tickets/SKILL.md) | Fatiar em Issues independentes (sem grafo de dependência obrigatória) |

**Não** carregue skills de Planning/Implement/QA/Deployment neste claim.

Se alguma skill concreta acima estiver ausente no projeto consumidor, registre a lacuna em `AWAITING`.

## Heurísticas E / Proto

- **E:** só se requisitos forem insuficientes para Spec; depois, gate de **direção** (humano escolhe) antes de Spec.
- **Proto:** worktree; antes e/ou depois do gate de direção; throwaway — não vira produto.
- Se requisitos bastam → `to-spec` / `to-tickets`.

## Saídas

Spec aceita; Issues Implement (e outras se preciso) via issues-local, paralelizáveis.

## Encerramento

`issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"`.

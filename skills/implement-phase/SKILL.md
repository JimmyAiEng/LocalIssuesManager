---
name: implement-phase
description: >-
  Disclosure da fase Implement (pack portátil issues-local): TDD, review interno,
  skills permitidas. Use ao claimar Issue com TAG=Implement (camada 1).
---

# implement-phase (camada 1)

Acionada só quando a Issue claimada tem **TAG=`Implement`**.

## Objetivo

Entregar fatia **funcional/integrável** via TDD e review interno. Humano revisa a fatia. Quando o conjunto Implement acordado estiver feito, abre-se Issue(s) **QA**.

## Skills permitidas (camada 2) — obter sob demanda

| Skill | Quando obter |
|---|---|
| [`implement`](../implement/SKILL.md) | Orquestrar a fatia (TDD + review) conforme spec/ticket |
| [`tdd`](../tdd/SKILL.md) | Red-green-refactor — **sem** gate humano entre red e green |
| [`code-review`](../code-review/SKILL.md) | Review **interno** (standards + fidelidade à spec) — **≠** QA |

**Não** carregue skills de Planning/Design/QA/Deployment neste claim.

Se alguma skill concreta acima estiver ausente no projeto consumidor, registre a lacuna em `AWAITING`.

## Heurísticas

- Cada Issue = código integrável, revisável pelo humano.
- Issue grande → fecha **criando** continuações; paralelo ok.
- `code-review` não substitui Issue TAG=`QA`.

## Saídas

Código + testes da fatia; achados de review tratados ou registrados.

## Encerramento

`issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"`.

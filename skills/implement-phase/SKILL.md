---
name: implement-phase
description: >-
  Disclosure da fase Implement: TDD, review interno, skills permitidas.
  Use ao claimar Issue com TAG=Implement.
---

# implement-phase (camada 1)

Acionada só quando a Issue claimada tem **TAG=`Implement`**.

## Objetivo

Entregar fatia **funcional/integrável** via TDD e review interno. Humano revisa a fatia. Quando o conjunto Implement acordado estiver feito, abre-se Issue(s) **QA**.

## Skills permitidas (camada 2) — obter sob demanda

| Skill | Quando obter |
|---|---|
| `implement` | Orquestrar a fatia (TDD + review) conforme spec/ticket |
| `tdd` | Red-green-refactor — **sem** gate humano entre red e green |
| `code-review` | Review **interno** (standards + fidelidade à spec) — **≠** QA |

Se alguma skill acima estiver ausente no projeto, registre a lacuna em `AWAITING`.

## Heurísticas

- Cada Issue = código integrável, revisável pelo humano.
- Issue grande → fecha **criando** continuações; paralelo ok.
- `code-review` não substitui Issue TAG=`QA`.

## Saídas

Código + testes da fatia; achados de review tratados ou registrados.

## Encerramento

`issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"`.

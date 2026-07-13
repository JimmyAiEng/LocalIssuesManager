---
name: deployment-phase
description: >-
  Disclosure da fase Deployment: PR/entrega/go-no-go.
  Use ao claimar Issue com TAG=Deployment.
---

# deployment-phase (camada 1)

Acionada só quando a Issue claimada tem **TAG=`Deployment`**.

## Objetivo

PR / entrega / handoff operacional. Gate **G4**: go / no-go de merge.

## Skills permitidas (camada 2) — obter sob demanda

| Skill | Quando obter |
|---|---|
| `devops-engineer` | PR, checklist de entrega, handoff operacional e nota go/no-go (G4) |

A mesma skill `devops-engineer` pode ser reutilizada como perspectiva sob QA (`quality-assurance`); em Deployment ela roda no **modo Entrega**.

Se a skill não estiver instalada no projeto, registre a lacuna em `AWAITING`.

## Heurísticas

- Fluxo feliz: após G3 aprovado (Issue Deployment já criada pelo gate).
- Retrabalho de produto → Issues Implement, não esta fase.
- Não faça merge: prepare PR/nota e peça G4 via `AWAITING`.

## Saídas

PR e/ou nota de entrega; pedido explícito de G4 no comentário.

## Encerramento

`issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"`.

---
name: qa-phase
description: >-
  Disclosure da fase QA: validação multi-perspectiva ≠ review de Implement.
  Use ao claimar Issue com TAG=QA.
---

# qa-phase (camada 1)

Acionada só quando a Issue claimada tem **TAG=`QA`**.

## Objetivo

Validação multi-perspectiva. Gate **G3**: humano aprova → Deployment; reprova → novas Issues Implement.

## Skills permitidas (camada 2) — obter sob demanda

| Skill | Quando obter |
|---|---|
| `quality-assurance` | Orquestrar validação e veredicto |
| `software-architect` | Perspectiva de arquitetura / seams (via QA) |
| `qa-engineer` | Perspectiva de critérios / regressão |
| `data-engineer` | Perspectiva de dados / migrações |
| `security-engineer` | Perspectiva de segurança |
| `devops-engineer` | Perspectiva operacional (modo QA) |

**Não** trate isto como `code-review` de Implement.
A exceção de fase é `devops-engineer`, permitida aqui no **modo perspectiva QA**.

Obtenha o orquestrador e as perspectivas necessárias a **esta** Issue.
Se alguma skill acima estiver ausente no projeto, registre a lacuna em `AWAITING`.

## Heurísticas

- Preferir **outro** harness/modelo que o da Implement — recomendado, não obrigatório.
- Retrabalho: `decide OPEN` ou fecha e cria Issues Implement novas (independentes).
- Perspectivas em paralelo quando o harness permitir; seções de relatório **nunca** fundidas num ranking único.

## Saídas

Veredicto + achados por eixo; pedido claro de G3 no comentário.

## Encerramento

`issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"`.

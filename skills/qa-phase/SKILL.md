---
name: qa-phase
description: >-
  Disclosure da fase QA (pack portátil issues-local): validação multi-perspectiva
  ≠ review de Implement. Use ao claimar Issue com TAG=QA (camada 1).
---

# qa-phase (camada 1)

Acionada só quando a Issue claimada tem **TAG=`QA`**.

## Objetivo

Validação multi-perspectiva. Gate **G3**: humano aprova → Deployment; reprova → novas Issues Implement.

## Skills permitidas (camada 2) — obter sob demanda

| Skill | Quando obter |
|---|---|
| [`quality-assurance`](../quality-assurance/SKILL.md) | Orquestrar validação e veredicto |
| [`software-architect`](../software-architect/SKILL.md) | Perspectiva de arquitetura / seams (via QA) |
| [`qa-engineer`](../qa-engineer/SKILL.md) | Perspectiva de critérios / regressão |
| [`data-engineer`](../data-engineer/SKILL.md) | Perspectiva de dados / migrações |
| [`security-engineer`](../security-engineer/SKILL.md) | Perspectiva de segurança |
| [`devops-engineer`](../devops-engineer/SKILL.md) | Perspectiva operacional (modo QA) |

**Não** trate isto como [`code-review`](../code-review/SKILL.md) de Implement.

**Não** carregue skills de Planning/Design/Implement/Deployment neste claim (exceto [`devops-engineer`](../devops-engineer/SKILL.md) no **modo perspectiva QA**).

Obtenha o orquestrador e as perspectivas necessárias a **esta** Issue. Se algum `SKILL.md` estiver ausente, registre a lacuna em `AWAITING`. Adaptação (repo produtor): `docs/features/common-agent-workflow/ADAPTATION-QA.md`.

## Heurísticas

- Preferir **outro** harness/modelo que o da Implement — recomendado, não obrigatório (D12).
- Retrabalho: `decide OPEN` ou fecha e cria Issues Implement novas (independentes).
- Perspectivas em paralelo quando o harness permitir; seções de relatório **nunca** fundidas num ranking único.

## Saídas

Veredicto + achados por eixo; pedido claro de G3 no comentário.

## Encerramento

`issues status --id <uuid> --agent <ia> --status AWAITING --comment "…"`.

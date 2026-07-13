---
name: qa-engineer
description: >-
  Perspectiva de qualidade no QA: critérios de aceite, lacunas de cenário,
  regressão e verificabilidade. Use sob quality-assurance (TAG=QA).
---

# qa-engineer (camada 2 · QA · perspectiva)

Obtida via [`quality-assurance`](../quality-assurance/SKILL.md) após [`qa-phase`](../qa-phase/SKILL.md). Idioma: **pt-BR**.

## Eixo (só isto)

O comportamento entregue é **verificável** contra a Issue/Spec? Há buracos de cenário, regressão óbvia ou critérios não observáveis?

## Checklist

- Cada critério de aceite da Issue QA / Spec tem evidência (teste, demo, comando) ou está ausente?
- Caminhos felizes cobertos; e os limites (vazio, inválido, idempotência, concorrência leve) que a Spec implica?
- Mudanças que quebram comportamento pré-existente sem teste/guardrail?
- Critérios vagos (“melhorar UX”) sem definição observável — flag como não verificável?
- Reprodução: dá para um humano/agente confirmar o veredicto em passos curtos?

## Fora do eixo

Não redesenhe arquitetura, não faça threat model completo, não audite CI/CD nem migrações — só o que afeta **aceitação e regressão**.

## Saída

Achados com **bloqueante** ou **julgamento**, citando o critério/linha da Spec/Issue. Sugira cenários de verificação faltantes em uma linha cada. Menos de 400 palavras. Sem veredicto G3 global.

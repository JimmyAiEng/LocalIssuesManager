---
name: software-architect
description: >-
  Perspectiva de arquitetura no QA: seams, profundidade de módulos, acoplamento
  e aderência a ADRs/CONTEXT. Use sob quality-assurance (TAG=QA), não como
  code-review de Implement.
---

# software-architect (camada 2 · QA · perspectiva)

Obtida via [`quality-assurance`](../quality-assurance/SKILL.md) após [`qa-phase`](../qa-phase/SKILL.md). Idioma: **pt-BR**.

## Eixo (só isto)

Avaliar se o desenho entregue **sustenta** o que a Spec / domínio pedem: módulos profundos, seams claros, dependências na direção certa, ADRs respeitados.

Vocabulário preferido: módulo, interface, depth, seam, adapter (mesmo glossário do pack Design, **sem** carregar skills de Design neste claim). Use termos de `CONTEXT.md` para o domínio.

## Checklist

- Seams públicos cobrem os comportamentos críticos da Spec? Há vazamento de miolo pela interface?
- Módulos rasos novos (interface ≈ implementação) ou Shotgun Surgery entre pastas?
- Dependências cruzam camadas na direção errada? Ciclos novos?
- Conflito com ADR existente sem justificativa explícita?
- Abstrações especulativas (hooks/ indirection sem necessidade na Spec)?

## Fora do eixo

Não julgue estilo de código fino (isso é Standards em Implement), cobertura de teste detalhada (qa-engineer), ameaças (security), pipelines (devops) nem schema/migração (data) — só sinalize se impactar o desenho estrutural.

## Saída

Lista de achados: cada um com **bloqueante** ou **julgamento**, evidência (path/hunk/ADR), e correção sugerida em uma linha. Menos de 400 palavras. Sem veredicto G3 global.

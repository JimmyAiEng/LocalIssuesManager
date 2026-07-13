---
name: to-spec
description: >-
  Sintetiza o alinhamento atual em uma Spec (sem entrevista) e grava o artefato
  no repo. Use na fase Design após design-phase, quando requisitos (e direção,
  se houve E) bastam para congelar o desenho antes de to-tickets.
---

# to-spec (camada 2 · Design)

## Objetivo

Congelar o desenho numa **Spec** a partir do que já foi discutido (Issue, conversa, exploração, protótipo). **Não** entreviste o humano — sintetize o que já sabe. Se faltar fato crítico, registre lacuna e vá a `AWAITING`; não invente.

## Pré-condições

- Heurística E: se houve exploração (`codebase-design`), o **gate de direção** já foi decidido pelo humano.
- Proto (se houve): a resposta da pergunta já está capturada.

## Processo

1. Explore o repo o suficiente para ancorar a Spec no estado atual. Use glossário (`CONTEXT.md`) e respeite ADRs.
2. Esboce os **seams** pelos quais a feature será testada. Prefira seams existentes; proponha novos só no ponto mais alto possível. Ideal: poucos seams (um é ótimo). Confirme com o humano se os seams batem com a expectativa.
3. Escreva a Spec com o template abaixo num artefato versionável, tipicamente:
   - `docs/features/<area>/SPEC.md` (ou caminho já usado no projeto)
   - Referencie o caminho no comentário da Issue Design.
4. **Não** publique a Spec como Issue no issues-local (Issues são unidades de trabalho; a Spec é documento). Próximo passo: `to-tickets`.

## Template da Spec

```markdown
## Problem Statement

O problema do ponto de vista do usuário.

## Solution

A solução do ponto de vista do usuário.

## User Stories

Lista longa e numerada:

1. As an <ator>, I want <capacidade>, so that <benefício>

Cubra o feature de ponta a ponta (feliz, borda, falha).

## Implementation Decisions

- Módulos a criar/alterar
- Interfaces desses módulos
- Esclarecimentos técnicos / ADRs relevantes
- Schema, contratos de API, interações

Não inclua paths de arquivo nem snippets longos (envelhecem).
Exceção: snippet de protótipo que codifica decisão (state machine, reducer,
schema, tipos) — cite que veio do proto e corte só o essencial.

## Testing Decisions

- O que é um bom teste (comportamento externo, não detalhes internos)
- Quais módulos serão testados
- Prior art de testes no repo

## Out of Scope

O que fica de fora.

## Further Notes

Notas restantes.
```

## Saídas

Spec em markdown no repo + referência na Issue Design. Em seguida: `to-tickets` → Issues Implement independentes → Issue Design em `AWAITING` (G2).

## Fora de escopo

- Criar Issues (isso é `to-tickets`).
- Implementar código / TDD.

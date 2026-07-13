---
name: codebase-design
description: >-
  Vocabulário e processo para desenhar módulos profundos e seams; produz opções
  com trade-offs. Use na fase Design (após design-phase) quando requisitos não
  bastam para especificar — exploração E, seams novos, trade-offs estruturais.
---

# codebase-design (camada 2 · Design)

Obtida só após disclosure de [`design-phase`](../design-phase/SKILL.md). Spec: `WORKFLOW.md` §E · catálogo: `SKILLS.md`.

## Objetivo

Explorar desenho quando os requisitos **não** bastam para ir a Spec. Entregar **opções + trade-offs** e parar no **gate de direção** (humano escolhe) antes de `to-spec` / `prototype` (se ainda fizer sentido).

Se os requisitos já bastam → **não** use esta skill; vá a `to-spec` / `to-tickets`.

## Glossário (usar exatamente)

**Módulo** — qualquer coisa com interface e implementação (função, classe, pacote, fatia). Evitar: unit, component, service.

**Interface** — tudo que o caller precisa saber: assinatura, invariantes, ordem, erros, config, desempenho. Evitar: API/signature no sentido estreito.

**Implementação** — o corpo do módulo. Distinto de **Adapter**.

**Profundidade** — alavancagem na interface: muita comportamento atrás de pouca superfície. **Profundo** vs **raso**.

**Seam** _(Feathers)_ — lugar onde se altera comportamento sem editar ali; localização da interface. Evitar: boundary (sobrecarregado com DDD).

**Adapter** — concreto que satisfaz a interface no seam (papel, não substância).

**Alavancagem** — o que callers ganham com profundidade.

**Localidade** — o que maintainers ganham: mudança/bug/verificação concentrados.

## Profundo vs raso

- **Profundo** = interface pequena + muita implementação.
- **Raso** = interface grande + pouca implementação (evitar).

Perguntas: menos métodos? params mais simples? mais complexidade escondida?

## Princípios

- Profundidade é da **interface**, não do tamanho da implementação.
- **Teste de deleção:** se deletar o módulo e a complexidade some, era pass-through; se reaparece em N callers, valia a pena.
- A interface é a **superfície de teste**.
- Um adapter = seam hipotético; **dois** adapters = seam real. Não invente port sem variação real.

## Processo nesta Issue Design

1. Confirme a heurística E (requisitos insuficientes / seams novos / trade-offs).
2. Explore o código e o glossário (`CONTEXT.md` / ADRs) na área tocada.
3. Liste candidatos a aprofundar ou seams a criar/mover.
4. Produza **≥2 opções** radicalmente diferentes (não variações cosméticas). Para cada uma:
   - Interface proposta (entrada, invariantes, erros)
   - O que fica atrás do seam
   - Dependências e adapters (ver [DEEPENING.md](DEEPENING.md))
   - Trade-offs (alavancagem, localidade, custo de migração)
5. Apresente comparação clara e **pare** no gate de direção — não escolha sozinho nem avance a Spec sem o humano.
6. Opcional: [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md) para gerar opções em paralelo via subagents.

## Saídas

Documento ou comentário na Issue com opções + trade-offs. Próximo passo operacional: humano escolhe direção → então `prototype` (se heurística pedir) e/ou `to-spec`.

## Fora de escopo

- Implementar produto (fase Implement / TDD).
- Substituir Spec ou Issues (`to-spec` / `to-tickets`).
- Skills de outras fases.

---
name: tdd
description: >-
  Red-green-refactor por fatia vertical nos seams acordados, sem gate humano
  entre red e green. Use sob TAG=Implement (via implement ou sozinha) quando há
  comportamento concreto a construir test-first.
---

# tdd (camada 2 · Implement)

Tipicamente acionada por `implement`, ou sozinha se o humano pedir TDD pontual.
Esta skill não cria Issues; o contexto vem da Issue/Spec.

## Objetivo

Construir um comportamento de cada vez no loop **red → green → refactor**, com testes que sobrevivem a refactors internos. **Não** escreva todos os testes de uma vez.

## O que é um bom teste

Testes verificam comportamento pelas **interfaces públicas**, não detalhes de implementação. Código interno pode mudar por completo; os testes não deveriam. Um bom teste lê como especificação (“usuário conclui checkout com carrinho válido”) e sobrevive a rename interno.

Ver [tests.md](tests.md) (exemplos) e [mocking.md](mocking.md) (quando mockar).

Ao explorar o código, leia `CONTEXT.md` (se existir) para vocabulário de domínio nos nomes dos testes, e respeite ADRs da área.

## Seams — onde os testes moram

Um **seam** é o limite público onde se observa comportamento sem abrir o miolo. Testes vivem nos seams, nunca contra internos.

**Teste só em seams pré-acordados.** Antes do primeiro teste desta fatia:

1. Use os seams da Spec / Issue (`artifacts`, critérios, seção de Implementation Decisions).
2. Se não houver seams listados, escreva a lista proposta e confirme com o humano quando estiver disponível; se AFK e a Issue for estreita, declare a assunção no comentário da Issue e siga com o seam mais alto possível (interface já existente).
3. Nenhum teste em seam não declarado.

Não dá para testar tudo — acordar seams concentra esforço nos caminhos críticos.

## Anti-padrões

- **Acoplado à implementação** — mocka colaboradores internos, testa métodos privados, ou verifica por canal lateral (SQL direto em vez da interface). Sintoma: o teste quebra no refactor sem mudança de comportamento.
- **Tautológico** — a asserção recalcula o esperado do mesmo jeito que o código (`expect(add(a,b)).toBe(a+b)`). Esperados vêm de fonte independente: literal conhecido, exemplo trabalhado, Spec.
- **Fatiamento horizontal** — todos os testes primeiro, depois toda a implementação. Testes em lote verificam comportamento *imaginado* e engessam estrutura cedo. Prefira **fatias verticais**: um teste → implementação mínima → próximo, cada ciclo um **tracer bullet** informado pelo anterior.

## Regras do loop

- **Red antes de green.** Escreva o teste que falha; só então o mínimo de código para passar. Não antecipe testes futuros nem features especulativas.
- **Uma fatia por ciclo.** Um seam, um teste, uma implementação mínima.
- **Sem gate humano entre red e green.** O agente completa o ciclo sozinho; humano revisa a fatia integrável depois (`AWAITING`), não cada cor do loop.
- **Refactor com a suíte verde.** Com os testes passando, limpe o óbvio (nomes, duplicação local) **antes** do próximo red. Não refatore com a suíte vermelha. Review amplo / smells ficam para `code-review` — não substituem o refactor curto do ciclo.

## Está funcionando se

- Escreve um teste, faz passar, só então o próximo — não lote de testes + lote de código.
- Nomes descrevem comportamento, não internos; sobrevivem a rename interno.
- Esperados são literais/exemplos da Spec, não derivados do mesmo algoritmo do SUT.

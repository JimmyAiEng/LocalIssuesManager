---
name: implement
description: >-
  Orquestra a fatia de Implement: TDD nos seams da Spec/Issue, typecheck/testes,
  review interno e entrega em AWAITING. Use sob TAG=Implement após implement-phase
  (não reabre Design; não substitui QA).
---

# implement (camada 2 · Implement)

## Objetivo

Construir o trabalho **já** descrito na Issue Implement (e Spec referenciada) — código **funcional/integrável**. É a mão, não a cabeça: não reabre desenho nem inventa requisitos.

## Quando usar

- Issue claimada com TAG=`Implement` e disclosure de `implement-phase` feito.
- Spec / critérios de aceite / seams já existem (via Design ou corpo da Issue).

Se a Spec não existir: **não** escreva Spec aqui — registre lacuna e vá a `AWAITING` (humano abre/completa Design). Para um comportamento pontual sem orquestração completa, use só `tdd`.

## Processo

### 1. Contexto da fatia

1. Leia a Issue claimada (`issues get --id …`): `problem`, `acceptance_criteria`, `artifacts`.
2. Abra Spec / docs apontados em `artifacts` (se houver).
3. Fixe os **seams** de teste: os da Spec; se a Issue não listar seams e a Spec também não, declare-os no comentário **antes** do primeiro teste e confirme com o humano se estiver disponível — **não** invente seams no meio do build.
4. Leia `CONTEXT.md` / ADRs da área tocada, se existirem.

### 2. Construir com TDD

Obtenha e siga `tdd`:

- Red → green → refactor **sem** gate humano entre red e green.
- Fatias verticais (um comportamento por ciclo).
- Typecheck e arquivo(s) de teste relevantes com frequência; suíte completa **uma vez** ao fim da fatia (ou quando o projeto tiver comando equivalente).

Não misture trabalho de outra Issue. Se a fatia estourar o contexto: feche criando Issue(s) de **continuação** e entregue o que já estiver integrável.

### 3. Review interno

Obtenha e rode `code-review` no diff da fatia (ponto fixo: base da branch / commit de início do claim / o que o humano indicar).

- Trate achados bloqueantes (quebra de Spec ou standards do repo) **antes** de entregar.
- Achados de julgamento: corrija o óbvio ou registre no comentário de `AWAITING`.
- **Não** abra Issue TAG=`QA` daqui — QA é estágio/gate separado.

### 4. Entregar a fatia

1. Garanta: critérios de aceite da Issue verificáveis (ou explique o gap).
2. Commit **somente** se o humano pediu nesta sessão ou a convenção do repo exigir commit antes de review; caso contrário deixe o working tree pronto e descreva os paths no comentário.
3. Mova a Issue:

```bash
issues status --id <uuid> --agent <ia> --status AWAITING \
  --comment "Fatia: <o que entregou>. Testes: <como rodar>. Review interno: <resumo Standards/Spec>. Diff/paths: …"
```

Humano revisa a fatia (Decisão). Conjunto Implement acordado completo → humano/fluxo abre Issue(s) **QA** — não é papel desta skill inventar o gate G3 sozinha sem acordo.

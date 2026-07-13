---
name: domain-modeling
description: >-
  Constrói e afia o modelo de domínio do projeto (linguagem ubíqua / ADRs).
  Use sob TAG=Planning ao mudar o glossário ou registrar decisão arquitetural;
  também quando outra skill de Planning precisar manter o modelo.
---

# domain-modeling

Disciplina **ativa**: desafiar termos, inventar cenários de borda e gravar glossário/decisões no momento em que cristalizam. Só *ler* `CONTEXT.md` não é esta skill — isso qualquer skill pode fazer numa linha. Esta skill é para **alterar** o modelo.

Se o harness tiver outra skill homônima de domain-modeling, use **esta** (a do pack) sob `planning-phase`; não carregue as duas no mesmo claim.

## Estrutura de arquivos

Contexto único (maioria dos repos):

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Vários contextos: `CONTEXT-MAP.md` na raiz aponta onde cada um vive.

Crie arquivos com preguiça — só quando houver o que escrever. Formatos: [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md), [ADR-FORMAT.md](./ADR-FORMAT.md).

## Durante a sessão

### Desafiar o glossário

Se o humano usar termo que conflita com `CONTEXT.md`, aponte na hora e peça a resolução.

### Afiar linguagem vaga

Proponha termo canônico preciso. Liste aliases a evitar em `_Avoid_`.

### Cenários concretos

Estresse relacionamentos de domínio com cenários de borda até as fronteiras ficarem nítidas.

### Confrontar com o código

Se o discurso e o código divergirem, superfice a contradição e pergunte qual manda.

### Atualizar CONTEXT.md na hora

Termo resolvido → grave já. `CONTEXT.md` é **só glossário** — sem detalhes de implementação, sem spec, sem scratchpad.

### ADR com parcimônia

Ofereça ADR só se as três forem verdadeiras:

1. Difícil de reverter  
2. Surpreendente sem contexto  
3. Resultado de trade-off real  

Senão, pule. Template em [ADR-FORMAT.md](./ADR-FORMAT.md). Se o projeto já registrar decisões de *processo* em outro arquivo padrão do esforço, não duplique ADR e decisions sem motivo.

## issues-local e Planning

- Se o `CONTEXT.md` do projeto já definir o vocabulário do tracker (`Issue`, `Claim`, `TAG`, …), respeite-o.
- HITL: dúvidas de domínio que precisam do humano → `issues status … AWAITING`.
- Não avance TAG na mesma Issue; avanço = fechar Planning e criar Design.

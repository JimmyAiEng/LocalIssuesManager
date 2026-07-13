---
name: to-tickets
description: >-
  Fatia uma Spec em Issues independentes e paralelizáveis no issues-local, sem
  grafo de dependência obrigatória. Use na fase Design após design-phase e
  to-spec (ou Spec já aceita no contexto).
---

# to-tickets (camada 2 · Design)

## Objetivo

Transformar Spec (ou conversa alinhada) em **Issues** no issues-local: fatias verticais, **independentes**, claimáveis em paralelo. Continuação de trabalho grande = **criar** Issues ao fechar — **não** bloquear claim com arestas obrigatórias.

Sem grafo de **Blocked by** e sem labels de triage: prontidão = status `OPEN` na fila FIFO.
Ordem sugerida no texto da Issue é **orientação**, não pré-requisito de claim.

## Processo

### 1. Contexto

Use Spec / Issue Design / conversa. Se receber path ou id, leia o corpo completo.

### 2. Código (opcional)

Explore o bastante para títulos/corpos no glossário do domínio e ADRs. Prefatore (“make the change easy…”) vira Issue(s) **própria(s)** integrável(is), não blocker oculto.

### 3. Fatias verticais (tracer bullets)

- Cada Issue corta caminho **completo** e estreito (schema → API → UI → testes conforme o caso) — vertical, não uma camada horizontal.
- Fatia demoável/verificável sozinha.
- Cabe num contexto fresco de agente.
- Prefactor primeiro (Issue separada), se necessário.

**Refator largo (exceção):** expand–contract em Issues **independentes** (expand, migrações por lote, contract). No corpo, cite “sequência recomendada” como texto — **sem** campo Blocked-by que impeça claim paralelo. Se paralelo for perigoso, diga no `problem` / critérios e deixe o humano ordenar via fila; não invente grafo no tracker.

### 4. Quiz rápido com o humano

Liste propostas:

- **Título**
- **TAG** (quase sempre `Implement`; às vezes `QA` / outras se a Spec pedir)
- **O que entrega** (comportamento ponta a ponta)
- **Critérios de aceite** (checklist)

Pergunte: granularidade ok? algo a fundir/partir? Iterar até aprovação.

### 5. Publicar no issues-local

Para cada Issue aprovada:

```bash
issues create \
  --title "…" \
  --project "<projeto>" \
  --tag Implement \
  --problem "…" \
  --artifacts "…" \
  --acceptance-criteria $' [ ] …\n[ ] …' \
  --agent <ia>
```

Campos:

| Campo | Conteúdo |
|---|---|
| `problem` | Comportamento a entregar (visão usuário/domínio), referência à Spec |
| `artifacts` | Áreas/módulos/docs (sem micro-paths frágeis) |
| `acceptance_criteria` | Checklist verificável; fatia integrável |

Não feche nem altere a Issue Design pai aqui — após criar as Issues filhas, mova a Design para `AWAITING` (G2) com comentário listando os ids criados.

## Template mental do corpo

```text
problem: comportamento ponta a ponta + ponte para a Spec
artifacts: módulos / docs relevantes
acceptance_criteria:
  [ ] critério 1
  [ ] critério 2
  (opcional) sequência recomendada: … — não bloqueia claim
```

Evite paths/snippets longos. Exceção: snippet de proto que codifica decisão — cite a origem.

## Saídas

N Issues `OPEN` independentes + Issue Design em `AWAITING` com comentário de entrega (ids + path da Spec).

## Fora de escopo

- Grafo de bloqueio no tracker.
- Implementar as fatias (fase Implement).
- Fechar a Design com `--reason concluido` sem Decisão humana quando `human_presence` exige `decide`.

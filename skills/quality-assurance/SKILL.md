---
name: quality-assurance
description: >-
  Orquestra validação multi-perspectiva (architect, QA, data, security, devops)
  em Issue TAG=QA e recomenda veredicto G3. Use após qa-phase; não substitui
  code-review de Implement.
---

# quality-assurance (camada 2 · QA)

## Objetivo

Validar o conjunto entregue pelas Issues Implement (e Spec associada) sob **cinco perspectivas independentes**, agregar achados **sem fundir rankings**, e produzir recomendação clara para o gate **G3** (humano aprova → Deployment; reprova → Issues Implement novas).

## QA ≠ review interno

| `code-review` (Implement) | Esta skill (TAG=`QA`) |
|---|---|
| Standards + fidelidade à Spec da fatia | Multi-perspectiva de produto/sistema |
| Dentro do claim Implement | Issue própria TAG=`QA` |
| Não abre G3 | Recomenda G3; humano decide |
| Mesmo harness da build ok | Preferir **outro** harness/modelo — recomendado, não obrigatório |

Não rode isto como substituto de `code-review` nem abra TAG=`QA` a partir de Implement.

## Perspectivas (camada 2)

Obtenha e dispare (em paralelo quando o harness permitir):

| Perspectiva | Skill |
|---|---|
| Arquitetura / seams | `software-architect` |
| Qualidade / critérios / riscos de regressão | `qa-engineer` |
| Dados / consistência / migrações | `data-engineer` |
| Segurança | `security-engineer` |
| Operação / entregabilidade | `devops-engineer` |

Cada perspectiva reporta **só** no seu eixo. O orquestrador **não** mescla nem reordena achados entre eixos num ranking único.

## Processo

### 1. Contexto da Issue QA

1. `issues get --id <uuid>` — `problem`, `acceptance_criteria`, `artifacts`.
2. Spec / docs / paths em `artifacts`; `CONTEXT.md` e ADRs da área se existirem.
3. Escopo do que validar: diff desde o ponto acordado (merge-base / tag / SHA das fatias Implement), ou árvore/artefatos que a Issue apontar.
4. Se o escopo estiver vago: declare a assunção no relatório e no comentário de `AWAITING` — não invente requisitos.

Capture uma vez (quando houver git):

- Diff: `git diff <ponto>...HEAD` (ou o intervalo que a Issue indicar)
- Commits: `git log <ponto>..HEAD --oneline`

### 2. Disparar as perspectivas necessárias

Escolha quais eixos são relevantes ao escopo (ex.: fatia sem persistência → pule `data-engineer` e anote “sem impacto”). O default é as cinco; não force eixos vazios.

Quando o harness tiver subtarefas/agentes: **uma** mensagem com os jobs em paralelo (`generalPurpose` ou equivalente), cada um com a skill da perspectiva + o pacote de contexto abaixo.

Se não houver subagentes: rode as escolhidas em sequência na mesma sessão, mantendo seções separadas.

**Pacote comum a cada perspectiva** (colar no prompt):

- Diff + commits (ou paths/artefatos se não houver diff)
- Trechos relevantes da Issue QA, Spec e critérios de aceite
- Vocabulário de `CONTEXT.md` / ADRs (se houver)
- Brief: “Responda **somente** no eixo da sua skill. Cite evidência (arquivo, hunk, critério). Distinga bloqueante vs julgamento. Menos de 400 palavras. Em pt-BR.”

Não peça à perspectiva que “aprove” o release — só achados no eixo.

### 3. Agregar

Apresente nesta ordem, seções separadas:

1. `## software-architect`
2. `## qa-engineer`
3. `## data-engineer`
4. `## security-engineer`
5. `## devops-engineer`

Verbatim ou levemente limpo. **Não** funda achados entre seções.

Feche com:

```markdown
## Totais
- Bloqueantes: N (listar eixos)
- Julgamentos: N
- Pior achado por eixo: …

## Recomendação G3
- `aprovar` | `reprovar`
- Se reprovar: sugestão de Issues Implement (título + problema em 1 linha cada), **independentes**
```

### 4. Entregar

```bash
issues status --id <uuid> --agent <ia> --status AWAITING \
  --comment "QA multi-perspectiva: <resumo>. Recomendação G3: aprovar|reprovar. Bloqueantes: …. Paths/diff: …"
```

Peça Decisão humana explícita (G3). Não crie Issue `Deployment` nem Issues Implement sem o humano pedir / sem acordo do gate — a recomendação lista sugestões; a criação fica após Decisão.

## Limites

Exceção de fase permitida neste claim: `devops-engineer` no modo perspectiva QA.

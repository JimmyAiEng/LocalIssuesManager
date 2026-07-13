# Workflow comum de agentes — novo desenvolvimento

Status: **rascunho** (Issue `8f78af65`). Não implementa `AGENTS.md` nem skills instaláveis.

Escopo: método que qualquer harness (`cursor` · `claude-code` · `codex` · `pi`) deve seguir ao trabalhar Issues de **novo desenvolvimento**.  
Fora de escopo: workflow de Maintenance / bugfix.

Discovery canônico (decidido): **AGENTS.md + skill pack** por harness, com **progressive disclosure** (ver §5) — a implementar em Issues futuras. Este documento é a especificação do processo.

---

## 1. Relação com o Issue Manager

| Conceito Issue Manager | Papel neste workflow |
|---|---|
| TAG (`Planning` … `Deployment`) | Fase SDLC imutável da Issue |
| Status (`OPEN`→`CLAIMED`→`AWAITING`→`CLOSED`) | Ciclo operacional de uma Issue |
| Gate humano | Fronteira de fase: fechar Issue(s) da TAG atual e abrir a(s) da próxima |
| Claim FIFO | Qual IA executa a Issue; não define o método interno |

O Issue Manager é a **unidade operacional**. Este workflow é o **método** dentro e entre Issues.

### Independência e paralelismo

- Issues **não dependem** umas das outras como pré-requisito de claim.
- Duas Issues (mesma TAG ou TAGs diferentes, quando fizer sentido) **podem rodar em paralelo**.
- Se uma Issue ficar grande demais, ela **encerra criando** Issues de continuação — não encadeia bloqueio obrigatório.
- Preferir fatias **integráveis e funcionais**, revisáveis pelo humano, em vez de um monólito.

---

## 2. Caminho feliz e atalhos

**Mínimo obrigatório:** Planning → Spec → Implement → QA → Deploy.

**Opcionais (heurística no AGENTS.md futuro):** Explorar desenho · Prototipar (worktree).

```text
P Planning ──G1──► [E explorar?] ──► [Proto?] ──► S Spec ──G2──► I Implement* ──► Q QA ──G3──► D Deploy ──G4──► fim
                     │                  │
                     └─ gate direção ───┘  (se E ocorreu)
```

`*` Implement pode ser várias Issues independentes em paralelo ou em sequência natural (sem dependência obrigatória).

---

## 3. Estágios

### P — Planning (obrigatório) · TAG `Planning`

| | |
|---|---|
| **Objetivo** | Alinhar problema, requisitos e domínio (ex-estágios a+b fundidos) |
| **Entradas** | Issue claimada, repo, contexto humano |
| **Atividades** | Afiar problema; RF/RNF; glossário/ADRs; research; wayfinding se o escopo for grande |
| **Skills** | `wayfinder`, `research`, `domain-modeling`, `teach`, `handoff` |
| **Saídas** | Problema/requisitos aceitos; CONTEXT/ADR se necessário; handoff se houver troca de agente |
| **Conclusão** | **G1** — humano aceita; fecha Planning; abre Design |

### E — Explorar desenho (opcional) · TAG `Design`

| | |
|---|---|
| **Objetivo** | Opções de desenho quando requisitos **não** bastam para especificar |
| **Quando** | Heurística AGENTS.md (ex.: seams novos, trade-offs estruturais) |
| **Skills** | `codebase-design` |
| **Saídas** | Opções + trade-offs |
| **Conclusão** | Gate de **direção**: humano escolhe opção antes de especificar |

### Proto — Prototipar (opcional) · TAG `Design`

| | |
|---|---|
| **Objetivo** | Validar pergunta de desenho com artefato descartável em **worktree** |
| **Quando** | Heurística (ex.: UI nova, estado complexo) |
| **Posição** | Permitido **antes e/ou depois** do gate de direção |
| **Skills** | `prototype` |
| **Saídas** | Protótipo throwaway + aprendizado; não vira produto |

### S — Especificar (obrigatório) · TAG `Design`

| | |
|---|---|
| **Objetivo** | Congelar spec e fatiar trabalho em Issues |
| **Skills** | `to-spec`, `to-tickets` |
| **Saídas** | Spec + Issues Implement (e outras se preciso), **sem** grafo de dependência obrigatória |
| **Conclusão** | **G2** — humano aceita; fecha Design; abre Implement |

### I — Implementar (obrigatório) · TAG `Implement`

| | |
|---|---|
| **Objetivo** | Entregar fatia funcional via TDD; review interno |
| **Skills** | `implement`, `tdd`, `code-review` |
| **Regras** | TDD sem gate entre testes e código; cada Issue = código **integrável**, revisável pelo humano; Issue grande → fecha criando continuações; Issues podem ser paralelas |
| **Review interno** | `code-review` (standards + fidelidade à spec) — **não** substitui QA |
| **Conclusão** | Humano revisa a fatia (AWAITING/Decisão). Quando o conjunto Implement acordado estiver feito, abre Issue(s) **QA** |

### Q — QA (obrigatório) · TAG `QA`

| | |
|---|---|
| **Objetivo** | Validação multi-perspectiva, distinta do review de Implement |
| **Skills** | `quality-assurance` + subagents (`software-architect`, `qa-engineer`, `data-engineer`, `security-engineer`, `devops-engineer`) |
| **Harness** | Preferir outro harness/modelo que o da Implement — **recomendado, não obrigatório** |
| **Conclusão** | **G3** — humano aprova ou reprova (retrabalho → novas Issues Implement, sem dependência rígida) |

### D — Deployment (obrigatório) · TAG `Deployment`

| | |
|---|---|
| **Objetivo** | PR / entrega / handoff operacional |
| **Skills** | `devops-engineer` (pack QA) |
| **Conclusão** | **G4** — go / no-go de merge |

---

## 4. Gates humanos

| Gate | Após | Pergunta | Efeito operacional |
|---|---|---|---|
| G1 | Planning | Problema/requisitos ok? | Fecha Planning → abre Design |
| Direção | E (se houve) | Qual opção de desenho? | Segue Proto e/ou Spec |
| G2 | Spec | Spec ok para implementar? | Fecha Design → abre Implement |
| (fatia) | cada Implement | Fatia integrável ok? | Fecha ou cria continuações; paralelo ok |
| G3 | QA | Aprovado? | Fecha QA → abre Deployment (ou retrabalho Implement) |
| G4 | Deployment | Merge/deploy? | Fecha Deployment |

Retrabalho: humano `decide OPEN` ou fecha e cria Issue nova na TAG adequada. Não há reopen de `CLOSED`.

---

## 5. Progressive disclosure (discovery de skills)

O harness **não** carrega o catálogo inteiro de uma vez. O contexto cresce em camadas:

```text
AGENTS.md
  └─ sempre referencia / aciona →  sdlc-workflow          (camada 0: como funciona o SDLC)
        └─ pela TAG da Issue     →  <tag>-phase            (camada 1: disclosure da fase)
              └─ skills permitidas →  wayfinder, tdd, …    (camada 2: skills concretas da Issue)
```

| Camada | Skill | Sempre no contexto? | Papel |
|---|---|---|---|
| 0 | `sdlc-workflow` | Sim — citada/embutida no `AGENTS.md` | Explica o workflow de novo desenvolvimento: estágios, gates, independência de Issues, quando usar E/Proto, Review≠QA |
| 1 | `planning-phase` · `design-phase` · `implement-phase` · `qa-phase` · `deployment-phase` | Não — só a da TAG claimada | Faz o **disclosure** das skills permitidas naquela fase e das heurísticas locais (ex.: quando prototipar) |
| 2 | Skills do catálogo (`wayfinder`, `tdd`, …) | Não — sob demanda | Executam o trabalho; o harness só as obtém depois do disclosure da fase |

### Regras

1. Ao claimar, o harness já tem `AGENTS.md` + `sdlc-workflow` no contexto.
2. Lê a TAG da Issue e **aciona a skill de fase** correspondente (`planning-phase` se TAG=Planning, etc.).
3. A skill de fase lista o conjunto permitido e orienta quais skills concretas obter para completar **esta** Issue.
4. O harness obtém/carrega só essas skills (progressive discovery até ter o necessário).
5. Skills de outras fases ficam fora do contexto — evita ruído e uso indevido.
6. Troca de TAG = outra Issue = outro disclosure (não “promove” skills de fase anterior no mesmo claim).

### Nomes provisórios

Nomes das skills de disclosure (`sdlc-workflow`, `*-phase`) são **provisórios** nesta Issue de Planning; a implementação pode renomear desde que preserve as três camadas.

---

## 6. Uso pelos harnesses

1. Claim → contexto com `AGENTS.md` + `sdlc-workflow`.
2. Aciona skill de fase pela TAG → disclosure do conjunto permitido.
3. Obtém skills concretas necessárias à Issue e executa o estágio.
4. Move para `AWAITING` nos gates / fatias que exigem Decisão humana.
5. Ao concluir, fecha e **cria** Issue(s) da próxima TAG ou continuações (sem dependência obrigatória).
6. Nesta Issue de Planning: só especificar; **não** criar `AGENTS.md` nem skills instaláveis.

---

## 7. Critérios de conclusão deste rascunho

- [x] Estágios com objetivo, entradas, atividades, skills, saídas, conclusão
- [x] Gates, feedback/retrabalho, paralelismo e independência de Issues
- [x] Discovery via AGENTS.md + skills com progressive disclosure (spec)
- [x] OK humano para `AWAITING` — Issue movida; aguarda Decisão
- [x] Issues Implement de follow-up criadas (discovery + 5 fases)

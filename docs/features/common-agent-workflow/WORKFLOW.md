# Workflow comum de agentes — novo desenvolvimento

Status: **rascunho** (Issue `8f78af65`). Não implementa `AGENTS.md` nem skills instaláveis.

Escopo: método que qualquer harness (`cursor` · `claude-code` · `codex` · `pi`) deve seguir ao trabalhar Issues de **novo desenvolvimento**.  
Manutenção / bugfix não é fase própria: vira Issue de tipo `Fix`/`Refactor`, resolvida pelos Tickets adequados.

Discovery canônico (decidido): **AGENTS.md + skill pack** por harness, com **progressive disclosure** (ver §5) — a implementar em Issues futuras. Este documento é a especificação do processo.

---

## 1. Relação com o Issue Manager

| Conceito Issue Manager | Papel neste workflow |
|---|---|
| Tipo do Ticket (`Planning` … `Deploy`) | Fase SDLC imutável da fatia (Ticket) |
| Tipo da Issue (`Fix` · `Feat` · `Research` · `Refactor`) | Intenção do agregado; roteia decomposição, não fase |
| Status Issue (`OPEN`→`CLAIMED`→`ON-GOING`→`AWAITING`→`CLOSED`) | Ciclo operacional do agregado |
| Gate humano | Fronteira de fase: fechar Ticket(s) da fase atual e abrir o(s) da próxima |
| Claim via `next` | Qual IA executa o Ticket (ou decompõe a Issue); não define o método interno |

O Issue Manager é a **unidade operacional**. Este workflow é o **método** dentro e entre Tickets.

### Independência e paralelismo

- Tickets **não dependem** uns dos outros como pré-requisito de claim.
- Dois Tickets (mesmo tipo ou tipos diferentes, quando fizer sentido) **podem rodar em paralelo**.
- Se uma fatia ficar grande demais, ela **encerra criando** Tickets de continuação — não encadeia bloqueio obrigatório.
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

### P — Planning (obrigatório) · Ticket type `Planning`

| | |
|---|---|
| **Objetivo** | Alinhar problema, requisitos e domínio (ex-estágios a+b fundidos) |
| **Entradas** | Issue claimada, repo, contexto humano |
| **Atividades** | Afiar problema; RF/RNF; glossário/ADRs; research; wayfinding se o escopo for grande |
| **Saídas** | Problema/requisitos aceitos; CONTEXT/ADR se necessário; handoff se houver troca de agente |
| **Conclusão** | **G1** — humano aceita; fecha Planning; abre Design |

### E — Explorar desenho (opcional) · Ticket type `Design`

| | |
|---|---|
| **Objetivo** | Opções de desenho quando requisitos **não** bastam para especificar |
| **Quando** | Heurística AGENTS.md (ex.: seams novos, trade-offs estruturais) |
| **Saídas** | Opções + trade-offs |
| **Conclusão** | Gate de **direção**: humano escolhe opção antes de especificar |

### Proto — Prototipar (opcional) · Ticket type `Design`

| | |
|---|---|
| **Objetivo** | Validar pergunta de desenho com artefato descartável em **worktree** |
| **Quando** | Heurística (ex.: UI nova, estado complexo) |
| **Posição** | Permitido **antes e/ou depois** do gate de direção |
| **Saídas** | Protótipo throwaway + aprendizado; não vira produto |

### S — Especificar (obrigatório) · Ticket type `Design`

| | |
|---|---|
| **Objetivo** | Congelar spec e fatiar trabalho em Issues |
| **Saídas** | Spec + Issues Implement (e outras se preciso), **sem** grafo de dependência obrigatória |
| **Conclusão** | **G2** — humano aceita; fecha Design; abre Implement |

### I — Implementar (obrigatório) · Ticket type `Implement`

| | |
|---|---|
| **Objetivo** | Entregar fatia funcional via TDD; review interno |
| **Regras** | TDD sem gate entre testes e código; cada Ticket = código **integrável**, revisável pelo humano; fatia grande → fecha criando Tickets de continuação; Tickets podem ser paralelos |
| **Review interno** | Standards + fidelidade à spec — **não** substitui QA |
| **Conclusão** | Humano revisa a fatia (AWAITING/Decisão). Quando o conjunto Implement acordado estiver feito, abre Ticket(s) **QA** |

### Q — QA (obrigatório) · Ticket type `QA`

| | |
|---|---|
| **Objetivo** | Validação multi-perspectiva, distinta do review de Implement |
| **Harness** | Preferir outro harness/modelo que o da Implement — **recomendado, não obrigatório** |
| **Conclusão** | **G3** — humano aprova ou reprova (retrabalho → novos Tickets Implement, sem dependência rígida) |

### D — Deploy (obrigatório) · Ticket type `Deploy`

| | |
|---|---|
| **Objetivo** | PR / entrega / handoff operacional |
| **Conclusão** | **G4** — go / no-go de merge |

---

## 4. Gates humanos

| Gate | Após | Pergunta | Efeito operacional |
|---|---|---|---|
| G1 | Planning | Problema/requisitos ok? | Fecha Planning → abre Design |
| Direção | E (se houve) | Qual opção de desenho? | Segue Proto e/ou Spec |
| G2 | Spec | Spec ok para implementar? | Fecha Design → abre Implement |
| (fatia) | cada Implement | Fatia integrável ok? | Fecha ou cria continuações; paralelo ok |
| G3 | QA | Aprovado? | Fecha Ticket QA → abre Ticket Deploy (ou retrabalho Implement) |
| G4 | Deploy | Merge/deploy? | Fecha Ticket Deploy |

Retrabalho: humano `decide OPEN` ou fecha e cria Ticket novo do tipo adequado. Não há reopen de `CLOSED`.

---

## 5. Progressive disclosure (discovery de skills)

O harness **não** carrega o catálogo inteiro de uma vez. O contexto cresce em camadas:

```text
AGENTS.md
  └─ sempre referencia / aciona →  sdlc-workflow             (camada 0: como funciona o SDLC)
        └─ pelo tipo do Ticket   →  <tipo-do-ticket>-phase   (camada 1: a fase e seu gate)
```

| Camada | Skill | Sempre no contexto? | Papel |
|---|---|---|---|
| 0 | `sdlc-workflow` | Sim — citada/embutida no `AGENTS.md` | Explica o workflow de novo desenvolvimento: estágios, gates, independência de Tickets, quando usar E/Proto, Review≠QA |
| 1 | `planning-phase` · `design-phase` · `implement-phase` · `qa-phase` · `deployment-phase` | Não — só a do tipo do Ticket claimado | Diz o objetivo da fase, o gate, as heurísticas de processo e como encerrar; o **como** executar é decisão do agente (YAGNI) |

### Regras

1. Ao claimar, o harness já tem `AGENTS.md` + `sdlc-workflow` no contexto.
2. Lê o tipo do Ticket e **aciona a skill de fase** correspondente (`planning-phase` se type=Planning, etc.).
3. Skills de outras fases ficam fora do contexto — evita ruído e uso indevido.
4. Outro tipo de Ticket = outro disclosure (não “promove” skills de fase anterior no mesmo claim).

---

## 6. Uso pelos harnesses

1. Claim → contexto com `AGENTS.md` + `sdlc-workflow`.
2. Aciona skill de fase pelo tipo do Ticket → objetivo, gate e heurísticas da fase.
3. Executa o estágio como julgar melhor (nenhuma skill de execução no pack).
4. Move para `AWAITING` nos gates / fatias que exigem Decisão humana.
5. Ao concluir, fecha e **cria** Ticket(s) do próximo tipo ou continuações (sem dependência obrigatória).
6. Nesta Issue de Planning: só especificar; **não** criar `AGENTS.md` nem skills instaláveis.

---

## 7. Critérios de conclusão deste rascunho

- [x] Estágios com objetivo, entradas, atividades, skills, saídas, conclusão
- [x] Gates, feedback/retrabalho, paralelismo e independência de Issues
- [x] Discovery via AGENTS.md + skills com progressive disclosure (spec)
- [x] OK humano para `AWAITING` — Issue movida; aguarda Decisão
- [x] Issues Implement de follow-up criadas (discovery + 5 fases)

# PRD v3 — Issues + Tickets (Issues relacionadas)

| Campo | Valor |
|-------|--------|
| Produto | Gerenciador local de Issues via CLI + web |
| Versão do documento | 3.0 (rascunho de requisitos — Planning) |
| Status | Em refinamento — aguardando gate G1 |
| Origem | Issue `2f059563-952b-43b4-996a-26e620cbc2d1` — `[FEAT] Issues relacionadas` |
| Relação com PRD.md | **Ainda não compilado** em PRD.md; substitui o modelo de dados do v1 quando aprovado |
| Escopo | Tracker (domínio + CLI + web) **e** pack de skills (roteamento pelo tipo do Ticket) |

---

## 1. Visão e motivação

No v1 a **Issue** é a unidade atômica de trabalho e carrega uma fase SDLC imutável no campo TAG.
Avançar de fase obriga a fechar a Issue e abrir outra, o que quebra o handoff em Issues soltas, dispersa o contexto e impede que trabalho relacionado rode em paralelo sob um mesmo guarda-chuva.
Isso contradiz o conceito central do sistema: um problema gera duas ou mais frentes de trabalho para resolvê-lo.

O v3 promove a Issue a **agregado**: ela nasce de uma ideia ou problema e é resolvida por um ou mais **Tickets**.
O tipo de trabalho SDLC (Planning → Design → Implement → QA → Deploy) migra do TAG da Issue para o campo **tipo do Ticket**.
O TAG da Issue passa a ser o **tipo da intenção** (Fix, Feat, Research, Refactor), não mais a fase.
O roteamento de skills do pack passa a ser pelo **tipo do Ticket** reivindicado, não mais pelo TAG da Issue.

---

## 2. Objetivos

1. Introduzir a entidade **Ticket** dentro do agregado **Issue**, com ciclo de vida próprio.
2. Reclassificar o TAG da Issue de fase para **tipo** (`Fix` | `Feat` | `Research` | `Refactor`) e remover `Maintenance`.
3. Mover o tipo de trabalho SDLC para o campo tipo do Ticket (`Planning` | `Design` | `Implement` | `QA` | `Deploy`).
4. Introduzir o status **`ON-GOING`** na Issue e uma fila que **prioriza Issues `ON-GOING`**.
5. Permitir criação **progressiva** de Tickets enquanto a Issue está `ON-GOING`.
6. Garantir que uma Issue só avance para `AWAITING`/`CLOSED` quando **todos** os seus Tickets estiverem `CLOSED`.
7. Rearticular o pack de skills para rotear a skill de fase pelo **tipo do Ticket**.
8. Assumir **base limpa** (sem migração): o store é zerado no rollout do v3.

### Não-objetivos

- Dependência estrutural obrigatória de ordem entre Tickets (grafo/bloqueios). Ordem é convenção, não regra do sistema.
- Prioridade além de "ON-GOING primeiro, depois FIFO".
- Sync multi-máquina, multiusuário ou orquestração de agentes (mantidos fora, como no v1).
- Validar qualidade semântica de objetivos, tarefas ou critérios de aceite.

---

## 3. Modelo de dados

### 3.1 Issue (agregado)

| Campo | Regra | Observação |
|-------|-------|------------|
| `id` | gerado | Identificador estável |
| `title` | obrigatório | Título |
| `project` | obrigatório | Um projeto por Issue |
| `type` | obrigatório, enum §3.3 | **Substitui** o antigo `tag`; imutável |
| `problem` | obrigatório | A ideia ou problema |
| `artifacts` | **opcional** | Antes obrigatório no v1 |
| `acceptance_criteria` | **opcional** | Antes obrigatório no v1 |
| `status` | enum §3.5 | Inicia em `OPEN` |
| `owner` | IA ou vazio | IA do último claim; limpo no reset |
| `closed_reason` | enum ou vazio | Obrigatório quando `CLOSED` |
| `human_presence` | bool | Regras do v1 preservadas |
| `thread` | append-only | Histórico de mudanças de status |
| `tickets` | lista | Tickets do agregado (§3.2) |

### 3.2 Ticket (entidade do agregado)

Um Ticket pertence a **exatamente uma** Issue e representa uma **fatia de solução**.

| Campo | Regra | Observação |
|-------|-------|------------|
| `id` | gerado | Identificador estável |
| `issue_id` | obrigatório | Referência à Issue dona |
| `objective` | obrigatório | O que a fatia busca alcançar |
| `task` | obrigatório | O trabalho a executar |
| `acceptance_criteria` | **obrigatório** | Sempre exigido no Ticket |
| `type` | obrigatório, enum §3.4 | Tipo de trabalho SDLC da fatia; roteia a skill |
| `status` | enum §3.5 (sem `ON-GOING`) | Inicia em `OPEN` |
| `owner` | IA ou humano, ou vazio | Ator do claim do Ticket |
| `closed_reason` | enum ou vazio | Obrigatório quando `CLOSED` |
| `artifacts` | opcional | Artefatos produzidos pela fatia |
| `references` | opcional | Menção a artefatos de **outros Tickets** da mesma Issue |
| `thread` | append-only | Histórico do Ticket |

### 3.3 Tipo da Issue (enum imutável)

| Tipo | Significado |
|------|-------------|
| `Fix` | Solução de um problema/bug |
| `Feat` | Nova funcionalidade |
| `Research` | Pesquisa / investigação |
| `Refactor` | Refatoração |

`Maintenance` deixa de existir; casos de manutenção passam a ser `Fix` ou `Refactor`.

### 3.4 Tipo do Ticket (enum)

| Tipo | Significado | Skill roteada |
|------|-------------|---------------|
| `Planning` | Refino do escopo, requisitos, clareza | `planning-phase` |
| `Design` | Arquitetura, especificação, design de interface | `design-phase` |
| `Implement` | TDD + codificação (com review interno) | `implement-phase` |
| `QA` | Validação técnica multi-perspectiva | `qa-phase` |
| `Deploy` | Deploy / PR / go-no-go | `deployment-phase` |

Não há tipo `Maintenance`.

### 3.5 Status

| Status | Vale para | Significado |
|--------|-----------|-------------|
| `OPEN` | Issue, Ticket | Disponível para claim na fila |
| `CLAIMED` | Issue, Ticket | Reivindicado por uma IA (owner) |
| `ON-GOING` | **só Issue** | Issue com Tickets criados, em andamento |
| `AWAITING` | Issue, Ticket | Trabalho concluído; aguarda decisão humana |
| `CLOSED` | Issue, Ticket | Encerrado; motivo obrigatório; não reabre |

Motivos de `CLOSED` (mesmo enum do v1, para Issue e Ticket): `obsoleto` | `duplicado` | `concluido` | `errado`.

---

## 4. Ciclo de vida

### 4.1 Issue

```text
OPEN ──claim(IA)──► CLAIMED ──cria 1º Ticket──► ON-GOING ──todos Tickets CLOSED──► AWAITING ──decisão humana──► CLOSED | OPEN
                       │
                       └──── reset (humano) ────► OPEN
```

- `OPEN → CLAIMED`: IA reivindica a Issue para **decompor** (fila, quando não há Ticket pendente — §5).
- `CLAIMED → ON-GOING`: automático ao criar o **primeiro** Ticket.
- `ON-GOING → AWAITING`: pela IA, **somente** quando todos os Tickets estão `CLOSED`.
- `AWAITING → CLOSED | OPEN`: **só humano** (decisão), como no v1.
- `CLAIMED → OPEN`: **só humano** (reset); limpa owner.
- **Não há reset de `ON-GOING`** (Q4): uma vez que existem Tickets, o desbloqueio se dá pelos próprios Tickets; o caminho de volta da Issue é `ON-GOING → AWAITING → decisão humana `OPEN``.
- A IA **nunca** move a Issue para `OPEN` ou `CLOSED`.

### 4.2 Ticket

```text
OPEN ──claim(IA)──► CLAIMED ──► AWAITING ──decisão humana──► CLOSED | OPEN
                       │
                       ├──► CLOSED (IA, concluído/errado…)
                       └──► OPEN   (IA devolve à fila)
```

- Criado em `OPEN` enquanto a Issue está `CLAIMED` ou `ON-GOING`.
- `OPEN → CLAIMED`: **IA (via fila §5) ou humano** reivindicam o Ticket (Q6).
- O owner do Ticket (IA ou humano) **pode** movê-lo `CLAIMED → AWAITING` (depende de decisão), `→ OPEN` (devolve) ou `→ CLOSED` (concluído).
- `AWAITING → CLOSED | OPEN`: decisão humana.
- Um Ticket `CLOSED` fechado como `concluido` é o que libera o avanço da Issue.

### 4.3 Matriz de transições (resumo)

| Entidade | De → Para | Quem |
|----------|-----------|------|
| Issue | `OPEN → CLAIMED` | IA (fila) |
| Issue | `CLAIMED → ON-GOING` | IA (ao criar 1º Ticket) |
| Issue | `ON-GOING → AWAITING` | IA (todos Tickets `CLOSED`) |
| Issue | `AWAITING → OPEN\|CLOSED` | **humano** |
| Issue | `CLAIMED → OPEN` | **humano** (reset; não há reset de `ON-GOING`) |
| Ticket | `OPEN → CLAIMED` | IA (fila) **ou humano** |
| Ticket | `CLAIMED → AWAITING\|OPEN\|CLOSED` | owner (IA ou humano) |
| Ticket | `AWAITING → OPEN\|CLOSED` | **humano** |

---

## 5. Fila (`next`) com prioridade `ON-GOING`

Um único ponto de entrada de trabalho para a IA.
A fila **prioriza terminar o que já começou** antes de abrir frente nova.

**Seleção do `next` (com filtro opcional de projeto):**

1. Se existir algum Ticket `OPEN` em Issues `ON-GOING`: selecionar o **Ticket mais antigo (FIFO, Q3)**, reivindicá-lo (`Ticket OPEN → CLAIMED`) e **retornar a Issue dona (`ON-GOING`) junto com esse Ticket (`OPEN` → agora `CLAIMED`)**.
2. Caso contrário: reivindicar a Issue `OPEN` mais antiga (`Issue OPEN → CLAIMED`) para decomposição.
3. Se nada elegível: retorno vazio, sem side effect.

O payload de retorno do caso (1) traz o **contexto da Issue** (tipo, problema, critérios) **e** o **Ticket** (objetivo, tarefa, critérios, **tipo**), para a IA acionar a skill do tipo do Ticket.

---

## 6. Requisitos funcionais

### RF-01 — Criar Issue
Entrada: título, projeto, **tipo**, problema (obrigatórios); artefatos e critérios (opcionais).
Efeito: Issue `OPEN`, sem owner, sem Tickets.
Ator: humano ou IA.

### RF-02 — `next` (fila unificada com prioridade ON-GOING)
Comportamento em §5.
Saída suficiente para a IA trabalhar sem outra UI (contexto da Issue + Ticket, ou Issue a decompor).

### RF-03 — Criar Ticket
Entrada: `issue_id`, objetivo, tarefa, critérios de aceite (obrigatórios), tipo; artefatos e referências (opcionais).
Pré-condição: Issue em `CLAIMED` ou `ON-GOING`.
Efeito: Ticket `OPEN`; se for o primeiro Ticket, a Issue vai `CLAIMED → ON-GOING`.
Ator: IA ou humano.

### RF-04 — Mudança de status do Ticket (owner)
`CLAIMED → AWAITING` (texto obrigatório), `→ OPEN` (devolve), `→ CLOSED` (texto + motivo).
Só o owner do Ticket transiciona a partir de `CLAIMED`; o owner pode ser **IA ou humano** (Q6).

### RF-05 — Decisão humana no Ticket
`AWAITING → OPEN | CLOSED` (motivo se `CLOSED`); exclusivo de humano.

### RF-06 — Avançar Issue para `AWAITING`
IA move `ON-GOING → AWAITING` **somente** se todos os Tickets estiverem `CLOSED`; caso contrário, recusar.

### RF-07 — Decisão humana na Issue
`AWAITING → OPEN | CLOSED` (motivo se `CLOSED`); exclusivo de humano.

### RF-08 — Reset da Issue (humano)
`CLAIMED → OPEN`; limpa owner; gera entrada na thread.
Reset **não** se aplica a `ON-GOING` (Q4): com Tickets já criados, o retorno se dá via `ON-GOING → AWAITING → decisão humana `OPEN``.

### RF-09 — Obter e listar
`get` de Issue devolve a Issue com **seus Tickets** e threads.
`get` de Ticket devolve o Ticket completo.
`list` filtra Issues por status/projeto/título/**tipo**; listar Tickets por Issue e/ou tipo/status.

### RF-10 — Regras do v1 preservadas
`human_presence`, fechamento por IA só sem ação humana, sem delete físico, `CLOSED` não reabre, comentário obrigatório em toda transição exceto claim.

---

## 7. Impacto no pack de skills

- `AGENTS.md`: a tabela de roteamento passa de **TAG da Issue → skill** para **tipo do Ticket → skill**.
- `sdlc-workflow`: descrever Issue como agregado tipado, Ticket como fatia tipada, e a fila com prioridade `ON-GOING`.
- Skills `*-phase`: acionadas pelo **tipo do Ticket** reivindicado; conteúdo das fases praticamente inalterado.
- Remoção de `Maintenance` como tipo; o "outro workflow" de manutenção do v1 é absorvido pelos tipos `Fix`/`Refactor` de Issue.
- `CONTEXT.md`: `Ticket` sai da lista _Avoid_ e vira termo de primeira classe; `TAG` é redefinido (tipo da Issue) e o tipo de trabalho SDLC passa a ser propriedade do Ticket.

**Migração:** fora de escopo — o store é zerado no rollout do v3 (sem conversão de dados antigos).

---

## 8. Decisões do gate G1 (resolvidas) e pendências de Design

Resolvidas com o humano:

- **Q1** — Campo classificador da Issue: **`type`**.
- **Q2** — `closed_reason` do Ticket: **reutiliza** o enum da Issue.
- **Q3** — Desempate na fila entre Issues `ON-GOING`: **Ticket mais antigo** (FIFO puro).
- **Q4** — **Não** há reset de Issue `ON-GOING`; reset só em `CLAIMED`.
- **Q5** — Tipo da Issue **não** restringe os tipos de Ticket; a decomposição escolhe os tipos úteis, sob demanda.
- **Q6** — **IA e humano** podem reivindicar e transicionar Tickets; humano também cria/decide.
- **Q7** — Superfície de comandos: grupo `ticket` (Formato A), `next` unificado devolvendo Ticket — detalhada no `DESIGN_v3.md`.
- **Migração** — fora de escopo (base limpa).

---

## 9. Critérios de aceite deste Planning (G1)

Este Planning está pronto para aprovação quando o humano confirmar que:

1. O modelo Issue-agregado + Ticket-fatia tipada reflete a intenção.
2. Os enums (tipo da Issue, tipo do Ticket, status incl. `ON-GOING`) estão corretos.
3. A regra "Issue só avança com todos os Tickets `CLOSED`" e a fila com prioridade `ON-GOING` estão corretas.
4. O escopo (tracker + pack, sem migração) e as decisões §8 estão aceitáveis para seguir à Design.

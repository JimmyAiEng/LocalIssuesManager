# PRD — Issues Locais (CLI + web + pack)

| Campo | Valor |
|-------|--------|
| Produto | Gerenciador local de Issues via CLI + web, com pack de skills SDLC |
| Versão do documento | 3.1 (compilado) |
| Status | Vigente |
| Fontes compiladas | `PRD.md` (v1) · `PRD_v3.md` · `PRD-UI.md` |
| Escopo | Single-user, máquina local; tracker (domínio + CLI + web) e pack de skills |
| Fora de escopo | Orquestração profunda de agentes, sync multi-máquina, multiusuário, validação semântica de critérios |

---

## 1. Visão

Sistema local mínimo, acionável por humanos e por IAs (`cursor`, `claude-code`, `codex`, `pi`), para que o humano se concentre em **planejar** e **validar**, enquanto agentes consomem trabalho via CLI (e, opcionalmente, loop/harness).

A **Issue** é um **agregado** nascido de uma ideia/problema e resolvido por um ou mais **Tickets**. O tipo de trabalho SDLC (Planning → Design → Implement → QA → Deploy) vive no **Ticket**; o **tipo da Issue** classifica a intenção (`Fix` · `Feat` · `Research` · `Refactor`). O pack de skills roteia a skill de fase pelo **tipo do Ticket** reivindicado.

A UI local oferece visão espacial do fluxo e executa as ações humanas já previstas no domínio, sem substituir a CLI.

O sistema **não** define ritual de engenharia nem orquestra o “como” executar cada fase; apenas persiste agregados, histórico, transições e o pack de discovery.

---

## 2. Objetivos

1. Criar, consultar, listar, claimar e transicionar Issues e Tickets por CLI no PATH.
2. Garantir claim exclusivo (uma IA por Item claimado por vez).
3. Registrar histórico Human ↔ IA como thread append-only (exceto claim).
4. Separar o que IA pode fazer do que só humano pode (decisão em `AWAITING`, reset de `CLAIMED`).
5. Agrupar por projeto e filtrar fila/listagens.
6. Priorizar na fila o trabalho já iniciado (`ON-GOING` / Tickets `OPEN`) antes de novas Issues.
7. Só avançar a Issue para `AWAITING` quando **todos** os Tickets estiverem `CLOSED`.
8. Oferecer UI desktop local para acompanhar Status e executar Decisões/Reset/criação.
9. Entregar pack portátil (`AGENTS.md` + skills) instalável via `issues init`.

### Não-objetivos

- Validar qualidade de objetivos, tarefas ou critérios de aceite.
- Grafo obrigatório de dependência entre Tickets ( `--depends-on` é opcional).
- Prioridade além de “ON-GOING primeiro, depois FIFO”.
- Reabrir `CLOSED`, delete físico, sync multi-máquina.
- Skills de execução (TDD, review, mutation, Sonar) no pack — YAGNI; ficam no consumidor ou com o agente.

---

## 3. Personas e atores

| Ator | Identidade | Papel |
|------|------------|--------|
| Humano | distinto do enum de IA | Cria Issues/Tickets, decide `AWAITING`, reseta claims, usa a UI |
| IA | `cursor` \| `claude-code` \| `codex` \| `pi` | Claima via `next`, trabalha Ticket ou decompõe Issue, move a `AWAITING`/`CLOSED` sob regras |

Sem autenticação de rede; identidade = valor na CLI (`--human` ou `--agent`).

---

## 4. Modelo de dados

### 4.1 Issue (agregado)

| Campo | Regra |
|-------|-------|
| `id` | gerado |
| `title`, `project`, `problem` | obrigatórios |
| `type` | enum §4.3; imutável |
| `artifacts`, `acceptance_criteria` | **opcionais** |
| `status` | §4.5; inicia `OPEN` |
| `owner` | IA do último claim da Issue; limpo no reset |
| `closed_reason` | obrigatório se `CLOSED` |
| `human_presence` | true após qualquer ação humana |
| `thread` | append-only |
| `tickets` | lista de Tickets do agregado |
| `tags` | opcional: `complexity`, `human_need` (HITL/AFK), `risk` |

### 4.2 Ticket (fatia)

Pertence a exatamente uma Issue.

| Campo | Regra |
|-------|-------|
| `id`, `issue_id` | gerados / obrigatório |
| `objective`, `task`, `acceptance_criteria` | **obrigatórios** |
| `type` | enum §4.4; roteia skill |
| `status` | §4.5 sem `ON-GOING`; inicia `OPEN` |
| `owner` | IA **ou** humano |
| `closed_reason` | obrigatório se `CLOSED` |
| `artifacts`, `references` | opcionais |
| `depends_on` | opcional; CSV de irmãos; `next` só entrega se deps `AWAITING`/`CLOSED` |
| `thread` | append-only |
| `tags` | mesmas categorias da Issue |

`Confirmation` é tipo de Ticket **somente do sistema**: ao fechar o último Ticket de uma Issue `ON-GOING`, o sistema injeta um Ticket `Confirmation` `OPEN` para reabordar a Issue (confirmar → `AWAITING`, ou criar Tickets faltantes). Fechar o próprio `Confirmation` não gera outro.

### 4.3 Tipo da Issue

| Tipo | Significado |
|------|-------------|
| `Fix` | Bug / correção |
| `Feat` | Nova funcionalidade |
| `Research` | Pesquisa |
| `Refactor` | Refatoração |

`Maintenance` não existe; manutenção vira `Fix` ou `Refactor`.

### 4.4 Tipo do Ticket

| Tipo | Skill |
|------|-------|
| `Planning` | `planning-phase` |
| `Design` | `design-phase` |
| `Implement` | `implement-phase` |
| `QA` | `qa-phase` |
| `Deploy` | `deployment-phase` |
| `Confirmation` | `confirmation-phase` (sistema) |

### 4.5 Status

| Status | Vale para | Significado |
|--------|-----------|-------------|
| `OPEN` | Issue, Ticket | Na fila |
| `CLAIMED` | Issue, Ticket | Reivindicado |
| `ON-GOING` | **só Issue** | Com Tickets criados |
| `AWAITING` | Issue, Ticket | Aguarda decisão humana |
| `CLOSED` | Issue, Ticket | Encerrado; não reabre |

Motivos: `obsoleto` \| `duplicado` \| `concluido` \| `errado`.

### 4.6 Thread

Toda mudança de status **exceto** claim gera entrada com autor, timestamp, comentário obrigatório, status resultante e `closed_reason` se `CLOSED`.

---

## 5. Ciclo de vida

### 5.1 Issue

```text
OPEN ──claim──► CLAIMED ──1º Ticket──► ON-GOING ──todos Tickets CLOSED──► AWAITING ──decisão──► CLOSED | OPEN
                  │
                  └── reset (humano) ──► OPEN
```

- Não há reset de `ON-GOING`.
- A IA nunca move a Issue para `OPEN`/`CLOSED` a partir de `CLAIMED`/`ON-GOING`/`AWAITING`.
- `OPEN → CLOSED` por IA só se **sem** `human_presence`.

### 5.2 Ticket

```text
OPEN ──claim(IA|humano)──► CLAIMED ──► AWAITING | OPEN | CLOSED
                              AWAITING ──decisão humana──► CLOSED | OPEN
```

### 5.3 Matriz (resumo)

| Entidade | De → Para | Quem |
|----------|-----------|------|
| Issue | `OPEN → CLAIMED` | IA (`next`) |
| Issue | `CLAIMED → ON-GOING` | ao criar 1º Ticket |
| Issue | `ON-GOING → AWAITING` | IA (todos Tickets `CLOSED`) |
| Issue | `AWAITING → OPEN\|CLOSED` | humano |
| Issue | `CLAIMED → OPEN` | humano (reset) |
| Ticket | `OPEN → CLAIMED` | IA (`next`) ou humano |
| Ticket | `CLAIMED → AWAITING\|OPEN\|CLOSED` | owner |
| Ticket | `AWAITING → OPEN\|CLOSED` | humano |

### 5.4 Autonomia (tags HITL/AFK)

Em Issue com `human_need=HITL`: todo Ticket precisa de `human_need`; Planning/Design **devem** ser HITL (não AFK). Issue AFK ou sem tag não impõe restrição. Revalidar ao taguear Issue ou Ticket.

---

## 6. Fila (`next`)

1. Ticket `OPEN` mais antigo em Issue `ON-GOING` (respeitando `depends-on`) → claim do Ticket → `{ issue, ticket }`.
2. Senão, Issue `OPEN` mais antiga → claim → `{ issue }` (decompor).
3. Senão, vazio sem side effect.

Filtro opcional de projeto.

---

## 7. Requisitos funcionais — CLI / domínio

| ID | Capacidade |
|----|------------|
| RF-01 | Criar Issue (`type`, problema; artefatos/AC opcionais) |
| RF-02 | `next` unificado (§6) |
| RF-03 | Criar Ticket (Issue `CLAIMED`/`ON-GOING`); 1º → `ON-GOING` |
| RF-04 | Status do Ticket pelo owner |
| RF-05 | Decisão humana no Ticket |
| RF-06 | Issue → `AWAITING` só com todos Tickets `CLOSED` |
| RF-07 | Decisão humana na Issue |
| RF-08 | Reset Issue `CLAIMED → OPEN` (não `ON-GOING`) |
| RF-09 | Get/list Issues e Tickets |
| RF-10 | Comment (com anexos), tags |
| RF-11 | Preservar `human_presence`, sem delete, `CLOSED` imutável |
| RF-12 | Infra: harness, loop, worktree, `init` (pack), web |

Sintaxe canônica: `AGENTS.md` / `README.md` / `issues --help`.

---

## 8. Requisitos funcionais — UI

A UI é **só para o Humano**, desktop-first, mesma máquina, todos os projetos juntos. IAs usam a CLI. Sem drag-and-drop, sem polling; atualização manual + após ação da própria UI.

### Quadro

- Colunas: `OPEN` · `CLAIMED` · `ON-GOING` · `AWAITING` · `CLOSED` (contagem + cards mais antigos primeiro).
- Card: título, projeto, **tipo da Issue**, owner, tempo no Status; clique abre detalhe.
- Filtros: título, projeto, tipo; limpar filtros; botão Atualizar + hora da última leitura.

### Detalhe da Issue

- Metadados, problema, artefatos, AC, tags (com editor), thread, motivo de fechamento.
- Lista de **Tickets** (tipo, status, objective/task, thread, ações).
- Ações humanas válidas no Status atual: Decisão, Reset, fechar `OPEN`, criar Ticket quando `CLAIMED`/`ON-GOING`, claim/status de Ticket quando owner humano.
- Voltar ao quadro preservando filtros/rolagem na sessão.

### Criar Issue

- Formulário humano: título, projeto, tipo, problema (+ opcionais); validação prévia; sucesso abre o detalhe.

### Concorrência e estados

- Respeitar matriz do domínio; conflito de save → 409, preservar rascunho, oferecer Atualizar.
- Estados explícitos: loading, vazio, erro de leitura/validação, conflito, sucesso.
- Confirmação explícita só em fechamentos irreversíveis.

### Fora de escopo da UI

Editar Issue existente, reabrir `CLOSED`, comentário sem transição, IA como usuária, remoto, mobile dedicado, prioridade manual.

---

## 9. Pack de skills

- Camada 0: `AGENTS.md` → `sdlc-workflow`.
- Camada 1: `*-phase` pelo tipo do Ticket.
- `issues init` copia skills para `.agents/skills/` e liga `.cursor` / `.claude` / `.codex` / `.pi`.
- Sem camada 2 de execução (YAGNI).

---

## 10. Requisitos não funcionais

| ID | Requisito |
|----|-----------|
| RNF-01 | CLI no PATH (install/link/npx) |
| RNF-02 | Operação local; web em `127.0.0.1` |
| RNF-03 | Single-user |
| RNF-04 | Saída de `next`/`get` suficiente para IA sem UI |
| RNF-05 | UI desktop-first, acessibilidade básica, aparência escura/técnica |
| RNF-06 | Terminologia de `CONTEXT.md` |

---

## 11. Critérios de aceite do produto

1. Ciclo Issue+Ticket até `CLOSED` via CLI e decisão humana.
2. `next` prioriza Ticket de `ON-GOING` e devolve `{ issue, ticket? }`.
3. Issue só `AWAITING` com todos Tickets `CLOSED`; Confirmation injeta quando cabível.
4. Reset só em `CLAIMED`; matriz proibida rejeitada.
5. UI: quadro com Status (incl. `ON-GOING`), detalhe com Tickets, Decisão/Reset/criação.
6. Pack instalável; skills descobertas pelos harnesses após `init` / `skills:link`.
7. Tags HITL impõem autonomy nos Tickets.

---

## 12. Glossário (resumo)

| Termo | Definição |
|-------|-----------|
| Issue | Agregado tipado resolvido por Tickets |
| Ticket | Fatia tipada SDLC dentro de uma Issue |
| Claim | `OPEN → CLAIMED` |
| Owner | Ator do último claim |
| Thread | Histórico append-only com comentário |
| Decisão | Único caminho humano de `AWAITING` → `OPEN`\|`CLOSED` |
| ON-GOING | Issue com Tickets em andamento |
| Fila | Tickets `OPEN` de `ON-GOING` primeiro; senão Issues `OPEN` |

Glossário completo: `CONTEXT.md`.

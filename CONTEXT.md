# Issues Locais

Contexto único: gerenciador local de Issues via CLI, single-user, sem orquestração de agentes.
Modelo Issue-only (ADR 0005): não existem Tickets.

## Language

**Issue**:
Unidade de trabalho de uma sessão, persistida com título, projeto, TAG (tipo), Action, problema e status; pequena, com uma entrega única e governada pelo Gate da sua Action.
Trabalho maior vira novas Issues relacionadas.
_Avoid_: task, card, item, Ticket

**Action**:
Tipo imutável da entrega esperada da Issue: `Planning` | `Design` | `Implement` | `Review` | `Deploy`.
Seleciona o Workflow e o Gate que governam a Issue.
_Avoid_: phase (como campo), stage, ticket type

**Workflow**:
Processo do SDLC executado para entregar a Action. Não é persistido — a instância (jornada) é a linhagem de Issues até o problema original ser resolvido.
Nomes: Requirement Engineering (Planning), Design (Design), Unit of Work (Implement), Quality Review (Review) e Merge/PR Analysis (Deploy).
_Avoid_: workflow persistido, pipeline, fase (como entidade), process instance

**Gate**:
Contrato de conclusão selecionado pela Action. Declara, no mesmo padrão, requisitos de Artifacts, execução de código e aprovação humana (`none`, `required` ou `conditional`).
_Avoid_: regra de gate espalhada, gate com I/O

**Relates (linhagem)**:
Ligação opcional entre Issues (`relates`); quem reivindica uma Issue recebe os Artifacts das relacionadas no prompt. É o veículo de herança de contexto entre sessões (ex.: design congelado → implementação).
_Avoid_: dependency, blocker, parent/child

**Artifact**:
Todo item persistido junto à Issue e utilizável pelo trabalho, tipado por um Artifact Type.
O Gate define quais tipos a conclusão exige; quem reivindica herda os Artifacts da linhagem.
_Avoid_: Artefato (só o `.md`), attachment/anexo (como conceito separado), documento

**Artifact Type**:
Tipo do Artifact: `DocumentArtifact` (Markdown, ≤300 palavras), `RequirementArtifact` (PRD/Requirements como conjunto de Features estruturadas, JSONL), `UmlArtifact`, `ImplementationPlanArtifact` e `MediaArtifact` (imagem/vídeo, ≤25MB).
_Avoid_: kind, mediaType (como conceito)

**Evidência**:
Comentário obrigatório da conclusão pela IA (`AWAITING`/`CLOSED`): relatório curto do que foi feito, os passos e as decisões tomadas.
_Avoid_: resumo opcional, changelog

**Projeto**:
Registro obrigatório (`project.json`) com nome, repositório git local e o script de validação (`check`) das Issues Implement. Issues só nascem em projeto registrado.
_Avoid_: Workspace, namespace

**TAG**:
Tipo imutável da Issue (`Fix` | `Feat` | `Research` | `Refactor`); classifica a intenção/problema, não a entrega (que é a Action).
_Avoid_: Label, phase, stage, sprint, Maintenance

**Status**:
Estado operacional da Issue: `OPEN` | `CLAIMED` | `AWAITING` | `CLOSED`.
_Avoid_: State, workflow step, ON-GOING (extinto)

**Claim**:
Transição `OPEN → CLAIMED` que reserva a Issue a um ator (FIFO pela fila); não gera entrada na Thread.
_Avoid_: Lock, assign, checkout

**Owner**:
Identidade do ator do último Claim; limpo no Reset e na devolução para OPEN. Só o Owner conclui a Issue.
_Avoid_: Assignee, agent id (fora do claim)

**IA**:
Ator máquina com enum fixo: `cursor` | `claude-code` | `codex` | `pi`.
_Avoid_: Agent (como sinônimo genérico), bot, LLM

**Humano**:
Ator distinto das IAs; único autorizado a Reset, Decisão e a rebaixar tags de supervisão.
_Avoid_: User, operator

**Autonomia (AFK/HITL)**:
Regra de roteamento da GatePolicy, derivada das tags da Issue: `human_need=HITL`, `risk=ALTO` ou `complexity=ALTA` exigem decisão humana (a IA só envia para `AWAITING`); fora disso a IA está autorizada a fechar direto com Evidência, embora possa enviar voluntariamente para `AWAITING`.
_Avoid_: human_presence (extinto), permission level

**GatePolicy**:
Política do Gate avaliada quando a IA conclui a Issue: valida a entrega exigida e autoriza o desfecho — aprovada permite `CLOSED` ou escalonamento voluntário para `AWAITING`, decisão humana obrigatória permite somente `AWAITING`, reprovada bloqueia a conclusão.
_Avoid_: Validation, Gate de conclusão, G1–G4 (gates humanos do modelo antigo), approval step

**Limite de brevidade**:
Todo texto escrito (problema, artefato, comentário, evidência, feature de requisito) ≤ 300 palavras. Estourar o limite indica Issue grande demais; o remédio é decompor em Issues menores relacionadas.
_Avoid_: truncation, soft limit

**Thread**:
Histórico append-only de mudanças de status com comentário (exceto Claim); entradas breves.
_Avoid_: Log, comment stream, audit trail

**Decisão**:
Único caminho humano de `AWAITING` para `OPEN` ou `CLOSED` (painel web).
_Avoid_: Review, approve (como comando genérico)

**Reset**:
Ação humana `CLAIMED → OPEN` que limpa Owner e gera entrada na Thread.
_Avoid_: Unlock, release, unclaim

**Motivo de fechamento**:
Enum obrigatório em `CLOSED`: `obsoleto` | `duplicado` | `concluido` | `errado`.
_Avoid_: Close reason livre, resolution

**Fila**:
Seleção do `next`: a Issue `OPEN` mais antiga do Projeto (FIFO), ou uma específica por `--id`.
_Avoid_: Priority queue, backlog ranking

**Queue**:
Repositório concreto de Issues no domínio: persiste no filesystem (JSON por Issue + project.json), lista e seleciona o próximo trabalho. Não é Port/interface.
_Avoid_: IssueStore, FifoQueue, IssueRepository, FsQueueRepository

**Worktree**:
Sandbox git da Issue no repositório do Projeto; obrigatória para concluir uma Issue Implement.
_Avoid_: branch (sozinho), clone

**Unit of Work**:
Uma execução do Workflow de Implement: um agente levando a fatia até o check do Projeto passar, dentro de uma Worktree isolada.
Não é a Issue — uma Issue devolvida por Reset e reivindicada de novo origina uma nova Unit of Work.
_Avoid_: Ticket, task, card, tentativa, run

**Issue Receipt**:
Início de uma Unit of Work: o agente reivindica a Issue Implement, recebe o contexto herdado da linhagem e abre a Worktree.
_Avoid_: Ticket Receipt, pickup, checkout

**--human**:
Flag global da CLI que marca o comando como ação Humana; obrigatória nos comandos reservados ao Humano.
_Avoid_: --actor human, --user

## Loop autônomo

**Harness**:
Value Object que descreve como invocar um runner de código: uma IA (`agent`) e um template de comando com o placeholder `{prompt}`. Reutilizável entre Loops.
_Avoid_: Runner, engine, executor, bot

**Loop**:
Entidade que agrupa um Harness a um Projeto e a um intervalo e executa o trabalho autônomo da fila em Ticks agendados. Identidade pelo nome.
_Avoid_: Job, cron job, scheduler, daemon, worker

**Tick**:
Uma execução do Loop: puxa 1 item da fila (`next`), entrega-o ao Harness e registra o resultado (`empty` | `worked` | `error` | `timeout`). A repetição é do agendador do SO, não de um laço interno.
_Avoid_: Iteration, cycle, poll, run (genérico)

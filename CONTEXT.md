# Issues Locais

Contexto único: gerenciador local de Issues via CLI, single-user, sem orquestração de agentes.

## Language

**Issue**:
Unidade de trabalho persistida com título, projeto, TAG, corpo (problema, artefatos, critérios) e status.
_Avoid_: Ticket, task, card, item

**Projeto**:
Nome livre obrigatório que agrupa Issues; exatamente um por Issue.
_Avoid_: Workspace, repo, namespace

**TAG**:
Fase SDLC imutável da Issue (`Planning` | `Design` | `Implement` | `QA` | `Deployment` | `Maintenance`). Avanço de ciclo = fechar + criar outra.
_Avoid_: Label, phase, stage, sprint

**Status**:
Estado operacional da Issue: `OPEN` | `CLAIMED` | `AWAITING` | `CLOSED`.
_Avoid_: State, workflow step

**Claim**:
Transição `OPEN → CLAIMED` que reserva a Issue a uma IA (FIFO); não gera entrada na Thread.
_Avoid_: Lock, assign, checkout

**Owner**:
Identidade da IA do último Claim; limpo no Reset.
_Avoid_: Assignee, agent id (fora do claim)

**IA**:
Ator máquina com enum fixo: `cursor` | `claude-code` | `codex` | `pi`.
_Avoid_: Agent (como sinônimo genérico), bot, LLM

**Humano**:
Ator distinto das IAs; único autorizado a Reset e Decisão.
_Avoid_: User, operator

**Thread**:
Histórico append-only de mudanças de status com comentário obrigatório (exceto Claim).
_Avoid_: Log, comment stream, audit trail

**Decisão**:
Único caminho humano de `AWAITING` para `OPEN` ou `CLOSED`.
_Avoid_: Review, approve (como comando genérico)

**Reset**:
Ação humana `CLAIMED → OPEN` que limpa Owner e gera entrada na Thread.
_Avoid_: Unlock, release, unclaim

**Motivo de fechamento**:
Enum obrigatório em `CLOSED`: `obsoleto` | `duplicado` | `concluido` | `errado`.
_Avoid_: Close reason livre, resolution

**Fila**:
Ordenação FIFO estrita das Issues `OPEN` (mais antiga primeiro), com filtro opcional de Projeto.
_Avoid_: Priority queue, backlog ranking

**Queue**:
Repositório concreto de Issues no domínio: persiste no filesystem (comandos Linux), lista e devolve a Issue `OPEN` mais antiga (FIFO). Não é Port/interface.
_Avoid_: IssueStore, FifoQueue, IssueRepository, FsQueueRepository

**Human presence**:
Flag booleana da Issue; torna-se verdadeira na primeira ação Humana (create, Decisão, Reset, fechamento humano, etc.). Enquanto verdadeira, IA não pode fechar a Issue.
_Avoid_: created_by, human history scan, audit flag

**--human**:
Flag global da CLI que marca o comando como ação Humana; obrigatória nos comandos reservados ao Humano.
_Avoid_: --actor human, --user

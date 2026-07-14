# Issues Locais

Contexto único: gerenciador local de Issues via CLI, single-user, sem orquestração de agentes.

## Language

**Issue**:
Agregado de trabalho persistido com título, projeto, TAG (tipo), problema e status; nasce de uma ideia/problema e é resolvido por um ou mais Tickets. Artefatos e critérios de aceite são opcionais na Issue.
_Avoid_: task, card, item

**Ticket**:
Fatia de solução dentro de uma Issue (pertence a exatamente uma); tem objetivo, tarefa, critérios de aceite obrigatórios, um tipo SDLC (`Planning` | `Design` | `Implement` | `QA` | `Deploy`) e status próprio. O tipo do Ticket roteia a skill de fase.
_Avoid_: Subtask, story, subissue, card

**Objective / Task**:
Campos obrigatórios do Ticket: **Objective** = o que a fatia busca alcançar; **Task** = o trabalho a executar para alcançá-lo.
_Avoid_: goal/todo livre, descrição única

**Projeto**:
Nome livre obrigatório que agrupa Issues; exatamente um por Issue.
_Avoid_: Workspace, repo, namespace

**TAG**:
Tipo imutável da Issue (`Fix` | `Feat` | `Research` | `Refactor`); classifica a intenção, não a fase. A fase/tipo de trabalho SDLC deixou de ser propriedade da Issue e passou a ser propriedade do **Ticket** (`type`).
_Avoid_: Label, phase, stage, sprint, Maintenance

**Status**:
Estado operacional da Issue: `OPEN` | `CLAIMED` | `ON-GOING` | `AWAITING` | `CLOSED`. Ticket usa o mesmo enum **sem** `ON-GOING`.
_Avoid_: State, workflow step

**ON-GOING**:
Status exclusivo da Issue: agregado com Tickets já criados, em andamento. A Issue entra em `ON-GOING` ao criar o 1º Ticket e só avança a `AWAITING` quando **todos** os Tickets estão `CLOSED`. Não há reset de `ON-GOING`.
_Avoid_: IN_PROGRESS, WIP, ACTIVE

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
Seleção do `next`: prioriza o Ticket `OPEN` mais antigo (FIFO) de Issues `ON-GOING`; se não houver, devolve a Issue `OPEN` mais antiga para decompor. Retorno `{ issue, ticket? }`, com filtro opcional de Projeto.
_Avoid_: Priority queue, backlog ranking

**Queue**:
Repositório concreto de Issues no domínio: persiste no filesystem, lista e seleciona o próximo trabalho (Ticket de Issue `ON-GOING` primeiro, senão Issue `OPEN` mais antiga). Não é Port/interface.
_Avoid_: IssueStore, FifoQueue, IssueRepository, FsQueueRepository

**Human presence**:
Flag booleana da Issue; torna-se verdadeira na primeira ação Humana (create, Decisão, Reset, fechamento humano, etc.). Enquanto verdadeira, IA não pode fechar a Issue.
_Avoid_: created_by, human history scan, audit flag

**--human**:
Flag global da CLI que marca o comando como ação Humana; obrigatória nos comandos reservados ao Humano.
_Avoid_: --actor human, --user

import { randomUUID } from "node:crypto";
import type { AttachmentData } from "./attachment_entity.js";
import { DomainError } from "./domain_error.js";
import { requiredHumanNeed, Ticket, type CreateTicket, type TicketData } from "./ticket_entity.js";
import { applyTags, assertDecision, assertNoDowngrade, required, threadEntry, TICKET_TYPES, type Actor, type AgentId, type ClosedReason, type Decision, type IssueStatus, type IssueType, type Tags, type TagUpdates, type TicketStatus, type TicketType, type Thread, type Worktree } from "./value_objects.js";

export type Phase = { status: IssueStatus; timestamp: string };
export type CreateIssue = {
  title: string; project: string; type: IssueType; problem: string;
  artifacts?: string; acceptance_criteria?: string; attachments?: AttachmentData[];
};
export type IssueData = {
  id: string; title: string; project: string; type: IssueType; problem: string;
  artifacts: string; acceptance_criteria: string; status: IssueStatus; owner: Actor | null;
  closed_reason: ClosedReason | null; claimed_at: string | null; created_at: string;
  status_changed_at: string; human_presence: boolean; thread: Thread[]; phases: Phase[];
  tickets: TicketData[]; revision: number; tags: Tags; worktree: Worktree | null;
};

export class Issue implements IssueData {
  id!: string; title!: string; project!: string; type!: IssueType;
  problem!: string; artifacts!: string; acceptance_criteria!: string;
  status!: IssueStatus; owner!: Actor | null; closed_reason!: ClosedReason | null;
  claimed_at!: string | null; created_at!: string; status_changed_at!: string;
  human_presence!: boolean; thread!: Thread[]; phases!: Phase[];
  tickets!: Ticket[]; revision!: number; tags!: Tags; worktree!: Worktree | null; baseRevision!: number;

  private constructor(data: IssueData) {
    Object.assign(this, data);
    this.tickets = data.tickets.map((ticket) => Ticket.fromJSON(ticket));
    this.tags = data.tags ?? {};
    this.worktree = data.worktree ?? null; // ausente em Issues antigas
    this.baseRevision = data.revision;
  }

  static create(input: CreateIssue, actor: Actor, now = new Date()): Issue {
    for (const key of ["title", "project", "type", "problem"] as const) required(input[key], key);
    const timestamp = now.toISOString();
    return new Issue(Issue.#initialData(input, actor, timestamp));
  }

  static #initialData(input: CreateIssue, actor: Actor, timestamp: string): IssueData {
    const { attachments, ...fields } = input;
    const base = threadEntry(actor, timestamp, "Issue created", "OPEN", null);
    const entry = attachments?.length ? { ...base, attachments } : base;
    return { ...fields, artifacts: input.artifacts ?? "", acceptance_criteria: input.acceptance_criteria ?? "",
      id: randomUUID(), status: "OPEN", owner: null, closed_reason: null, claimed_at: null,
      created_at: timestamp, status_changed_at: timestamp, human_presence: actor === "human",
      thread: [entry], phases: [{ status: "OPEN", timestamp }], tickets: [], revision: 0, tags: {}, worktree: null };
  }

  static fromJSON(data: IssueData): Issue {
    return new Issue(structuredClone(data));
  }

  claim(actor: Actor, now = new Date()): void {
    this.#expect("OPEN");
    this.owner = actor;
    if (actor === "human") this.human_presence = true;
    this.claimed_at = now.toISOString();
    this.#changeStatus("CLAIMED", now);
  }

  addTicket(ticket: Ticket, now = new Date()): void {
    if (this.status !== "CLAIMED" && this.status !== "ON-GOING") {
      throw new DomainError(`Expected CLAIMED or ON-GOING, got ${this.status}`);
    }
    if (ticket.issue_id !== this.id) throw new DomainError("Ticket belongs to another Issue");
    // A heurística de autonomia precisa de entrada: sem classificação não há como derivar supervisão.
    if (!this.tags.risk || !this.tags.complexity) throw new DomainError("Issue sem classificação: risk e complexity são obrigatórios para criar Ticket");
    const blocker = this.phaseBlocker(ticket.type);
    if (blocker) throw new DomainError(`Ticket de ${ticket.type} bloqueado: ${blocker.type} da fase anterior não está CLOSED`);
    for (const depId of ticket.depends_on) {
      if (!this.tickets.some((candidate) => candidate.id === depId)) {
        throw new DomainError(`Dependency not found: ${depId}`);
      }
    }
    this.#deriveAutonomy(ticket); // só após todas as validações: addTicket rejeitado não marca o Ticket
    this.tickets.push(ticket);
    if (this.status === "CLAIMED") this.#changeStatus("ON-GOING", now);
    else this.#bumpRevision();
  }

  claimTicket(ticketId: string, actor: Actor, now = new Date()): void {
    this.ticket(ticketId).claim(actor, now);
    this.#bumpRevision();
  }

  comment(actor: Actor, comment: string, attachments: AttachmentData[] = [], now = new Date()): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    if (!comment.trim() && attachments.length === 0) throw new DomainError("comment or attachment is required");
    const entry = threadEntry(actor, now.toISOString(), comment, this.status, null);
    this.thread.push({ ...entry, attachments });
    this.#bumpRevision();
  }

  commentTicket(ticketId: string, actor: Actor, comment: string, attachments: AttachmentData[] = [], now = new Date()): void {
    this.ticket(ticketId).comment(actor, comment, attachments, now);
    this.#bumpRevision();
  }

  // Retag nunca é rejeitado por causa de autonomia: informação nova sobre a Issue não deve esbarrar
  // num Ticket antigo. A autonomia derivada é recomputada para não ficar stale em relação às tags.
  // A tag da Issue é a entrada da autonomia derivada (requiredHumanNeed lê issue.tags): rebaixá-la
  // é o agente recuperando a caneta sobre a própria supervisão pela porta dos fundos. Por isso a
  // mutação tem dono: IA só escala, humano faz nos dois sentidos.
  tag(updates: TagUpdates, actor: Actor): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    const next = applyTags(this.tags, updates); // valida enums antes de julgar severidade
    if (actor !== "human") assertNoDowngrade(this.tags, next);
    this.tags = next; // ordem load-bearing: #deriveAutonomy lê this.tags
    for (const ticket of this.tickets) {
      if (ticket.status !== "CLOSED") this.#deriveAutonomy(ticket); // CLOSED é imutável: registra a decisão da época
    }
    this.#bumpRevision();
  }

  // A autonomia do Ticket é derivada da Issue, nunca declarada: o agregado raiz é a única fonte
  // autoritativa das tags, e é ele quem estampa. Serve addTicket, tag (recompute) e #confirmWhenDone.
  #deriveAutonomy(ticket: Ticket): void {
    ticket.tag({ human_need: requiredHumanNeed(this, ticket.type) });
  }

  // Registra a worktree git da Issue; todos os Tickets resolvem para ela lendo issue.worktree.
  setWorktree(worktree: Worktree): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    this.worktree = worktree;
    this.#bumpRevision();
  }

  // Limpeza da worktree (após CLOSED, decisão humana); permitido em qualquer status.
  clearWorktree(): void {
    this.worktree = null;
    this.#bumpRevision();
  }

  tagTicket(ticketId: string, updates: TagUpdates): void {
    if (updates.human_need) throw new DomainError("human_need do Ticket é derivado da Issue (type × risk × complexity), não pode ser marcado");
    this.ticket(ticketId).tag(updates);
    this.#bumpRevision();
  }

  transitionTicket(ticketId: string, actor: Actor, status: TicketStatus, comment: string, reason?: ClosedReason, last = false, now = new Date(), attachments: AttachmentData[] = []): void {
    const ticket = this.ticket(ticketId);
    ticket.changeStatus(actor, status, comment, reason, last, now, attachments);
    this.#bumpRevision();
    this.#confirmWhenDone(ticket, actor, now);
  }

  decideTicket(ticketId: string, status: "OPEN" | "CLOSED", comment: string, reason?: ClosedReason, last = false, now = new Date(), attachments: AttachmentData[] = []): void {
    const ticket = this.ticket(ticketId);
    ticket.decide(status, comment, reason, last, now, attachments);
    this.#bumpRevision();
    this.#confirmWhenDone(ticket, "human", now);
  }

  reset(comment: string, now = new Date(), attachments: AttachmentData[] = []): void {
    this.#expect("CLAIMED");
    required(comment, "comment");
    this.#clearClaim();
    this.human_presence = true;
    this.#transition("OPEN", "human", comment, null, now, attachments);
  }

  decide(status: Decision, comment: string, reason?: ClosedReason, now = new Date(), attachments: AttachmentData[] = []): void {
    this.#expect("AWAITING");
    assertDecision(status, comment, reason);
    if (status === "OPEN") this.#clearClaim();
    this.human_presence = true;
    this.#transition(status, "human", comment, reason ?? null, now, attachments);
  }

  closeByAgent(agent: AgentId, comment: string, reason: ClosedReason, now = new Date()): void {
    this.#expect("OPEN");
    if (this.human_presence) throw new DomainError("Human presence prevents IA closure");
    this.#transition("CLOSED", agent, comment, reason, now);
  }

  closeByHuman(comment: string, reason: ClosedReason, now = new Date()): void {
    this.#expect("OPEN");
    this.human_presence = true;
    this.#transition("CLOSED", "human", comment, reason, now);
  }

  // Ordem das fases = ordem de TICKET_TYPES (Planning → … → Deploy → Confirmation).
  // Um Ticket só pode ser criado ou entregue pela fila quando todos os de fases
  // anteriores estão CLOSED; Confirmation é a última fase e nunca bloqueia ninguém.
  phaseBlocker(type: TicketType): Ticket | null {
    const rank = TICKET_TYPES.indexOf(type);
    return this.tickets.find((ticket) => ticket.status !== "CLOSED" && TICKET_TYPES.indexOf(ticket.type) < rank) ?? null;
  }

  // Tickets OPEN prontos para a fila: dependências satisfeitas e fase anterior concluída, ordenados FIFO.
  readyTickets(): Ticket[] {
    return this.tickets
      .filter((ticket) => ticket.status === "OPEN" && this.dependenciesMet(ticket.id) && !this.phaseBlocker(ticket.type))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  }

  dependenciesMet(ticketId: string): boolean {
    return this.ticket(ticketId).depends_on.every((depId) => {
      const dep = this.tickets.find((candidate) => candidate.id === depId);
      return dep != null && (dep.status === "AWAITING" || dep.status === "CLOSED");
    });
  }

  // Storage key do Artefato .md: o próprio Ticket (se ticketId) ou a Issue. Guarda CLOSED-imutável
  // nas duas dimensões; não muta nem faz bump de revisão (o setArtifact não persiste o JSON).
  artifactOwnerId(ticketId?: string): string {
    const target = ticketId ? this.ticket(ticketId) : this;
    if (target.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    return ticketId ?? this.id;
  }

  ticket(ticketId: string): Ticket {
    const ticket = this.tickets.find((candidate) => candidate.id === ticketId);
    if (!ticket) throw new DomainError(`Ticket not found: ${ticketId}`);
    return ticket;
  }

  // Destrava a Issue: ao fechar o último Ticket, injeta um Ticket de confirmação
  // OPEN para a fila (next) reabordar a Issue. Ao fechar o próprio Confirmation
  // (por IA ou humano), avança a Issue para AWAITING — quebra o loop e destrava.
  #confirmWhenDone(closed: Ticket, actor: Actor, now: Date): void {
    if (this.status !== "ON-GOING" || closed.status !== "CLOSED") return;
    if (!this.tickets.every((ticket) => ticket.status === "CLOSED")) return; // ainda há trabalho aberto
    if (closed.type === "Confirmation") {
      this.#transition("AWAITING", actor, "Confirmação concluída", null, now);
      return;
    }
    if (!closed.last) return; // só a fase final (marcada --last) dispara o Confirmation
    // Não passa por addTicket de propósito: Issue legada não classificada precisa conseguir destravar
    // (a função de autonomia é total e deriva AFK). A tag é derivada, não copiada da Issue.
    const confirmation = Ticket.create(Issue.#confirmationTicket(this.id, actor), now);
    this.#deriveAutonomy(confirmation);
    this.tickets.push(confirmation); // mesma operação do close: sem #bumpRevision extra
  }

  static #confirmationTicket(issueId: string, actor: Actor): CreateTicket {
    return { issue_id: issueId, type: "Confirmation", actor,
      objective: "Confirmar se a Issue foi resolvida",
      task: "Verifique se o problema da Issue foi resolvido pelos Tickets concluídos. Se sim, mova a Issue para AWAITING; se não, crie os Tickets necessários para concluir o trabalho.",
      acceptance_criteria: "Issue movida para AWAITING com o resumo da verificação, ou novos Tickets cobrindo o trabalho restante." };
  }

  #transition(status: IssueStatus, actor: Actor, comment: string, reason: ClosedReason | null, now: Date,
    attachments: AttachmentData[] = []): void {
    const base = threadEntry(actor, now.toISOString(), comment, status, reason);
    this.thread.push(attachments.length ? { ...base, attachments } : base);
    this.closed_reason = reason;
    this.#changeStatus(status, now);
  }

  #changeStatus(status: IssueStatus, now: Date): void {
    const timestamp = now.toISOString();
    this.status = status;
    this.status_changed_at = timestamp;
    this.phases.push({ status, timestamp });
    this.#bumpRevision();
  }

  #bumpRevision(): void {
    this.revision++;
  }

  #clearClaim(): void {
    this.owner = null;
    this.claimed_at = null;
  }

  #expect(status: IssueStatus): void {
    if (this.status !== status) throw new DomainError(`Expected ${status}, got ${this.status}`);
  }

  toJSON(): IssueData {
    const { baseRevision, tickets, ...rest } = this;
    return structuredClone({ ...rest, tickets: tickets.map((ticket) => ticket.toJSON()) });
  }
}

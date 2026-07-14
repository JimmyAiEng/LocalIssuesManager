import { randomUUID } from "node:crypto";
import type { AttachmentData } from "./attachment_entity.js";
import { DomainError } from "./domain_error.js";
import { Ticket, type TicketData } from "./ticket_entity.js";
import { applyTags, type Actor, type AgentId, type ClosedReason, type IssueStatus, type IssueType, type Tags, type TagUpdates, type TicketStatus, type Thread } from "./value_objects.js";

export type Phase = { status: IssueStatus; timestamp: string };
export type CreateIssue = {
  title: string; project: string; type: IssueType; problem: string;
  artifacts?: string; acceptance_criteria?: string;
};
export type IssueData = {
  id: string; title: string; project: string; type: IssueType; problem: string;
  artifacts: string; acceptance_criteria: string; status: IssueStatus; owner: AgentId | null;
  closed_reason: ClosedReason | null; claimed_at: string | null; created_at: string;
  status_changed_at: string; human_presence: boolean; thread: Thread[]; phases: Phase[];
  tickets: TicketData[]; revision: number; tags: Tags;
};

const required = (value: string, name: string) => {
  if (!value.trim()) throw new DomainError(`${name} is required`);
};

export class Issue implements IssueData {
  id!: string; title!: string; project!: string; type!: IssueType;
  problem!: string; artifacts!: string; acceptance_criteria!: string;
  status!: IssueStatus; owner!: AgentId | null; closed_reason!: ClosedReason | null;
  claimed_at!: string | null; created_at!: string; status_changed_at!: string;
  human_presence!: boolean; thread!: Thread[]; phases!: Phase[];
  tickets!: Ticket[]; revision!: number; tags!: Tags; baseRevision!: number;

  private constructor(data: IssueData) {
    Object.assign(this, data);
    this.tickets = data.tickets.map((ticket) => Ticket.fromJSON(ticket));
    this.tags = data.tags ?? {};
    this.baseRevision = data.revision;
  }

  static create(input: CreateIssue, actor: Actor, now = new Date()): Issue {
    for (const key of ["title", "project", "type", "problem"] as const) required(input[key], key);
    const timestamp = now.toISOString();
    return new Issue(Issue.#initialData(input, actor, timestamp));
  }

  static #initialData(input: CreateIssue, actor: Actor, timestamp: string): IssueData {
    const entry = Issue.#entry(actor, timestamp, "Issue created", "OPEN", null);
    return { ...input, artifacts: input.artifacts ?? "", acceptance_criteria: input.acceptance_criteria ?? "",
      id: randomUUID(), status: "OPEN", owner: null, closed_reason: null, claimed_at: null,
      created_at: timestamp, status_changed_at: timestamp, human_presence: actor === "human",
      thread: [entry], phases: [{ status: "OPEN", timestamp }], tickets: [], revision: 0, tags: {} };
  }

  static fromJSON(data: IssueData): Issue {
    return new Issue(structuredClone(data));
  }

  claim(agent: AgentId, now = new Date()): void {
    this.#expect("OPEN");
    this.owner = agent;
    this.claimed_at = now.toISOString();
    this.#changeStatus("CLAIMED", now);
  }

  addTicket(ticket: Ticket, now = new Date()): void {
    if (this.status !== "CLAIMED" && this.status !== "ON-GOING") {
      throw new DomainError(`Expected CLAIMED or ON-GOING, got ${this.status}`);
    }
    if (ticket.issue_id !== this.id) throw new DomainError("Ticket belongs to another Issue");
    this.tickets.push(ticket);
    if (this.status === "CLAIMED") this.#changeStatus("ON-GOING", now);
    else this.#touch();
  }

  claimTicket(ticketId: string, actor: Actor, now = new Date()): void {
    this.#ticket(ticketId).claim(actor, now);
    this.#touch();
  }

  comment(actor: Actor, comment: string, attachments: AttachmentData[] = [], now = new Date()): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    if (!comment.trim() && attachments.length === 0) throw new DomainError("comment or attachment is required");
    const entry = Issue.#entry(actor, now.toISOString(), comment, this.status, null);
    this.thread.push({ ...entry, attachments });
    this.#touch();
  }

  commentTicket(ticketId: string, actor: Actor, comment: string, attachments: AttachmentData[] = [], now = new Date()): void {
    this.#ticket(ticketId).comment(actor, comment, attachments, now);
    this.#touch();
  }

  tag(updates: TagUpdates): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    this.tags = applyTags(this.tags, updates);
    this.#touch();
  }

  tagTicket(ticketId: string, updates: TagUpdates): void {
    this.#ticket(ticketId).tag(updates);
    this.#touch();
  }

  transitionTicket(ticketId: string, actor: Actor, status: TicketStatus, comment: string, reason?: ClosedReason, now = new Date()): void {
    this.#ticket(ticketId).changeStatus(actor, status, comment, reason, now);
    this.#touch();
  }

  decideTicket(ticketId: string, status: "OPEN" | "CLOSED", comment: string, reason?: ClosedReason, now = new Date()): void {
    this.#ticket(ticketId).decide(status, comment, reason, now);
    this.#touch();
  }

  await(agent: AgentId, comment: string, now = new Date()): void {
    this.#expect("ON-GOING");
    if (this.owner !== agent) throw new DomainError("Only the Owner may await");
    required(comment, "comment");
    if (!this.tickets.every((ticket) => ticket.status === "CLOSED")) {
      throw new DomainError("All Tickets must be CLOSED");
    }
    this.#transition("AWAITING", agent, comment, null, now);
  }

  reset(comment: string, now = new Date()): void {
    this.#expect("CLAIMED");
    required(comment, "comment");
    this.#clearClaim();
    this.human_presence = true;
    this.#transition("OPEN", "human", comment, null, now);
  }

  decide(status: "OPEN" | "CLOSED", comment: string, reason?: ClosedReason, now = new Date()): void {
    this.#expect("AWAITING");
    if (status === "OPEN") required(comment, "comment");
    if (status === "CLOSED" && !reason) throw new DomainError("Closed reason is required");
    if (status === "OPEN" && reason) throw new DomainError("OPEN cannot have a closed reason");
    if (status === "OPEN") this.#clearClaim();
    this.human_presence = true;
    this.#transition(status, "human", comment, reason ?? null, now);
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

  #ticket(ticketId: string): Ticket {
    const ticket = this.tickets.find((candidate) => candidate.id === ticketId);
    if (!ticket) throw new DomainError(`Ticket not found: ${ticketId}`);
    return ticket;
  }

  #transition(status: IssueStatus, actor: Actor, comment: string, reason: ClosedReason | null, now: Date): void {
    const timestamp = now.toISOString();
    this.thread.push(Issue.#entry(actor, timestamp, comment, status, reason));
    this.closed_reason = reason;
    this.#changeStatus(status, now);
  }

  #changeStatus(status: IssueStatus, now: Date): void {
    const timestamp = now.toISOString();
    this.status = status;
    this.status_changed_at = timestamp;
    this.phases.push({ status, timestamp });
    this.#touch();
  }

  #touch(): void {
    this.revision++;
  }

  #clearClaim(): void {
    this.owner = null;
    this.claimed_at = null;
  }

  #expect(status: IssueStatus): void {
    if (this.status !== status) throw new DomainError(`Expected ${status}, got ${this.status}`);
  }

  static #entry(actor: Actor, timestamp: string, comment: string, status: IssueStatus, closed_reason: ClosedReason | null): Thread {
    return { actor, timestamp, comment, status, closed_reason };
  }

  toJSON(): IssueData {
    const { baseRevision, tickets, ...rest } = this;
    return structuredClone({ ...rest, tickets: tickets.map((ticket) => ticket.toJSON()) });
  }
}

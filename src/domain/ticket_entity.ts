import { randomUUID } from "node:crypto";
import type { AttachmentData } from "./attachment_entity.js";
import { DomainError } from "./domain_error.js";
import { applyTags, type Actor, type ClosedReason, type HumanNeed, type Tags, type TagUpdates, type Thread, type TicketStatus, type TicketType } from "./value_objects.js";

export type CreateTicket = {
  issue_id: string; objective: string; task: string; acceptance_criteria: string;
  type: TicketType; artifacts?: string; references?: string; depends_on?: string[]; actor: Actor; human_need?: HumanNeed;
};

// Grau de autonomia: numa Issue HITL todo Ticket precisa da tag human_need,
// e os de Planning/Design são obrigatoriamente HITL (não podem ser AFK).
// Issue AFK ou sem tag não impõe restrição. Validação usada na criação e
// marcação de Ticket e ao mudar a autonomia da própria Issue.
export function assertTicketAutonomy(issueHumanNeed: HumanNeed | undefined, type: TicketType, humanNeed: HumanNeed | undefined): void {
  if (issueHumanNeed !== "HITL") return;
  if (!humanNeed) throw new DomainError("Issue HITL: todo Ticket precisa da tag de autonomia (human_need)");
  if ((type === "Planning" || type === "Design") && humanNeed !== "HITL") {
    throw new DomainError(`Issue HITL: Ticket de ${type} deve ser HITL, não pode ser AFK`);
  }
}
export type TicketData = {
  id: string; issue_id: string; objective: string; task: string;
  acceptance_criteria: string; type: TicketType; status: TicketStatus;
  owner: Actor | null; closed_reason: ClosedReason | null; artifacts: string;
  references: string; depends_on: string[]; created_at: string; status_changed_at: string; thread: Thread[]; tags: Tags;
};

type Decision = "OPEN" | "CLOSED";

const required = (value: string, name: string) => {
  if (!value.trim()) throw new DomainError(`${name} is required`);
};

export class Ticket implements TicketData {
  id!: string; issue_id!: string; objective!: string; task!: string;
  acceptance_criteria!: string; type!: TicketType; status!: TicketStatus;
  owner!: Actor | null; closed_reason!: ClosedReason | null; artifacts!: string;
  references!: string; depends_on!: string[]; created_at!: string; status_changed_at!: string; thread!: Thread[]; tags!: Tags;

  private constructor(data: TicketData) {
    Object.assign(this, data);
    this.tags = data.tags ?? {};
    this.depends_on = data.depends_on ?? []; // ausente em Tickets antigos
  }

  static create(input: CreateTicket, now = new Date()): Ticket {
    for (const key of ["issue_id", "objective", "task", "acceptance_criteria"] as const) {
      required(input[key], key);
    }
    return new Ticket(Ticket.#initialData(input, now.toISOString()));
  }

  static #initialData(input: CreateTicket, timestamp: string): TicketData {
    const entry = Ticket.#entry(input.actor, timestamp, "Ticket created", "OPEN", null);
    return { id: randomUUID(), issue_id: input.issue_id, objective: input.objective,
      task: input.task, acceptance_criteria: input.acceptance_criteria, type: input.type,
      status: "OPEN", owner: null, closed_reason: null, artifacts: input.artifacts ?? "",
      references: input.references ?? "", depends_on: input.depends_on ?? [], created_at: timestamp, status_changed_at: timestamp,
      thread: [entry], tags: input.human_need ? { human_need: input.human_need } : {} };
  }

  static fromJSON(data: TicketData): Ticket {
    return new Ticket(structuredClone(data));
  }

  claim(actor: Actor, now = new Date()): void {
    this.#expect("OPEN");
    this.owner = actor;
    this.#changeStatus("CLAIMED", now);
  }

  changeStatus(actor: Actor, status: TicketStatus, comment: string, reason?: ClosedReason, now = new Date()): void {
    this.#expect("CLAIMED");
    if (this.owner !== actor) throw new DomainError("Only the Owner may change status");
    if (status === "CLAIMED") throw new DomainError("Invalid ticket transition");
    if (status === "CLOSED" && !reason) throw new DomainError("Closed reason is required");
    if (status !== "CLOSED" && reason) throw new DomainError(`${status} cannot have a closed reason`);
    required(comment, "comment");
    if (status === "OPEN") this.owner = null;
    this.#transition(status, actor, comment, reason ?? null, now);
  }

  comment(actor: Actor, comment: string, attachments: AttachmentData[] = [], now = new Date()): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    if (!comment.trim() && attachments.length === 0) throw new DomainError("comment or attachment is required");
    const entry = Ticket.#entry(actor, now.toISOString(), comment, this.status, null);
    this.thread.push({ ...entry, attachments });
  }

  tag(updates: TagUpdates): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    this.tags = applyTags(this.tags, updates);
  }

  decide(status: Decision, comment: string, reason?: ClosedReason, now = new Date()): void {
    this.#expect("AWAITING");
    if (status === "OPEN") required(comment, "comment");
    if (status === "CLOSED" && !reason) throw new DomainError("Closed reason is required");
    if (status === "OPEN" && reason) throw new DomainError("OPEN cannot have a closed reason");
    if (status === "OPEN") this.owner = null;
    this.#transition(status, "human", comment, reason ?? null, now);
  }

  #transition(status: TicketStatus, actor: Actor, comment: string, reason: ClosedReason | null, now: Date): void {
    const timestamp = now.toISOString();
    this.thread.push(Ticket.#entry(actor, timestamp, comment, status, reason));
    this.closed_reason = reason;
    this.#changeStatus(status, now);
  }

  #changeStatus(status: TicketStatus, now: Date): void {
    this.status = status;
    this.status_changed_at = now.toISOString();
  }

  #expect(status: TicketStatus): void {
    if (this.status !== status) throw new DomainError(`Expected ${status}, got ${this.status}`);
  }

  static #entry(actor: Actor, timestamp: string, comment: string, status: TicketStatus, closed_reason: ClosedReason | null): Thread {
    return { actor, timestamp, comment, status, closed_reason };
  }

  toJSON(): TicketData {
    return structuredClone({ ...this });
  }
}

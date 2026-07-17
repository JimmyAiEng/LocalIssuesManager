import { randomUUID } from "node:crypto";
import type { AttachmentData } from "./attachment_entity.js";
import { DomainError } from "./domain_error.js";
import { applyTags, assertDecision, required, threadEntry, type Actor, type ClosedReason, type Decision, type HumanNeed, type IssueType, type Tags, type TagUpdates, type Thread, type TicketStatus, type TicketType } from "./value_objects.js";

export type CreateTicket = {
  issue_id: string; objective: string; task: string; acceptance_criteria: string;
  type: TicketType; artifacts?: string; references?: string; depends_on?: string[]; actor: Actor;
  attachments?: AttachmentData[];
};

// A Issue vista pela regra de autonomia. Estrutural (não a classe Issue) para não criar o ciclo
// de import ticket_entity → issue_entity; a classe Issue satisfaz este shape de graça.
export type Classified = { type: IssueType; tags: Tags };

// Gatilhos de supervisão aprovados (Artefato da Issue 164fe3fc): cada um mapeia uma condição da
// Issue para os tipos de Ticket que ela força a HITL. Supervisão humana é cara: gasta-se onde o
// erro é caro de desfazer e invisível para a automação.
const AUTONOMY_TRIGGERS: readonly [(issue: Classified) => boolean, readonly TicketType[]][] = [
  [({ tags }) => tags.human_need === "HITL", ["Planning", "Design", "Deploy", "Confirmation"]], // override humano
  [({ tags }) => tags.risk === "ALTO", ["Design", "QA", "Deploy", "Confirmation"]], // risco alto
  [({ tags }) => tags.risk === "MEDIO", ["Deploy"]], // risco médio: porta de sentido único
  [({ tags }) => tags.complexity === "ALTA", ["Planning", "Design"]], // complexidade alta
  [({ type }) => type === "Research", ["Planning", "Design"]], // spec desconhecida
  [({ type }) => type === "Feat", ["Planning"]], // superfície nova: escopo é decisão de produto
  [({ tags }) => tags.risk === "ALTO" && tags.complexity === "ALTA", ["Implement"]], // combo tóxico
];

// Autonomia do Ticket derivada da Issue — o agente não tem caneta sobre a própria supervisão.
// Max wins: HITL se qualquer gatilho disparar; default AFK. TOTAL: tag ausente nunca dispara
// gatilho (risk indefinido não é risco alto), o que mantém Issue legada sem classificação destravável.
export function requiredHumanNeed(issue: Classified, ticketType: TicketType): HumanNeed {
  const forced = AUTONOMY_TRIGGERS.some(([fires, types]) => fires(issue) && types.includes(ticketType));
  return forced ? "HITL" : "AFK";
}
export type TicketData = {
  id: string; issue_id: string; objective: string; task: string;
  acceptance_criteria: string; type: TicketType; status: TicketStatus;
  owner: Actor | null; closed_reason: ClosedReason | null; artifacts: string;
  references: string; depends_on: string[]; created_at: string; status_changed_at: string; thread: Thread[]; tags: Tags; last: boolean;
};

export class Ticket implements TicketData {
  id!: string; issue_id!: string; objective!: string; task!: string;
  acceptance_criteria!: string; type!: TicketType; status!: TicketStatus;
  owner!: Actor | null; closed_reason!: ClosedReason | null; artifacts!: string;
  references!: string; depends_on!: string[]; created_at!: string; status_changed_at!: string; thread!: Thread[]; tags!: Tags; last!: boolean;

  private constructor(data: TicketData) {
    Object.assign(this, data);
    this.tags = data.tags ?? {};
    this.depends_on = data.depends_on ?? []; // ausente em Tickets antigos
    this.last = data.last ?? false; // ausente em Tickets antigos → sticky flag da fase final
  }

  static create(input: CreateTicket, now = new Date()): Ticket {
    for (const key of ["issue_id", "objective", "task", "acceptance_criteria"] as const) {
      required(input[key], key);
    }
    return new Ticket(Ticket.#initialData(input, now.toISOString()));
  }

  static #initialData(input: CreateTicket, timestamp: string): TicketData {
    const base = threadEntry(input.actor, timestamp, "Ticket created", "OPEN", null);
    const entry = input.attachments?.length ? { ...base, attachments: input.attachments } : base;
    return { id: randomUUID(), issue_id: input.issue_id, objective: input.objective,
      task: input.task, acceptance_criteria: input.acceptance_criteria, type: input.type,
      status: "OPEN", owner: null, closed_reason: null, artifacts: input.artifacts ?? "",
      references: input.references ?? "", depends_on: input.depends_on ?? [], created_at: timestamp, status_changed_at: timestamp,
      thread: [entry], tags: {}, last: false }; // tags.human_need é estampado pela Issue (derivado, nunca declarado)
  }

  static fromJSON(data: TicketData): Ticket {
    return new Ticket(structuredClone(data));
  }

  claim(actor: Actor, now = new Date()): void {
    this.#expect("OPEN");
    this.owner = actor;
    this.#changeStatus("CLAIMED", now);
  }

  changeStatus(actor: Actor, status: TicketStatus, comment: string, reason?: ClosedReason, last = false, now = new Date(), attachments: AttachmentData[] = []): void {
    this.#expect("CLAIMED");
    if (this.owner !== actor) throw new DomainError("Only the Owner may change status");
    if (status === "CLAIMED") throw new DomainError("Invalid ticket transition");
    // Grau de autonomia: Ticket HITL não pode ser fechado pela IA; só vai a AWAITING para o humano decidir (decide).
    if (status === "CLOSED" && this.tags.human_need === "HITL") {
      throw new DomainError("Ticket HITL: IA não pode fechar direto; envie para AWAITING para decisão humana");
    }
    if (status === "CLOSED" && !reason) throw new DomainError("Closed reason is required");
    if (status !== "CLOSED" && reason) throw new DomainError(`${status} cannot have a closed reason`);
    required(comment, "comment");
    if (status === "OPEN") this.owner = null;
    this.last ||= last; // sticky: só marca após passar por todas as validações
    this.#transition(status, actor, comment, reason ?? null, now, attachments);
  }

  comment(actor: Actor, comment: string, attachments: AttachmentData[] = [], now = new Date()): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    if (!comment.trim() && attachments.length === 0) throw new DomainError("comment or attachment is required");
    const entry = threadEntry(actor, now.toISOString(), comment, this.status, null);
    this.thread.push({ ...entry, attachments });
  }

  tag(updates: TagUpdates): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    this.tags = applyTags(this.tags, updates);
  }

  decide(status: Decision, comment: string, reason?: ClosedReason, last = false, now = new Date(), attachments: AttachmentData[] = []): void {
    this.#expect("AWAITING");
    assertDecision(status, comment, reason);
    if (status === "OPEN") this.owner = null;
    this.last ||= last; // sticky: só marca após passar por todas as validações
    this.#transition(status, "human", comment, reason ?? null, now, attachments);
  }

  #transition(status: TicketStatus, actor: Actor, comment: string, reason: ClosedReason | null, now: Date,
    attachments: AttachmentData[] = []): void {
    const base = threadEntry(actor, now.toISOString(), comment, status, reason);
    this.thread.push(attachments.length ? { ...base, attachments } : base);
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

  toJSON(): TicketData {
    return structuredClone({ ...this });
  }
}

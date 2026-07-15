import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { Ticket, type TicketData } from "../domain/ticket_entity.js";
import { parseActor, parseClosedReason, parseHumanNeed, parseTicketStatus, parseTicketType } from "../domain/value_objects.js";
import { type IncomingAttachment, persistableAttachments } from "./attachments.js";
import { requireValidRequirements } from "./requirements_use_cases.js";

export type CreateTicketInput = {
  issueId: string; type: string; objective: string; task: string; acceptance_criteria: string;
  artifacts?: string; references?: string; depends_on?: string[]; actor: string; human_need?: string;
  artifact?: string; attachments?: IncomingAttachment[]; now?: Date;
};

export function createTicket(input: CreateTicketInput, root?: string): Issue {
  const actor = parseActor(input.actor);
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const type = parseTicketType(input.type);
  if (type === "Confirmation") throw new DomainError("Confirmation Tickets são gerados pelo sistema");
  const created = persistableAttachments(input.attachments, input.now); // valida antes de criar o Ticket
  const ticket = Ticket.create({ issue_id: input.issueId, type,
    objective: input.objective, task: input.task, acceptance_criteria: input.acceptance_criteria,
    artifacts: input.artifacts, references: input.references, depends_on: input.depends_on, actor,
    human_need: input.human_need ? parseHumanNeed(input.human_need) : undefined,
    attachments: created.map(({ entity }) => entity.toJSON()) }, input.now);
  issue.addTicket(ticket, input.now);
  for (const { entity, bytes } of created) queue.writeAttachment(issue.project, entity, bytes);
  queue.save(issue);
  if (input.artifact) queue.writeArtifact(issue.project, ticket.id, input.artifact);
  return issue;
}

export type ClaimTicketInput = { issueId: string; ticketId: string; actor: string; now?: Date };

export function claimTicket(input: ClaimTicketInput, root?: string): Issue {
  const actor = parseActor(input.actor);
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  issue.claimTicket(input.ticketId, actor, input.now);
  queue.save(issue);
  return issue;
}

export type StatusTicketInput = {
  issueId: string; ticketId: string; actor: string; status: string;
  comment: string; closed_reason?: string; last?: boolean; attachments?: IncomingAttachment[]; now?: Date;
};

export function statusTicket(input: StatusTicketInput, root?: string): Issue {
  const actor = parseActor(input.actor);
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const status = parseTicketStatus(input.status);
  const reason = input.closed_reason ? parseClosedReason(input.closed_reason) : undefined;
  if (status === "AWAITING" && issue.ticket(input.ticketId).type === "Planning") {
    requireValidRequirements(queue, issue.project, issue.id);
  }
  const created = persistableAttachments(input.attachments, input.now);
  issue.transitionTicket(input.ticketId, actor, status, input.comment, reason, Boolean(input.last), input.now,
    created.map(({ entity }) => entity.toJSON()));
  for (const { entity, bytes } of created) queue.writeAttachment(issue.project, entity, bytes);
  queue.save(issue);
  return issue;
}

export type DecideTicketInput = {
  issueId: string; ticketId: string; human: boolean; status: string;
  comment: string; closed_reason?: string; last?: boolean; attachments?: IncomingAttachment[]; now?: Date;
};

export function decideTicket(input: DecideTicketInput, root?: string): Issue {
  if (!input.human) throw new DomainError("Decide requires --human");
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  if (input.status !== "OPEN" && input.status !== "CLOSED") throw new DomainError("Invalid decision");
  const reason = input.closed_reason ? parseClosedReason(input.closed_reason) : undefined;
  const created = persistableAttachments(input.attachments, input.now);
  issue.decideTicket(input.ticketId, input.status, input.comment, reason, Boolean(input.last), input.now,
    created.map(({ entity }) => entity.toJSON()));
  for (const { entity, bytes } of created) queue.writeAttachment(issue.project, entity, bytes);
  queue.save(issue);
  return issue;
}

export type TicketView = TicketData & { artifact: string | null; issue_artifact: string | null };

export function getTicket(input: { issueId: string; ticketId: string }, root?: string): TicketView {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  return ticketView(queue, issue, issue.ticket(input.ticketId));
}

// Injeta o Artefato .md do Ticket e o da Issue-mãe na view (≤2 leituras; custo desprezível).
export function ticketView(queue: Queue, issue: Issue, ticket: Ticket): TicketView {
  return { ...ticket.toJSON(),
    artifact: queue.readArtifact(issue.project, ticket.id),
    issue_artifact: queue.readArtifact(issue.project, issue.id) };
}

export function listTickets(input: { issueId: string; type?: string; status?: string }, root?: string): TicketData[] {
  const issue = new Queue(root).loadRequired(input.issueId);
  const type = input.type ? parseTicketType(input.type) : undefined;
  const status = input.status ? parseTicketStatus(input.status) : undefined;
  return issue.tickets.map((ticket) => ticket.toJSON())
    .filter((ticket) => (!type || ticket.type === type) && (!status || ticket.status === status));
}

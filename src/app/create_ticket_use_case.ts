import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { Ticket } from "../domain/ticket_entity.js";
import { DomainError } from "../domain/domain_error.js";
import { parseAgentId, parseTicketType, type Actor } from "../domain/value_objects.js";
import { loadRequiredIssue } from "./required_issue.js";

export type CreateTicketInput = {
  issueId: string; type: string; objective: string; task: string; acceptance_criteria: string;
  artifacts?: string; references?: string; depends_on?: string[]; actor: string; now?: Date;
};

export class CreateTicketUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: CreateTicketInput): Issue {
    const actor: Actor = input.actor === "human" ? "human" : parseAgentId(input.actor);
    const issue = loadRequiredIssue(this.queue, input.issueId);
    const type = parseTicketType(input.type);
    if (type === "Confirmation") throw new DomainError("Confirmation Tickets são gerados pelo sistema");
    const ticket = Ticket.create({ issue_id: input.issueId, type,
      objective: input.objective, task: input.task, acceptance_criteria: input.acceptance_criteria,
      artifacts: input.artifacts, references: input.references, depends_on: input.depends_on, actor }, input.now);
    issue.addTicket(ticket, input.now);
    this.queue.save(issue);
    return issue;
  }
}

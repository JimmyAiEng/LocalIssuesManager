import { DomainError } from "../domain/domain_error.js";
import { Queue } from "../domain/queue_repository.js";
import type { Ticket } from "../domain/ticket_entity.js";
import { loadRequiredIssue } from "./required_issue.js";

export class GetTicketUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: { issueId: string; ticketId: string }): Ticket {
    const issue = loadRequiredIssue(this.queue, input.issueId);
    const ticket = issue.tickets.find((candidate) => candidate.id === input.ticketId);
    if (!ticket) throw new DomainError(`Ticket not found: ${input.ticketId}`);
    return ticket;
  }
}

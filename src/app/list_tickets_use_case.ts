import { Queue } from "../domain/queue_repository.js";
import type { TicketData } from "../domain/ticket_entity.js";
import { parseTicketStatus, parseTicketType } from "../domain/value_objects.js";
import { loadRequiredIssue } from "./required_issue.js";

export class ListTicketsUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: { issueId: string; type?: string; status?: string }): TicketData[] {
    const issue = loadRequiredIssue(this.queue, input.issueId);
    const type = input.type ? parseTicketType(input.type) : undefined;
    const status = input.status ? parseTicketStatus(input.status) : undefined;
    return issue.tickets.map((ticket) => ticket.toJSON())
      .filter((ticket) => (!type || ticket.type === type) && (!status || ticket.status === status));
  }
}

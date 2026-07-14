import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { parseActor, parseClosedReason, parseTicketStatus } from "../domain/value_objects.js";
import { loadRequiredIssue } from "./required_issue.js";

export type StatusTicketInput = {
  issueId: string; ticketId: string; actor: string; status: string;
  comment: string; closed_reason?: string; now?: Date;
};

export class StatusTicketUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: StatusTicketInput): Issue {
    const actor = parseActor(input.actor);
    const issue = loadRequiredIssue(this.queue, input.issueId);
    const reason = input.closed_reason ? parseClosedReason(input.closed_reason) : undefined;
    issue.transitionTicket(input.ticketId, actor, parseTicketStatus(input.status), input.comment, reason, input.now);
    this.queue.save(issue);
    return issue;
  }
}

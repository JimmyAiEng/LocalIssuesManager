import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { parseAgentId, type Actor } from "../domain/value_objects.js";
import { loadRequiredIssue } from "./required_issue.js";

export type ClaimTicketInput = { issueId: string; ticketId: string; actor: string; now?: Date };

export class ClaimTicketUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: ClaimTicketInput): Issue {
    const actor: Actor = input.actor === "human" ? "human" : parseAgentId(input.actor);
    const issue = loadRequiredIssue(this.queue, input.issueId);
    issue.claimTicket(input.ticketId, actor, input.now);
    this.queue.save(issue);
    return issue;
  }
}

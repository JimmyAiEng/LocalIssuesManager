import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { parseClosedReason } from "../domain/value_objects.js";
import { loadRequiredIssue } from "./required_issue.js";

export type DecideInput = {
  id: string; human: boolean; status: string; comment: string;
  closed_reason?: string; now?: Date;
};

export class DecideIssueUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: DecideInput): Issue {
    if (!input.human) throw new DomainError("Decide requires --human");
    const issue = loadRequiredIssue(this.queue, input.id);
    if (input.status !== "OPEN" && input.status !== "CLOSED") throw new DomainError("Invalid decision");
    const reason = input.closed_reason ? parseClosedReason(input.closed_reason) : undefined;
    issue.decide(input.status, input.comment, reason, input.now);
    this.queue.save(issue);
    return issue;
  }
}


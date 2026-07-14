import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { loadRequiredIssue } from "./required_issue.js";

export class ResetClaimUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: { id: string; human: boolean; comment: string; now?: Date }): Issue {
    if (!input.human) throw new DomainError("Reset requires --human");
    const issue = loadRequiredIssue(this.queue, input.id);
    issue.reset(input.comment, input.now);
    this.queue.save(issue);
    return issue;
  }
}

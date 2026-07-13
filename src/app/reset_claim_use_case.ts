import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";

export class ResetClaimUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: { id: string; human: boolean; comment: string; now?: Date }): Issue {
    if (!input.human) throw new DomainError("Reset requires --human");
    const issue = this.queue.load(input.id);
    if (!issue) throw new DomainError(`Issue not found: ${input.id}`);
    issue.reset(input.comment, input.now);
    this.queue.save(issue);
    return issue;
  }
}

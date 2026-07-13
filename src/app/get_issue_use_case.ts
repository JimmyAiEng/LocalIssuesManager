import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { loadRequiredIssue } from "./required_issue.js";

export class GetIssueUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(id: string): Issue {
    return loadRequiredIssue(this.queue, id);
  }
}

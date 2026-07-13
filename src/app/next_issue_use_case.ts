import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { parseAgentId } from "../domain/value_objects.js";

export class NextIssueUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: { agent: string; project?: string; now?: Date }): Issue | null {
    const agent = parseAgentId(input.agent);
    const issue = this.queue.oldestOpen(input.project);
    if (!issue) return null;
    issue.claim(agent, input.now);
    this.queue.save(issue);
    return issue;
  }
}

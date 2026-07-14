import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import type { TagUpdates } from "../domain/value_objects.js";
import { loadRequiredIssue } from "./required_issue.js";

export type TagInput = {
  issueId: string; ticketId?: string;
  complexity?: string; human_need?: string; risk?: string;
};

export class TagUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: TagInput): Issue {
    const issue = loadRequiredIssue(this.queue, input.issueId);
    const updates: TagUpdates = { complexity: input.complexity, human_need: input.human_need, risk: input.risk };
    if (input.ticketId) issue.tagTicket(input.ticketId, updates);
    else issue.tag(updates);
    this.queue.save(issue);
    return issue;
  }
}

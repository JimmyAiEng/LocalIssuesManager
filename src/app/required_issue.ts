import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import type { Queue } from "../domain/queue_repository.js";

export function loadRequiredIssue(queue: Queue, id: string): Issue {
  const issue = queue.load(id);
  if (!issue) throw new DomainError(`Issue not found: ${id}`);
  return issue;
}

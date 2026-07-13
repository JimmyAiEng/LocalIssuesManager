import type { Issue, Phase } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { parseStatus } from "../domain/value_objects.js";

export type IssueSummary = {
  id: string; title: string; project: string; tag: string; status: string;
  owner: string | null; closed_reason: string | null; created_at: string;
  phases: Phase[];
};

export class ListIssuesUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(filter: { status?: string; project?: string; title?: string; limit?: number; offset?: number }): IssueSummary[] {
    const status = filter.status ? parseStatus(filter.status) : undefined;
    const issues = this.queue.list({ ...filter, status }).map(summary);
    const offset = filter.offset ?? 0;
    return filter.limit === undefined ? issues.slice(offset) : issues.slice(offset, offset + filter.limit);
  }
}

function summary(issue: Issue): IssueSummary {
  return { id: issue.id, title: issue.title, project: issue.project, tag: issue.tag,
    status: issue.status, owner: issue.owner, closed_reason: issue.closed_reason,
    created_at: issue.created_at, phases: structuredClone(issue.phases) };
}

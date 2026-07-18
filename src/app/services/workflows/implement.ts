import { DomainError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { checkFailureMessage, requireTddOrder } from "../implement_execution.js";
import { runProjectChecks } from "../project_checks.js";

export function validateImplement(queue: Queue, issue: Issue): void {
  if (!issue.worktree) throw new DomainError("Issue Implement exige worktree: crie com 'issues worktree add --id <id>' e implemente nela");
  const project = queue.readProject(issue.project);
  if (project?.testPaths?.length) requireTddOrder(project.repo, issue.worktree.path, project.testPaths);
  const failure = project && runProjectChecks(project, issue.worktree.path);
  if (failure) throw new DomainError(checkFailureMessage(failure));
}

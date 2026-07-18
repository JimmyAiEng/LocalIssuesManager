import { validateArtifactContent } from "../../../domain/artifact.js";
import { DomainError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";

export function validateQa(queue: Queue, issue: Issue): void {
  const content = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "doc" });
  if (content === null) throw new DomainError("Issue QA não conclui sem o artefato de validação: registre o resultado requisito×comportamento com 'issues artifact --id <id> --file <qa.md>'");
  validateArtifactContent("doc", content);
}

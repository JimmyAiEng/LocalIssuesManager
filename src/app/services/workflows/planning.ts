import { RequirementArtifact, type RequirementSet } from "../../../domain/artifacts/requirement_artifact.js";
import { DomainError, NotFoundError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import type { ActionType } from "../../../domain/value_objects.js";

// Gate de conclusão de uma Issue Planning: requisitos válidos persistidos e uma filha Design por Feature.
export function validatePlanning(queue: Queue, issue: Issue): void {
  const requirements = requireValidRequirements(queue, issue.project, issue.id);
  requireDesignChildPerFeature(queue, issue, requirements);
}

export function requireValidRequirements(queue: Queue, project: string,
  issueId: string): RequirementSet {
  const raw = queue.artifacts.readText(project, { issueId, type: "requirement" });
  if (raw === null) {
    throw new NotFoundError(
      "Issue Planning não pode ser concluída sem requisitos: use 'issues requirements set --id <id> --file <req.json>'",
    );
  }
  return RequirementArtifact.validate(raw);
}

// Requisitos só são mutáveis em Issue action=Planning.
export function requirePlanningIssue(issue: Issue): void {
  if (issue.action !== "Planning") {
    throw new DomainError(`Issue ${issue.id} não é de Planning (action=${issue.action}): requisitos pertencem a Issues Planning`);
  }
}

function requireDesignChildPerFeature(queue: Queue, issue: Issue,
  requirements: RequirementSet): void {
  const children = childIssues(queue, issue, "Design");
  for (const feature of RequirementArtifact.featureNames(requirements)) {
    if (!children.some((child) => child.title.includes(feature))) {
      throw new DomainError(`Issue Planning não fecha sem decompor a Feature "${feature}": crie a filha Design com 'issues decompose --id ${issue.id} --into <arquivo.json>'`);
    }
  }
}

function childIssues(queue: Queue, issue: Issue, action: ActionType): Issue[] {
  return issue.relates.filter((relation) => relation.kind === "child")
    .map((relation) => queue.load(relation.id))
    .filter((child): child is Issue => child !== null && child.action === action);
}

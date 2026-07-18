import { readFileSync } from "node:fs";
import { RequirementArtifact, type RequirementSet } from "../../../domain/artifacts/requirement_artifact.js";
import { NotFoundError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import { Queue } from "../../../domain/queue_repository.js";
import { requirePlanningIssue, requireValidRequirements } from "../workflows/planning.js";

export function setRequirements(input: { issueId: string; file: string }, root?: string): RequirementSet {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  requirePlanningIssue(issue);
  const requirements = RequirementArtifact.validate(readFileSync(input.file, "utf8"));
  queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "requirement" },
    JSON.stringify(requirements));
  return requirements;
}

export function getRequirements(input: { issueId: string }, root?: string): RequirementSet {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const raw = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "requirement" });
  if (raw === null) throw new NotFoundError(`Requirements não encontrado para a Issue: ${issue.id}`);
  return RequirementArtifact.validate(raw);
}

// A filha Design recebe somente a Feature correspondente ao nome presente em seu título.
export function featureForDesignChild(queue: Queue, issue: Issue): string[] | null {
  if (issue.action !== "Design") return null;
  const parentId = issue.relates.find((relation) => relation.kind === "parent")?.id;
  const parent = parentId ? queue.load(parentId) : null;
  if (parent?.action !== "Planning") return null;
  try {
    const requirements = requireValidRequirements(queue, parent.project, parent.id);
    const index = RequirementArtifact.featureNames(requirements)
      .findIndex((name) => issue.title.includes(name));
    return index === -1 ? null : [requirements.features[index]!];
  } catch {
    return null;
  }
}

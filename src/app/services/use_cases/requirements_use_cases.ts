import { readFileSync } from "node:fs";
import { RequirementArtifact, type RequirementSet } from "../../../domain/artifacts/requirement_artifact.js";
import { NotFoundError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import { Queue } from "../../../domain/queue_repository.js";
import { requirePlanningIssue } from "../workflows/planning.js";

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

// A Issue Design possui o seu recorte de Requirements (gravado pelo decompose): o grupo de
// Features que ela desenha viaja no prompt sem depender de casar nome com título.
export function designFeatures(queue: Queue, issue: Issue): string[] | null {
  if (issue.action !== "Design") return null;
  const raw = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "requirement" });
  return raw === null ? null : RequirementArtifact.validate(raw).features;
}

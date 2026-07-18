import { readFileSync } from "node:fs";
import { RequirementArtifact, type RequirementSet } from "../domain/artifacts/requirement_artifact.js";
import { DomainError, NotFoundError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import type { ActionType } from "../domain/value_objects.js";

export function setRequirements(input: { issueId: string; file: string }, root?: string): RequirementSet {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  requirePlanning(issue);
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

// PRD e Requirements são nomes públicos do mesmo Artifact: um conjunto de Features Gherkin.
export const setPrd = setRequirements;
export const getPrd = getRequirements;

export function requirePlanningGate(queue: Queue, issue: Issue): void {
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

function requirePlanning(issue: Issue): void {
  if (issue.action !== "Planning") {
    throw new DomainError(`Issue ${issue.id} não é de Planning (action=${issue.action}): requisitos pertencem a Issues Planning`);
  }
}

import { RequirementArtifact, type RequirementSet } from "../../../domain/artifacts/requirement_artifact.js";
import { DomainError, NotFoundError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import type { ActionType } from "../../../domain/value_objects.js";

// Gate de conclusão de uma Issue Planning: requisitos válidos persistidos e as filhas Design
// particionando as Features — toda Feature coberta por exatamente uma filha.
export function validatePlanning(queue: Queue, issue: Issue): void {
  const requirements = requireValidRequirements(queue, issue.project, issue.id);
  requireFeaturePartition(queue, issue, requirements);
}

export function requireValidRequirements(queue: Queue, project: string,
  issueId: string): RequirementSet {
  const raw = queue.artifacts.readText(project, { issueId, type: "requirement" });
  if (raw === null) {
    throw new NotFoundError(
      `Issue Planning não pode ser concluída sem requisitos: use: issues requirements set --id ${issueId} --file <req.jsonl> ; se esta Issue foi substituída por Issues menores, abandone com --reason obsoleto (o abandono não cobra o gate)`,
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

function requireFeaturePartition(queue: Queue, issue: Issue,
  requirements: RequirementSet): void {
  const coverage = designChildCoverage(queue, issue);
  for (const feature of RequirementArtifact.featureNames(requirements)) {
    const owners = coverage.get(feature) ?? [];
    if (owners.length === 0) {
      throw new DomainError(`Issue Planning não fecha sem decompor a Feature "${feature}": crie a filha Design que a cobre com 'issues decompose --id ${issue.id} --into <arquivo.json>' declarando-a em "features"`);
    }
    if (owners.length > 1) {
      throw new DomainError(`Feature "${feature}" coberta por mais de uma filha Design (${owners.map((child) => `${child.title} (${child.id})`).join(", ")}): cada Feature pertence a exatamente um grupo`);
    }
  }
}

// Features cobertas por filha Design → o RequirementArtifact da própria filha, gravado pelo
// decompose, é a declaração do seu grupo. Filha criada fora do decompose não cobre nada, e a
// Feature aparece como descoberta no gate acima.
export function designChildCoverage(queue: Queue, issue: Issue): Map<string, Issue[]> {
  const coverage = new Map<string, Issue[]>();
  for (const child of childIssues(queue, issue, "Design")) {
    const raw = queue.artifacts.readText(child.project, { issueId: child.id, type: "requirement" });
    if (raw === null) continue;
    for (const name of RequirementArtifact.featureNames(RequirementArtifact.validate(raw))) {
      coverage.set(name, [...(coverage.get(name) ?? []), child]);
    }
  }
  return coverage;
}

function childIssues(queue: Queue, issue: Issue, action: ActionType): Issue[] {
  return issue.relates.filter((relation) => relation.kind === "child")
    .map((relation) => queue.load(relation.id))
    .filter((child): child is Issue => child !== null && child.action === action);
}

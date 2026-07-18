import { readFileSync } from "node:fs";
import { ImplementationPlanArtifact } from "../../../domain/artifacts/implementation_plan_artifact.js";
import { RequirementArtifact } from "../../../domain/artifacts/requirement_artifact.js";
import type { Issue } from "../../../domain/issue_entity.js";
import { Queue } from "../../../domain/queue_repository.js";
import { type DecomposeChild, featureTexts, parseDecomposition, validateChildren } from "../workflows/decomposition.js";
import { createIssue, relateIssues } from "./issue_use_cases.js";

export type { DecomposeChild, Decomposition } from "../workflows/decomposition.js";
export type DecomposeInput = { issueId: string; file: string; actor: string };

// Fan-out 1→N (Planning→Design) ou N→N×M (Design→Implement): cria as filhas tipadas com linhagem
// child recíproca e persiste em cada Implement o seu Small Plan. Os gates cobram a decomposição.
export function decomposeIssue(input: DecomposeInput, root?: string): { parent: string; mode: string; children: string[] } {
  const queue = new Queue(root);
  const parent = queue.loadRequired(input.issueId);
  const spec = parseDecomposition(readFileSync(input.file, "utf8"));
  const mode = spec.mode ?? "concurrent";
  validateChildren(queue, parent, spec.children); // fail-fast: nada é criado se o arquivo for inválido
  const created: string[] = [];
  let previous: string | undefined;
  for (const child of spec.children) {
    const issue = createChildIssue(parent, child, input.actor, root);
    relateIssues({ id: issue.id, relates: [parent.id], kind: "parent" }, root); // linhagem parent/child recíproca
    writeChildArtifacts(queue, parent, issue, child);
    if (mode === "sequential" && previous) relateIssues({ id: issue.id, relates: [previous], kind: "see-also" }, root);
    previous = issue.id;
    created.push(issue.id);
  }
  return { parent: parent.id, mode, children: created };
}

// Cada filha nasce dona do artefato que a define: o Small Plan na Implement, o recorte de
// Requirements na Design (o grupo de Features declarado). Assim ela não depende de casar
// título com o pai depois — e o gate do pai lê essa declaração para cobrar a partição.
function writeChildArtifacts(queue: Queue, parent: Issue, child: Issue, spec: DecomposeChild): void {
  if (spec.plan) queue.artifacts.writeText(parent.project,
    { issueId: child.id, type: "implementation-plan" },
    JSON.stringify(ImplementationPlanArtifact.validateParsed(spec.plan)));
  if (spec.features) queue.artifacts.writeText(parent.project,
    { issueId: child.id, type: "requirement" },
    JSON.stringify(RequirementArtifact.validateParsed({ features: featureTexts(queue, parent, spec.features) })));
}

function createChildIssue(parent: Issue, child: DecomposeChild, actor: string, root?: string): Issue {
  return createIssue({ title: child.title, project: parent.project, type: child.type, action: child.action,
    problem: child.problem, acceptance_criteria: child.acceptance_criteria, actor }, root);
}

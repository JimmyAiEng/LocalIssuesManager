import { DomainError } from "../../../domain/domain_error.js";
import { assessGate, gateFor, type GateViolation } from "../../../domain/gates/index.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { validateDeploy } from "./deploy.js";
import { validateDesign } from "./design.js";
import { validateImplement } from "./implement.js";
import { validatePlanning } from "./planning.js";
import { validateQa } from "./qa.js";

type CompletionStatus = "AWAITING" | "CLOSED";

export async function completeIssue(queue: Queue, issue: Issue, status: CompletionStatus,
  comment: string): Promise<void> {
  const preliminary = assessGate(issue.tags, { violations: missingArtifacts(queue, issue) });
  if (issue.action === "Deploy" && status === "CLOSED") return rejectDeployClose();
  if (preliminary.outcome === "rejected") await rejectInvalidDelivery(queue, issue, comment, preliminary.violations);
  await validateWorkflowDelivery(queue, issue, comment);
  const assessment = assessGate(issue.tags, { forceHuman: forcedHumanReason(issue) });
  if (status === "CLOSED" && assessment.outcome === "human-required") rejectHumanRequired(issue);
}

export async function validateWorkflowDelivery(queue: Queue, issue: Issue, comment: string): Promise<void> {
  if (issue.action === "Planning") return validatePlanning(queue, issue);
  if (issue.action === "Design") return validateDesign(queue, issue);
  if (issue.action === "Implement") return validateImplement(queue, issue);
  if (issue.action === "QA") return validateQa(queue, issue);
  validateDeploy(issue, comment);
}

function missingArtifacts(queue: Queue, issue: Issue): GateViolation[] {
  return gateFor(issue.action).artifacts.types
    .filter((type) => queue.artifacts.list(issue.project, issue.id, type).length === 0)
    .map((type) => ({ code: "missing_artifact", message: `Artifact obrigatório ausente: ${type}` }));
}

function forcedHumanReason(issue: Issue): string | undefined {
  if (gateFor(issue.action).humanApproval.mode === "required") return issue.action.toLowerCase();
  return issue.action === "Design" && issue.architecture_changed ? "architecture_changed" : undefined;
}

async function rejectInvalidDelivery(queue: Queue, issue: Issue, comment: string,
  violations: GateViolation[]): Promise<never> {
  await validateWorkflowDelivery(queue, issue, comment);
  throw new DomainError(violations.map((violation) => violation.message).join("; "));
}

function rejectDeployClose(): never {
  throw new DomainError("Issue Deploy não fecha por agente: envie para decisão humana com --status AWAITING; o go/no-go do deploy é do humano (decide no web)");
}

function rejectHumanRequired(issue: Issue): never {
  if (issue.action === "Design" && issue.architecture_changed) {
    throw new DomainError("Issue Design com mudança de arquitetura não fecha por agente: envie para decisão humana com --status AWAITING (o aceite do Design é humano — decide no web)");
  }
  throw new DomainError("Issue exige decisão humana (HITL, risco ALTO ou complexidade ALTA): envie a evidência com status AWAITING e deixe o humano decidir no web");
}

import { DomainError } from "../../../domain/domain_error.js";
import { assessGate, gateFor, type GateViolation } from "../../../domain/gates/index.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { parseAgentId, parseClosedReason, parseRole } from "../../../domain/value_objects.js";
import { validateDeploy } from "./deploy.js";
import { validateDesign } from "./design.js";
import { validatePlanning } from "./planning.js";
import { validateReview } from "./review.js";

type CompletionStatus = "AWAITING" | "CLOSED";

export type CompletionInput = {
  status: string; comment: string; agent?: string; closed_reason?: string; role?: string; now?: Date;
};

// IA entrega com evidência: AWAITING (decisão humana) ou CLOSED (autonomia AFK). Nas duas
// saídas o gate da action precisa passar — a entrega esperada da Issue tem que existir —,
// salvo no abandono, em que não haverá entrega alguma.
export async function deliverByAgent(queue: Queue, issue: Issue, input: CompletionInput): Promise<void> {
  const agent = parseAgentId(input.agent ?? "");
  const role = input.role ? parseRole(input.role) : undefined; // papel especializado audita a transição
  if (input.status === "AWAITING") {
    await completeIssue(queue, issue, "AWAITING", input.comment, isAbandon(input.closed_reason));
    return issue.submit(agent, input.comment, input.now, [], role);
  }
  if (input.status !== "CLOSED") {
    throw new DomainError("IA: use status AWAITING (enviar para decisão humana) ou CLOSED com reason");
  }
  if (!input.closed_reason) throw new DomainError("Closed reason is required");
  const reason = parseClosedReason(input.closed_reason);
  await completeIssue(queue, issue, "CLOSED", input.comment, reason !== "concluido");
  issue.closeByAgent(agent, input.comment, reason, input.now, [], role);
}

// Abandono: reason informado e ≠ "concluido" (obsoleto, duplicado, errado). A Issue não terá
// entrega, então cobrar o gate da action prenderia o agente numa Issue que ele mesmo criou
// errada. A trava de decisão humana segue valendo: HITL/risco ALTO/Deploy saem por AWAITING.
function isAbandon(closedReason: string | undefined): boolean {
  return closedReason !== undefined && parseClosedReason(closedReason) !== "concluido";
}

export async function closeByHuman(queue: Queue, issue: Issue, input: CompletionInput): Promise<void> {
  if (input.status !== "CLOSED" || !input.closed_reason) throw new DomainError("Human status supports CLOSED with reason");
  const reason = parseClosedReason(input.closed_reason);
  if (reason === "concluido") await validateWorkflowDelivery(queue, issue, input.comment);
  issue.closeByHuman(input.comment, reason, input.now);
}

export async function completeIssue(queue: Queue, issue: Issue, status: CompletionStatus,
  comment: string, abandoned = false): Promise<void> {
  if (issue.action === "Deploy" && status === "CLOSED") return rejectDeployClose();
  if (!abandoned) {
    const preliminary = assessGate(issue.tags, { violations: missingArtifacts(queue, issue) });
    if (preliminary.outcome === "rejected") await rejectInvalidDelivery(queue, issue, comment, preliminary.violations);
    await validateWorkflowDelivery(queue, issue, comment);
  }
  const assessment = assessGate(issue.tags, { forceHuman: forcedHumanReason(issue) });
  if (status === "CLOSED" && assessment.outcome === "human-required") rejectHumanRequired(issue);
}

export async function validateWorkflowDelivery(queue: Queue, issue: Issue, comment: string): Promise<void> {
  if (issue.action === "Planning") return validatePlanning(queue, issue);
  if (issue.action === "Design") return validateDesign(queue, issue);
  if (issue.action === "Review") return validateReview(queue, issue);
  if (issue.action === "Deploy") return validateDeploy(issue, comment);
  // Implement não tem gate de entrega: a evidência já é exigida pela transição de status.
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

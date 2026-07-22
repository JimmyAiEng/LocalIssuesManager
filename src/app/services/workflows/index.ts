import { DocumentArtifact } from "../../../domain/artifacts/document_artifact.js";
import { DomainError } from "../../../domain/domain_error.js";
import { assessGate, gateFor, type GateViolation } from "../../../domain/gates/index.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { ConcernLevel, Queue } from "../../../domain/queue_repository.js";
import { parseAgentId, parseClosedReason, parseRole, wasApproved } from "../../../domain/value_objects.js";
import { validateConflictReview } from "./conflict_review.js";
import { validateDeploy } from "./deploy.js";
import { validateDesign } from "./design.js";
import { validatePlanning } from "./planning.js";
import { validateReview } from "./review.js";

// Status alvo da conclusão. Os gates se ramificam por ele: AWAITING cobra os artefatos que o
// humano precisa para julgar; CLOSED cobra, além disso, a sequência viva que a Issue abre.
export type CompletionStatus = "AWAITING" | "CLOSED";

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
  if (reason === "concluido") await validateWorkflowDelivery(queue, issue, input.comment, "CLOSED");
  issue.closeByHuman(input.comment, reason, input.now);
}

export async function completeIssue(queue: Queue, issue: Issue, status: CompletionStatus,
  comment: string, abandoned = false): Promise<void> {
  // Pós-APPROVED o humano já decidiu: dispensa as travas que forçam decisão humana (Deploy não
  // fecha por agente; HITL/risco/arquitetura/concern), senão o agente trava em loop AWAITING→APPROVED.
  const approved = wasApproved(issue.phases);
  if (issue.action === "Deploy" && status === "CLOSED" && !approved) return rejectDeployClose();
  // A trava de supervisão vem ANTES do gate de entrega: uma Issue que nunca poderá fechar por
  // agente precisa ouvir isso primeiro. Cobrar a entrega antes mandaria decompor quem só pode ir
  // para AWAITING — e decompor barra o AWAITING (Regra 1), fechando o agente numa armadilha.
  const concern = queue.readProject(issue.project)?.concern ?? "LOW";
  const assessment = assessGate(issue.tags, { forceHuman: forcedHumanReason(issue, concern) });
  if (status === "CLOSED" && !approved && assessment.outcome === "human-required") rejectHumanRequired(issue, concern);
  if (abandoned) return;
  const preliminary = assessGate(issue.tags, { violations: missingArtifacts(queue, issue) });
  if (preliminary.outcome === "rejected") await rejectInvalidDelivery(queue, issue, comment, status, preliminary.violations);
  await validateWorkflowDelivery(queue, issue, comment, status);
  if (status === "AWAITING") { rejectEarlyChildren(issue, approved); requireHandoff(queue, issue); }
}

// Filha só existe depois que o humano interveio: a decomposição é a primeira coisa que a sessão
// pós-APPROVED faz, não a última antes de pedir a decisão. Qualquer relação kind="child" barra a
// ida para AWAITING (see-also e parent são ignorados). Exceção: quem já passou por APPROVED pode
// voltar a AWAITING mesmo decomposta — senão a Issue aprovada que já criou as filhas e precisa de
// uma segunda decisão fica presa para sempre.
function rejectEarlyChildren(issue: Issue, approved: boolean): void {
  if (approved) return;
  const child = issue.relates.find((relation) => relation.kind === "child");
  if (child === undefined) return;
  throw new DomainError(`Issue ${issue.id} não vai para AWAITING com filha (${child.id}): a decomposição vem DEPOIS da aprovação — entregue os artefatos, o humano aprova (APPROVED), e só então o agente cria as filhas e fecha. Abandone a filha criada cedo com 'issues status --id ${child.id} --reason errado' e reenvie`);
}

// Handoff obrigatório ao enviar para AWAITING não-abandono: o documento handoff.md que a sessão
// pós-APPROVED lê para seguir. Abandono não entrega nada, então não o exige.
function requireHandoff(queue: Queue, issue: Issue): void {
  const handoff = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "document", name: "handoff.md" });
  if (handoff === null) {
    throw new DomainError(`Envio para AWAITING exige o handoff: grave-o com 'issues artifact --id ${issue.id} --name handoff.md --file <f>' antes de enviar para decisão humana`);
  }
  DocumentArtifact.validate(handoff); // ≤300 palavras (o write já valida; reforça no gate)
}

export async function validateWorkflowDelivery(queue: Queue, issue: Issue, comment: string,
  status: CompletionStatus): Promise<void> {
  if (issue.action === "Planning") return validatePlanning(queue, issue, status);
  if (issue.action === "Design") return validateDesign(queue, issue, status);
  if (issue.action === "ConflictReview") return validateConflictReview(queue, issue, status);
  if (issue.action === "Review") return validateReview(queue, issue, status);
  if (issue.action === "Deploy") return validateDeploy(issue, comment);
  // Implement não tem gate de entrega: a evidência já é exigida pela transição de status.
}

function missingArtifacts(queue: Queue, issue: Issue): GateViolation[] {
  return gateFor(issue.action).artifacts.types
    .filter((type) => queue.artifacts.list(issue.project, issue.id, type).length === 0)
    .map((type) => ({ code: "missing_artifact", message: `Artifact obrigatório ausente: ${type}` }));
}

// Piso de supervisão do concern do Projeto: em HIGH, Planning e Design nunca fecham por agente
// (só por AWAITING/decisão humana). LOW e demais actions ficam com a regra base (required / arch).
function forcedHumanReason(issue: Issue, concern: ConcernLevel): string | undefined {
  if (gateFor(issue.action).humanApproval.mode === "required") return issue.action.toLowerCase();
  if (issue.action === "Design" && issue.architecture_changed) return "architecture_changed";
  // Refactor sempre passa pelo engenheiro: o Design de Refactor não tem o atalho AFK do Feat.
  if (issue.type === "Refactor" && issue.action === "Design") return "type=Refactor";
  if (concern === "HIGH" && (issue.action === "Planning" || issue.action === "Design")) return "concern=HIGH";
  return undefined;
}

async function rejectInvalidDelivery(queue: Queue, issue: Issue, comment: string,
  status: CompletionStatus, violations: GateViolation[]): Promise<never> {
  await validateWorkflowDelivery(queue, issue, comment, status);
  throw new DomainError(violations.map((violation) => violation.message).join("; "));
}

function rejectDeployClose(): never {
  throw new DomainError("Issue Deploy não fecha por agente: envie para decisão humana com --status AWAITING; o go/no-go do deploy é do humano (decide no web)");
}

function rejectHumanRequired(issue: Issue, concern: ConcernLevel): never {
  if (issue.action === "Design" && issue.architecture_changed) {
    throw new DomainError("Issue Design com mudança de arquitetura não fecha por agente: envie para decisão humana com --status AWAITING (o aceite do Design é humano — decide no web)");
  }
  if (issue.type === "Refactor" && issue.action === "Design") {
    throw new DomainError("Issue Design de Refactor não fecha por agente: o Refactor sempre passa pelo engenheiro — envie para decisão humana com --status AWAITING (o aceite do Design é humano, decide no web)");
  }
  if (concern === "HIGH" && (issue.action === "Planning" || issue.action === "Design")) {
    throw new DomainError(`Issue ${issue.action} em projeto de concern HIGH não fecha por agente: envie para decisão humana com --status AWAITING (HIGH exige aceite humano de Planning e Design — decide no web)`);
  }
  throw new DomainError("Issue exige decisão humana (HITL, risco ALTO ou complexidade ALTA): envie a evidência com status AWAITING e deixe o humano decidir no web");
}

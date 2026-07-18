import { readFileSync } from "node:fs";
import { NotFoundError } from "../../../domain/domain_error.js";
import { ImplementationPlanArtifact, type ImplementationPlan } from "../../../domain/artifacts/implementation_plan_artifact.js";
import { Queue } from "../../../domain/queue_repository.js";
import { requireOpenDesignIssue } from "../workflows/design.js";

// Entrega o plano de implementação de uma Issue Design — SÓ arquivo JSON, validado
// (estrutura) antes de persistir; inválido → DomainError e nada é gravado.
export function setPlan(input: { issueId: string; file: string }, root?: string): ImplementationPlan {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  requireOpenDesignIssue(issue);
  const content = readFileSync(input.file, "utf8");
  const plan = ImplementationPlanArtifact.validate(content);
  queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "implementation-plan" }, JSON.stringify(plan));
  return plan;
}

// Lê o plano persistido da Issue; inexistente ou corrompido → erro claro.
export function getPlan(input: { issueId: string }, root?: string): ImplementationPlan {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const raw = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "implementation-plan" });
  if (raw === null) throw new NotFoundError(`Plano não encontrado para a Issue: ${issue.id}`);
  return ImplementationPlanArtifact.validate(raw);
}

// Leitura tolerante para a view/prompt: plano ausente ou inválido → null (o gate é quem cobra).
export function readPlanForView(queue: Queue, project: string, issueId: string): ImplementationPlan | null {
  const raw = queue.artifacts.readText(project, { issueId, type: "implementation-plan" });
  if (raw === null) return null;
  try {
    return ImplementationPlanArtifact.validate(raw);
  } catch {
    return null;
  }
}

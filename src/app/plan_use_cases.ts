import { readFileSync } from "node:fs";
import { DomainError, NotFoundError } from "../domain/domain_error.js";
import { ImplementationPlanArtifact, type ImplementationPlan } from "../domain/artifacts/implementation_plan_artifact.js";
import { Queue } from "../domain/queue_repository.js";

// Entrega o plano de implementação de uma Issue Design — SÓ arquivo JSON, validado
// (estrutura) antes de persistir; inválido → DomainError e nada é gravado.
export function setPlan(input: { issueId: string; file: string }, root?: string): ImplementationPlan {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  if (issue.action !== "Design") {
    throw new DomainError(`Issue ${issue.id} não é de Design (action=${issue.action}): o plano pertence a Issues Design`);
  }
  const content = readFileSync(input.file, "utf8");
  const plan = ImplementationPlanArtifact.validate(content);
  queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "implementation-plan" }, JSON.stringify(plan));
  return plan;
}

// Lê o plano persistido da Issue; inexistente ou corrompido → erro claro.
export function getPlan(input: { issueId: string }, root?: string): ImplementationPlan {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  return requirePlan(queue, issue.project, issue.id);
}

// Gate: uma Issue Design só é concluída (AWAITING/CLOSED) com plano válido persistido.
export function requireValidPlan(queue: Queue, project: string, issueId: string): void {
  const raw = queue.artifacts.readText(project, { issueId, type: "implementation-plan" });
  if (raw === null) {
    throw new NotFoundError(
      "Issue Design não pode ser concluída sem plano: use 'issues plan set --id <id> --file <plan.json>'",
    );
  }
  ImplementationPlanArtifact.validate(raw); // revalida; lança DomainError se inválido
}

function requirePlan(queue: Queue, project: string, issueId: string): ImplementationPlan {
  const raw = queue.artifacts.readText(project, { issueId, type: "implementation-plan" });
  if (raw === null) throw new NotFoundError(`Plano não encontrado para a Issue: ${issueId}`);
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

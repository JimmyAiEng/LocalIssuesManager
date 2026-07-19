import {
  DESIGN_KINDS, type DesignDiagram, DesignGateError, evaluateDesignGate, type DesignError,
  plantumlError,
} from "../../../domain/gates/design_gate.js";
import { ImplementationPlanArtifact } from "../../../domain/artifacts/implementation_plan_artifact.js";
import { UmlArtifact } from "../../../domain/artifacts/uml_artifact.js";
import { DomainError, NotFoundError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { checkSyntax } from "../uml-validation/plantuml_check.js";

export type DesignPackage = {
  issueId: string;
  design_md: string | null;
  architecture_changed: boolean | null;
  diagrams: Record<string, string | null>;
  validation: { ready: boolean; errors: DesignError[] };
};

// Gate de conclusão de uma Issue Design: relê o pacote (re-checa a sintaxe de cada .puml) e o
// plano; a trava de aceite humano com mudança de arquitetura fica no dispatcher de conclusão.
export async function validateDesign(queue: Queue, issue: Issue): Promise<void> {
  const { validation } = await designPackage(queue, issue);
  if (validation.errors.length > 0) throw new DesignGateError(validation.errors);
  requireValidPlan(queue, issue.project, issue.id); // plano é obrigatório nos dois caminhos
  requireImplementChild(queue, issue); // trava de decomposição: o fan-out N→N×M exige ao menos uma filha Implement
}

// Pacote de design da Issue: o design.md, os diagramas por kind e o veredito do gate
// (re-valida cada .puml, ramificado por architecture_changed).
export async function designPackage(queue: Queue, issue: Issue): Promise<DesignPackage> {
  const { project, id: issueId } = issue;
  const design_md = queue.artifacts.readText(project, { issueId, type: "document", name: "design.md" });
  const diagrams: Record<string, string | null> = {};
  const checks: DesignDiagram[] = [];
  for (const kind of DESIGN_KINDS) {
    const source = queue.artifacts.readText(project, { issueId, type: "uml", name: `${kind}.puml` });
    diagrams[kind] = source;
    if (source !== null) checks.push({ kind, path: `${kind}.puml`, check: await checkSyntax(source) });
  }
  const errors = evaluateDesignGate(issue.architecture_changed, design_md, checks, issueId);
  return { issueId, design_md, architecture_changed: issue.architecture_changed,
    diagrams, validation: { ready: errors.length === 0, errors } };
}

// Gate: uma Issue Design só é concluída (AWAITING/CLOSED) com plano válido persistido.
export function requireValidPlan(queue: Queue, project: string, issueId: string): void {
  const raw = queue.artifacts.readText(project, { issueId, type: "implementation-plan" });
  if (raw === null) {
    throw new NotFoundError(
      `Issue Design não pode ser concluída sem plano: use: issues plan set --id ${issueId} --file <plan.json>`,
    );
  }
  ImplementationPlanArtifact.validate(raw); // revalida; lança DomainError se inválido
}

// Trava de decomposição: uma Issue Design só fecha depois de gerar as Issues Implement (uma por
// Small Plan). Sem nenhuma filha action=Implement, o fan-out para na Design — não fecha.
function requireImplementChild(queue: Queue, issue: Issue): void {
  const hasImplement = issue.relates.filter((relation) => relation.kind === "child")
    .some((relation) => queue.load(relation.id)?.action === "Implement");
  if (!hasImplement) throw new DomainError(`Issue Design não fecha sem decompor em Implement: crie ao menos uma filha com 'issues decompose --id ${issue.id} --into <arquivo.json>' (uma por Small Plan)`);
}

// Valida um .puml entregue: sintaxe (fail-fast) e compatibilidade kind↔diagramType.
export function validateUml(kind: DesignDiagram["kind"], path: string,
  check: DesignDiagram["check"]): void {
  try { UmlArtifact.validate(kind, check); }
  catch {
    if (!check.valid) throw new DesignGateError([plantumlError(path, check)]);
    throw new DesignGateError([{ code: "kind_mismatch", path,
      message: `kind "${kind}" não corresponde ao diagrama detectado "${check.diagramType}"` }]);
  }
}

// O pacote de design só é mutável em Issue action=Design não CLOSED.
export function requireOpenDesignIssue(issue: Issue): void {
  if (issue.action !== "Design") {
    throw new DomainError(`Issue ${issue.id} não é de Design (action=${issue.action}): o pacote de design pertence a Issues Design`);
  }
  if (issue.status === "CLOSED") {
    throw new DomainError(`Issue de Design ${issue.id} está CLOSED — pacote imutável`);
  }
}

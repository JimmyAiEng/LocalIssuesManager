import { readFileSync } from "node:fs";
import {
  DESIGN_KINDS, type DesignDiagram, DesignGateError, evaluateDesignGate, parseDesignKind,
  plantumlError, requireNonEmptyDoc, type DesignError,
} from "../domain/gates/design_gate.js";
import { DocumentArtifact } from "../domain/artifacts/document_artifact.js";
import { UmlArtifact } from "../domain/artifacts/uml_artifact.js";
import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { requireValidPlan } from "./plan_use_cases.js";
import { checkSyntax } from "./plantuml_check.js";

// Reexporta o erro de gate para a camada CLI: cli_design consome via app, sem furar CLI->domain.
export { DesignGateError };

export type DesignPackage = {
  issueId: string;
  design_md: string | null;
  architecture_changed: boolean | null;
  diagrams: Record<string, string | null>;
  validation: { ready: boolean; errors: DesignError[] };
};

// Entrega o design.md da Issue de Design — vazio/whitespace é rejeitado, grande também
// (design grande = Issue grande), e nada é gravado.
export function setDesignDoc(input: { issueId: string; file: string }, root?: string): object {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  requireOpenDesignIssue(issue);
  const content = readFileSync(input.file, "utf8");
  requireNonEmptyDoc(content);
  DocumentArtifact.validate(content);
  queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "document", name: "design.md" }, content);
  return { ok: true, issue: issue.id, path: "design.md" };
}

// Entrega um diagrama .puml da Issue de Design — valida sintaxe (fail-fast) e a
// compatibilidade kind↔diagramType antes de gravar; regravar substitui.
export async function addDesignDiagram(
  input: { issueId: string; kind: string; file: string }, root?: string,
): Promise<object> {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  requireOpenDesignIssue(issue);
  const kind = parseDesignKind(input.kind);
  const source = readFileSync(input.file, "utf8");
  const path = `${kind}.puml`;
  const check = await checkSyntax(source);
  validateUml(kind, path, check);
  queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "uml", name: path }, source);
  return { ok: true, issue: issue.id, path };
}

// Decisão de arquitetura da Issue Design (setável só em Issue action=Design, não CLOSED):
// governa qual gate roda na conclusão (4 níveis+aceite humano vs. atalho ao plano).
export function setArchitectureChanged(input: { issueId: string; value: boolean }, root?: string): object {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  requireOpenDesignIssue(issue);
  issue.setArchitectureChanged(input.value);
  queue.save(issue);
  return { ok: true, issue: issue.id, architecture_changed: input.value };
}

// Pacote de design da Issue (somente leitura, qualquer status): o design.md, os diagramas
// por kind e o veredito do gate (re-valida cada .puml, ramificado por architecture_changed).
export async function getDesignPackage(input: { issueId: string }, root?: string): Promise<DesignPackage> {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  return packageFor(queue, issue);
}

// Gate de conclusão de uma Issue Design: relê o pacote (re-checa a sintaxe de cada .puml) e o
// plano; com mudança de arquitetura nunca fecha AFK — aceite é humano (análogo ao gate de Deploy).
export async function requireDesignGate(queue: Queue, issue: Issue, status: "AWAITING" | "CLOSED"): Promise<void> {
  const { validation } = await packageFor(queue, issue);
  if (validation.errors.length > 0) throw new DesignGateError(validation.errors);
  requireValidPlan(queue, issue.project, issue.id); // plano é obrigatório nos dois caminhos
  requireImplementChild(queue, issue); // trava de decomposição: o fan-out N→N×M exige ao menos uma filha Implement
  if (issue.architecture_changed && status === "CLOSED") {
    throw new DomainError("Issue Design com mudança de arquitetura não fecha por agente: envie para decisão humana com --status AWAITING (o aceite do Design é humano — decide no web)");
  }
}

// Trava de decomposição: uma Issue Design só fecha depois de gerar as Issues Implement (uma por
// Small Plan). Sem nenhuma filha action=Implement, o fan-out para na Design — não fecha.
function requireImplementChild(queue: Queue, issue: Issue): void {
  const hasImplement = issue.relates.filter((relation) => relation.kind === "child")
    .some((relation) => queue.load(relation.id)?.action === "Implement");
  if (!hasImplement) throw new DomainError(`Issue Design não fecha sem decompor em Implement: crie ao menos uma filha com 'issues decompose --id ${issue.id} --into <arquivo.json>' (uma por Small Plan)`);
}

async function packageFor(queue: Queue, issue: Issue): Promise<DesignPackage> {
  const { project, id: issueId } = issue;
  const design_md = queue.artifacts.readText(project, { issueId, type: "document", name: "design.md" });
  const diagrams: Record<string, string | null> = {};
  const checks: DesignDiagram[] = [];
  for (const kind of DESIGN_KINDS) {
    const source = queue.artifacts.readText(project, { issueId, type: "uml", name: `${kind}.puml` });
    diagrams[kind] = source;
    if (source !== null) checks.push({ kind, path: `${kind}.puml`, check: await checkSyntax(source) });
  }
  const errors = evaluateDesignGate(issue.architecture_changed, design_md, checks);
  return { issueId, design_md, architecture_changed: issue.architecture_changed,
    diagrams, validation: { ready: errors.length === 0, errors } };
}

function validateUml(kind: DesignDiagram["kind"], path: string,
  check: DesignDiagram["check"]): void {
  try { UmlArtifact.validate(kind, check); }
  catch {
    if (!check.valid) throw new DesignGateError([plantumlError(path, check)]);
    throw new DesignGateError([{ code: "kind_mismatch", path,
      message: `kind "${kind}" não corresponde ao diagrama detectado "${check.diagramType}"` }]);
  }
}

function requireOpenDesignIssue(issue: Issue): void {
  if (issue.action !== "Design") {
    throw new DomainError(`Issue ${issue.id} não é de Design (action=${issue.action}): o pacote de design pertence a Issues Design`);
  }
  if (issue.status === "CLOSED") {
    throw new DomainError(`Issue de Design ${issue.id} está CLOSED — pacote imutável`);
  }
}

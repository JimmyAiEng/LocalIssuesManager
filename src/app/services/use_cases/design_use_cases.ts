import { readFileSync } from "node:fs";
import { DesignGateError, parseDesignKind, requireNonEmptyDoc } from "../../../domain/gates/design_gate.js";
import { DocumentArtifact } from "../../../domain/artifacts/document_artifact.js";
import { Queue } from "../../../domain/queue_repository.js";
import { checkSyntax } from "../uml-validation/plantuml_check.js";
import { type DesignPackage, designPackage, requireOpenDesignIssue, validateUml } from "../workflows/design.js";

// Reexporta o erro de gate para a camada CLI: cli_design consome via app, sem furar CLI->domain.
export { DesignGateError };
export type { DesignPackage };

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
  validateUml(kind, path, await checkSyntax(source));
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
  return designPackage(queue, issue);
}

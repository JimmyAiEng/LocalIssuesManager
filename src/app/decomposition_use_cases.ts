import { readFileSync } from "node:fs";
import { DomainError } from "../domain/domain_error.js";
import { validatePlan } from "../domain/implementation_plan.js";
import type { Issue } from "../domain/issue_entity.js";
import { clusterForTitle, parseAndValidatePrd, type Prd } from "../domain/prd.js";
import { Queue } from "../domain/queue_repository.js";
import { parseAndValidateRequirements } from "../domain/requirements.js";
import { createIssue, relateIssues } from "./issue_use_cases.js";

// Formato do arquivo --into: descreve as filhas do fan-out. mode concurrent (default) = filhas
// independentes; sequential = cada filha encadeada see-also à anterior (a fila serve por ordem
// de criação, então a ordem do arquivo já é a ordem de execução). Small Plan por filha em `plan`.
export type DecomposeChild = {
  title: string; type: string; action: string; problem: string;
  acceptance_criteria?: string; cluster?: string; plan?: unknown;
};
export type Decomposition = { mode?: string; children: DecomposeChild[] };
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
    if (child.plan) queue.artifacts.writeText(parent.project,
      { issueId: issue.id, type: "plan" }, JSON.stringify(validatePlan(child.plan)));
    if (mode === "sequential" && previous) relateIssues({ id: issue.id, relates: [previous], kind: "see-also" }, root);
    previous = issue.id;
    created.push(issue.id);
  }
  return { parent: parent.id, mode, children: created };
}

function createChildIssue(parent: Issue, child: DecomposeChild, actor: string, root?: string): Issue {
  return createIssue({ title: child.title, project: parent.project, type: child.type, action: child.action,
    problem: child.problem, acceptance_criteria: child.acceptance_criteria, actor }, root);
}

// Trava por action do pai: Planning só decompõe em Design (uma por cluster), Design só em Implement
// (cada uma com o seu Small Plan). Valida cedo, com o mesmo critério que os gates depois cobram.
function validateChildren(queue: Queue, parent: Issue, children: DecomposeChild[]): void {
  if (parent.action === "Planning") return validateDesignChildren(queue, parent, children);
  if (parent.action === "Design") return validateImplementChildren(children);
  throw new DomainError(`Issue ${parent.id} (action=${parent.action}) não decompõe: só Planning (→Design) e Design (→Implement)`);
}

// A filha Design resolve o cluster pelo nome contido no título (convenção clusterForTitle): o
// título precisa casar um cluster do PRD, senão o gate de Planning nunca a reconheceria.
function validateDesignChildren(queue: Queue, parent: Issue, children: DecomposeChild[]): void {
  const prd = requireParentPrd(queue, parent);
  for (const child of children) {
    if (child.action !== "Design") throw new DomainError(`Filha de Planning deve ter action=Design (recebido "${child.action}" em "${child.title}")`);
    if (!clusterForTitle(prd, child.title)) throw new DomainError(`Título da filha Design "${child.title}" não casa nenhum cluster do PRD (${prd.clusters.map((c) => c.name).join(", ")}): inclua o nome do cluster no título`);
  }
}

function validateImplementChildren(children: DecomposeChild[]): void {
  for (const child of children) {
    if (child.action !== "Implement") throw new DomainError(`Filha de Design deve ter action=Implement (recebido "${child.action}" em "${child.title}")`);
    if (child.plan === undefined) throw new DomainError(`Filha Implement "${child.title}" exige o Small Plan (campo "plan" no formato do implementation_plan)`);
    validatePlan(child.plan); // valida antes de criar; erro claro por filha
  }
}

function requireParentPrd(queue: Queue, parent: Issue): Prd {
  const rawPrd = queue.artifacts.readText(parent.project, { issueId: parent.id, type: "prd" });
  const rawReq = queue.artifacts.readText(parent.project, { issueId: parent.id, type: "requirements" });
  if (rawPrd === null || rawReq === null) throw new DomainError(`Decompor Planning exige requisitos e PRD persistidos na Issue ${parent.id} (defina-os com 'issues requirements set' e 'issues prd set')`);
  return parseAndValidatePrd(rawPrd, parseAndValidateRequirements(rawReq));
}

function parseDecomposition(text: string): Decomposition {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new DomainError("Arquivo de decomposição deve ser JSON válido"); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new DomainError("Decomposição deve ser um objeto JSON com children");
  const spec = parsed as Record<string, unknown>;
  if (spec.mode !== undefined && spec.mode !== "concurrent" && spec.mode !== "sequential") throw new DomainError('Decomposição.mode deve ser "concurrent" ou "sequential"');
  if (!Array.isArray(spec.children) || spec.children.length === 0) throw new DomainError("Decomposição.children deve ter ao menos uma filha");
  spec.children.forEach(assertChildShape);
  return spec as Decomposition;
}

function assertChildShape(child: unknown, index: number): void {
  const fields = child as Record<string, unknown>;
  for (const field of ["title", "type", "action", "problem"] as const) {
    const value = fields?.[field];
    if (typeof value !== "string" || !value.trim()) throw new DomainError(`Decomposição.children[${index}].${field} é obrigatório (texto não vazio)`);
  }
}

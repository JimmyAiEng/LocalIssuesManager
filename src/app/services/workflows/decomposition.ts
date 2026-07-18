import { DomainError } from "../../../domain/domain_error.js";
import { ImplementationPlanArtifact } from "../../../domain/artifacts/implementation_plan_artifact.js";
import { RequirementArtifact, type RequirementSet } from "../../../domain/artifacts/requirement_artifact.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";

// Formato do arquivo --into: descreve as filhas do fan-out. mode concurrent (default) = filhas
// independentes; sequential = cada filha encadeada see-also à anterior (a fila serve por ordem
// de criação, então a ordem do arquivo já é a ordem de execução). Small Plan por filha em `plan`.
export type DecomposeChild = {
  title: string; type: string; action: string; problem: string;
  acceptance_criteria?: string; plan?: unknown;
};
export type Decomposition = { mode?: string; children: DecomposeChild[] };

// Trava por action do pai: Planning só decompõe em Design (uma por Feature), Design só em
// Implement (cada uma com o seu Small Plan). Valida cedo, com o mesmo critério que os
// gates depois cobram.
export function validateChildren(queue: Queue, parent: Issue, children: DecomposeChild[]): void {
  if (parent.action === "Planning") return validateDesignChildren(queue, parent, children);
  if (parent.action === "Design") return validateImplementChildren(children);
  throw new DomainError(`Issue ${parent.id} (action=${parent.action}) não decompõe: só Planning (→Design) e Design (→Implement)`);
}

// Cada filha Design corresponde a uma Feature do RequirementArtifact pelo nome no título.
function validateDesignChildren(queue: Queue, parent: Issue, children: DecomposeChild[]): void {
  const requirements = requireParentRequirements(queue, parent);
  const names = RequirementArtifact.featureNames(requirements);
  for (const child of children) {
    if (child.action !== "Design") throw new DomainError(`Filha de Planning deve ter action=Design (recebido "${child.action}" em "${child.title}")`);
    if (!names.some((name) => child.title.includes(name))) throw new DomainError(`Título da filha Design "${child.title}" não casa nenhuma Feature (${names.join(", ")}): inclua o nome da Feature no título`);
  }
}

function validateImplementChildren(children: DecomposeChild[]): void {
  for (const child of children) {
    if (child.action !== "Implement") throw new DomainError(`Filha de Design deve ter action=Implement (recebido "${child.action}" em "${child.title}")`);
    if (child.plan === undefined) throw new DomainError(`Filha Implement "${child.title}" exige o Small Plan (campo "plan" no formato do implementation-plan)`);
    ImplementationPlanArtifact.validateParsed(child.plan); // valida antes de criar
  }
}

function requireParentRequirements(queue: Queue, parent: Issue): RequirementSet {
  const raw = queue.artifacts.readText(parent.project, { issueId: parent.id, type: "requirement" });
  if (raw === null) throw new DomainError(`Decompor Planning exige Requirements persistidos na Issue ${parent.id} (defina-os com 'issues requirements set')`);
  return RequirementArtifact.validate(raw);
}

export function parseDecomposition(text: string): Decomposition {
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

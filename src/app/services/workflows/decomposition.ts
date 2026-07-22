import { DomainError } from "../../../domain/domain_error.js";
import { ImplementationPlanArtifact } from "../../../domain/artifacts/implementation_plan_artifact.js";
import { type Feature, RequirementArtifact, type RequirementSet } from "../../../domain/artifacts/requirement_artifact.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { designSiblings } from "./design_siblings.js";
import { designChildCoverage } from "./planning.js";

// Formato do arquivo --into: descreve as filhas do fan-out. mode concurrent (default) = filhas
// independentes; sequential = cada filha encadeada see-also à anterior (a fila serve por ordem
// de criação, então a ordem do arquivo já é a ordem de execução). Small Plan por filha em `plan`;
// grupo de Features da filha Design em `features`.
export type DecomposeChild = {
  title: string; type: string; action: string; problem: string;
  acceptance_criteria?: string; plan?: unknown; features?: string[];
};
export type Decomposition = { mode?: string; children: DecomposeChild[] };

// Trava por action do pai: Planning só decompõe em Design (uma por Feature), Design só em
// Implement (cada uma com o seu Small Plan). Valida cedo, com o mesmo critério que os
// gates depois cobram.
export function validateChildren(queue: Queue, parent: Issue, children: DecomposeChild[]): void {
  if (parent.action === "Planning") return validateDesignChildren(queue, parent, children);
  if (parent.action === "Design") { requireSoleDesign(queue, parent); return validateImplementChildren(children); }
  if (parent.action === "ConflictReview") return validateImplementChildren(children);
  throw new DomainError(`Issue ${parent.id} (action=${parent.action}) não decompõe: só Planning (→Design), Design e ConflictReview (→Implement)`);
}

// Um Design que concorre com irmãos (2+ Designs não abandonados sob o mesmo pai) não cria Implement:
// as fatias irmãs podem conflitar, então a reconciliação (ConflictReview) junta os Designs e é ELA
// que decompõe. Design sozinho decompõe direto, como sempre (retrocompatível).
function requireSoleDesign(queue: Queue, parent: Issue): void {
  if (designSiblings(queue, parent).length > 1) {
    throw new DomainError(`Design ${parent.id} não decompõe em Implement: há Designs irmãos sob o mesmo pai (conflito possível entre fatias concorrentes). A reconciliação (ConflictReview) nasce quando o último Design irmão fecha e é ela que cria as Issues Implement.`);
  }
}

// Cada filha Design declara em `features` o grupo de Features que cobre: requisito é linguagem do
// usuário e design é linguagem da solução, então a relação é N:1. O título é livre — o que vale é a
// declaração. Partição: uma Feature nunca cai em duas filhas, nem nesta chamada nem nas anteriores.
function validateDesignChildren(queue: Queue, parent: Issue, children: DecomposeChild[]): void {
  const names = RequirementArtifact.featureNames(requireParentRequirements(queue, parent));
  const taken = new Set(designChildCoverage(queue, parent).keys());
  for (const child of children) {
    if (child.action !== "Design") throw new DomainError(`Filha de Planning deve ter action=Design (recebido "${child.action}" em "${child.title}")`);
    for (const name of declaredFeatures(child)) {
      if (!names.includes(name)) throw new DomainError(`Feature "${name}" declarada em "${child.title}" não existe nos requisitos da Issue ${parent.id} (disponíveis: ${names.join(", ")})`);
      if (taken.has(name)) throw new DomainError(`Feature "${name}" já coberta por outra filha Design: cada Feature pertence a exatamente um grupo`);
      taken.add(name);
    }
  }
}

function declaredFeatures(child: DecomposeChild): string[] {
  const features = child.features;
  if (!Array.isArray(features) || features.length === 0
    || features.some((name) => typeof name !== "string" || !name.trim())) {
    throw new DomainError(`Filha Design "${child.title}" exige "features": os nomes das Features do pai que ela cobre`);
  }
  return features;
}

// As Features declaradas: o decompose grava esse recorte como o RequirementArtifact da filha, que
// passa a possuir os seus requisitos em vez de casar nome com título depois. Filtra pelo campo em
// vez de indexar por posição — nome inexistente some do recorte, nunca vira `undefined` no meio.
export function featuresDeclaradas(queue: Queue, parent: Issue, declared: string[]): Feature[] {
  const requirements = requireParentRequirements(queue, parent);
  return requirements.features.filter((feature) => declared.includes(feature.feature));
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

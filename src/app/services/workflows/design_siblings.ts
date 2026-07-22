import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { isAbandoned } from "../../../domain/value_objects.js";

// Filhas (par recíproco kind=child) de um pai, carregadas da fila; relacionada purgada some.
// Módulo sem dependências de app (só domínio): serve design.ts, decomposition.ts e review_trigger.ts
// sem fechar ciclo com issue_use_cases.
export function childrenOf(queue: Queue, parent: Issue): Issue[] {
  return parent.relates
    .filter((relation) => relation.kind === "child")
    .map((relation) => queue.load(relation.id))
    .filter((child): child is Issue => child !== null);
}

// Pai de um Design na linhagem: o Planning (1º ciclo) ou a Review (2º ciclo, re-design após REPROVA).
export function designParent(queue: Queue, design: Issue): Issue | null {
  for (const relation of design.relates) {
    if (relation.kind !== "parent") continue;
    const parent = queue.load(relation.id);
    if (parent && (parent.action === "Planning" || parent.action === "Review")) return parent;
  }
  return null;
}

// Designs irmãos NÃO abandonados sob o mesmo pai, incluindo o próprio. Abandonados (errado/obsoleto/
// duplicado) não contam — a reconciliação só existe com concorrência real. Design avulso (sem pai na
// linhagem) é sozinho por definição, preservando o comportamento retrocompatível de Design único.
export function designSiblings(queue: Queue, design: Issue): Issue[] {
  const parent = designParent(queue, design);
  if (!parent) return [design];
  return childrenOf(queue, parent)
    .filter((child) => child.action === "Design" && !isAbandoned(child.closed_reason));
}

// Um Design multi-irmão fecha childless (adia a decomposição ao ConflictReview); o sozinho fecha COM
// filha Implement viva. Ter (ou não) filha Implement é o sinal que distingue os dois no gatilho.
export function hasImplementChild(queue: Queue, design: Issue): boolean {
  return childrenOf(queue, design).some((child) => child.action === "Implement");
}

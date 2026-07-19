import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { createIssue, relateIssues } from "../use_cases/issue_use_cases.js";

// Gatilho de ciclo de vida: ao fechar a última Issue Implement concluída de um pai (Design ou
// Review), cria automaticamente uma Issue Review ligada ao pai (kind=parent) e às irmãs Implement
// concluídas (see-also). Chamado após queue.save nos dois caminhos de fechamento — statusIssue
// (agente e override humano) e decideIssue (decide humano da web) —, nunca dentro de deliverByAgent.
// Idempotente: só cria se não sobrar Review irmã fora de CLOSED, o que também habilita o 2º ciclo
// (Review reprovado → nova Implement → ao fechar, nova Review).
export function afterIssueClosed(queue: Queue, closed: Issue, root?: string): void {
  if (closed.action !== "Implement" || closed.status !== "CLOSED" || closed.closed_reason !== "concluido") return;
  const parent = resolveParent(queue, closed);
  if (!parent) return;
  const siblings = childrenOf(queue, parent);
  const openImplement = siblings.some((s) => s.action === "Implement" && s.status !== "CLOSED");
  const openReview = siblings.some((s) => s.action === "Review" && s.status !== "CLOSED");
  const concluded = siblings.filter((s) => s.action === "Implement" && s.closed_reason === "concluido");
  if (openImplement || openReview || concluded.length === 0) return;
  createReview(parent, concluded, closed.owner ?? "human", root);
}

// Pai = primeira relação kind=parent cuja Issue é Design ou Review (a Implement é filha de um deles).
function resolveParent(queue: Queue, closed: Issue): Issue | null {
  for (const relation of closed.relates) {
    if (relation.kind !== "parent") continue;
    const parent = queue.load(relation.id);
    if (parent && (parent.action === "Design" || parent.action === "Review")) return parent;
  }
  return null;
}

// Irmãs = filhas do pai (par recíproco kind=child gravado por relateIssues/decompose). Inclui a
// própria Implement recém-fechada e qualquer Review de ciclos anteriores.
function childrenOf(queue: Queue, parent: Issue): Issue[] {
  return parent.relates
    .filter((relation) => relation.kind === "child")
    .map((relation) => queue.load(relation.id))
    .filter((child): child is Issue => child !== null);
}

function createReview(parent: Issue, concluded: Issue[], creator: string, root?: string): void {
  const review = createIssue({
    title: `Review: ${parent.title}`,
    project: parent.project,
    type: parent.type,
    action: "Review",
    problem: `Revisar o conjunto de Issues Implement concluídas do pai "${parent.title}".`,
    actor: creator,
  }, root);
  relateIssues({ id: review.id, relates: [parent.id], kind: "parent" }, root); // recíproco child no pai
  relateIssues({ id: review.id, relates: concluded.map((sibling) => sibling.id), kind: "see-also" }, root);
}

import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { createIssue, relateIssues } from "../use_cases/issue_use_cases.js";

// Gatilho de ciclo de vida: ao fechar a última Issue Implement concluída de um pai (Design ou
// Review), encadeia a próxima etapa. Chamado após queue.save nos dois caminhos de fechamento —
// statusIssue (agente e override humano) e decideIssue (decide humano da web) —, nunca dentro de
// deliverByAgent. Idempotente: só age se não sobrar Implement/Review irmã fora de CLOSED.
//
// Quando o pai foi fatiado em mais de uma Implement, entra um passo de integração antes da Review:
// a última fatia a fechar gera uma Issue Implement de integração (integration=true) que instrui o
// agente a juntar as fatias numa branch única e limpar as worktrees; a Review só nasce quando essa
// Issue de integração fecha. Fatia única não integra: cria a Review direto, como antes. O 2º ciclo
// (Review reprovado → novas Implement) reusa o mesmo caminho, pois o pai também pode ser uma Review.
export function afterIssueClosed(queue: Queue, closed: Issue, root?: string): void {
  if (closed.action !== "Implement" || closed.status !== "CLOSED" || closed.closed_reason !== "concluido") return;
  const parent = resolveParent(queue, closed);
  if (!parent) return;
  const siblings = childrenOf(queue, parent);
  const openImplement = siblings.some((s) => s.action === "Implement" && s.status !== "CLOSED");
  const openReview = siblings.some((s) => s.action === "Review" && s.status !== "CLOSED");
  if (openImplement || openReview) return;
  const concluded = siblings.filter((s) => s.action === "Implement" && s.closed_reason === "concluido");
  if (concluded.length === 0) return;
  // As fatias reais excluem a própria Issue de integração (que também é Implement concluída).
  const slices = concluded.filter((s) => !s.integration);
  // Fechou a última de várias fatias e ainda não houve integração: gera a integração e adia a Review.
  if (!closed.integration && slices.length > 1 && !concluded.some((s) => s.integration)) {
    createIntegration(parent, slices, closed.owner ?? "human", root);
    return;
  }
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

// Issue Implement de integração (integration=true), ligada ao pai (kind=parent) e às fatias
// concluídas (see-also). Só instrui o agente: o issue-manager não executa git — quem integra e
// limpa as worktrees é quem reivindicar esta Issue.
function createIntegration(parent: Issue, slices: Issue[], creator: string, root?: string): void {
  const integration = createIssue({
    title: `Integração: ${parent.title}`,
    project: parent.project,
    type: parent.type,
    action: "Implement",
    problem: `Integrar numa única branch as fatias concluídas de "${parent.title}" e limpar as branches/worktrees issue/<id> usadas no desenvolvimento delas. O issue-manager não executa git: faça a integração e a limpeza e registre a evidência.`,
    integration: true,
    actor: creator,
  }, root);
  relateIssues({ id: integration.id, relates: [parent.id], kind: "parent" }, root); // recíproco child no pai
  relateIssues({ id: integration.id, relates: slices.map((slice) => slice.id), kind: "see-also" }, root);
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

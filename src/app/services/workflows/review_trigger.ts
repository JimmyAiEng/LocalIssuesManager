import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { createIssue, relateIssues } from "../use_cases/issue_use_cases.js";
import { childrenOf, designParent, designSiblings, hasImplementChild } from "./design_siblings.js";

// Gatilho de ciclo de vida: ao fechar uma Issue, encadeia a próxima etapa. Chamado após queue.save nos
// dois caminhos de fechamento — statusIssue (agente e override humano) e decideIssue (decide humano da
// web) —, nunca dentro de deliverByAgent. Idempotente. Ramifica pela action fechada: Implement concluida
// encadeia integração/Review; Design de QUALQUER motivo (concluido ou abandono) re-avalia a reconciliação
// (ConflictReview), pois abandonar o último irmão também finaliza a linhagem dos que fecharam childless.
export function afterIssueClosed(queue: Queue, closed: Issue, root?: string): void {
  if (closed.status !== "CLOSED") return;
  if (closed.action === "Design") return afterDesignClosed(queue, closed, root);
  if (closed.action === "Implement" && closed.closed_reason === "concluido") return afterImplementClosed(queue, closed, root);
}

// Quando o pai foi fatiado em mais de uma Implement, entra um passo de integração antes da Review: a
// última fatia a fechar gera uma Issue Implement de integração (integration=true) que instrui o agente
// a juntar as fatias numa branch única e limpar as worktrees; a Review só nasce quando essa Issue de
// integração fecha. Fatia única não integra: cria a Review direto. O 2º ciclo (Review reprovado →
// novas Implement) reusa o mesmo caminho, pois o pai também pode ser uma Review ou ConflictReview.
function afterImplementClosed(queue: Queue, closed: Issue, root?: string): void {
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

// Gatilho de reconciliação: condição-base sobre os Designs irmãos NÃO abandonados de um pai (Planning,
// ou Review no 2º ciclo), avaliada a cada fechamento de Design (concluido OU abandono). Cria o
// ConflictReview do pai sse, e só se, TODOS valerem:
//   - não há ConflictReview irmã fora de CLOSED (idempotência, espelha openReview de afterImplementClosed);
//   - todo Design não abandonado está terminal (CLOSED) — nenhum em OPEN/CLAIMED/AWAITING/APPROVED;
//   - ao menos um deles fechou concluido SEM filha Implement, isto é, adiou a decomposição (childless).
// Cobre o multi normal (todos childless → 1 CR), o degenerado abandon-sobra-um (o childless sobrevivente
// ainda ganha seu CR) e NÃO dispara para Design sozinho (fecha COM filha Implement → cláusula childless falsa).
function afterDesignClosed(queue: Queue, closed: Issue, root?: string): void {
  const parent = designParent(queue, closed);
  if (!parent) return;
  const designs = designSiblings(queue, closed); // já exclui abandonados
  const openReview = childrenOf(queue, parent).some((c) => c.action === "ConflictReview" && c.status !== "CLOSED");
  if (openReview) return;
  if (designs.some((design) => design.status !== "CLOSED")) return;
  const deferred = designs.some((design) => design.closed_reason === "concluido" && !hasImplementChild(queue, design));
  if (!deferred) return;
  createConflictReview(parent, designs, closed.owner ?? "human", root);
}

// Pai da Implement = primeira relação kind=parent cuja Issue é Design, ConflictReview ou Review
// (a Implement é filha de um deles; ConflictReview mantém a cadeia da Quality Review no fim).
function resolveParent(queue: Queue, closed: Issue): Issue | null {
  for (const relation of closed.relates) {
    if (relation.kind !== "parent") continue;
    const parent = queue.load(relation.id);
    if (parent && (parent.action === "Design" || parent.action === "ConflictReview" || parent.action === "Review")) return parent;
  }
  return null;
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
    problem: `Integrar na branch integration/${parent.id} (ramificada de origin/main) as fatias concluídas de "${parent.title}" e limpar as branches/worktrees <type>/<id> usadas no desenvolvimento delas. O issue-manager não executa git: faça a integração e a limpeza e registre a evidência com o nome da branch de integração.`,
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

// ConflictReview do pai: filho dele (kind=parent, recíproco child) e see-also aos Designs irmãos.
// Produz o SEU plano reconciliado e é ele que decompõe em Implement; não muta os Designs (CLOSED
// é imutável). É o passo de reconciliação que evita conflitos de merge entre fatias concorrentes.
function createConflictReview(parent: Issue, designs: Issue[], creator: string, root?: string): void {
  const review = createIssue({
    title: `Conflict Review: ${parent.title}`,
    project: parent.project,
    type: parent.type,
    action: "ConflictReview",
    problem: `Reconciliar os Designs irmãos de "${parent.title}" (fatias concorrentes que podem tocar o mesmo código) e criar as Issues Implement a partir do plano reconciliado.`,
    actor: creator,
  }, root);
  relateIssues({ id: review.id, relates: [parent.id], kind: "parent" }, root); // recíproco child no pai
  relateIssues({ id: review.id, relates: designs.map((design) => design.id), kind: "see-also" }, root);
}

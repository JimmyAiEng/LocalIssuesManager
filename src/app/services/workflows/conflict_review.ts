import { DocumentArtifact } from "../../../domain/artifacts/document_artifact.js";
import { DomainError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { isLive, wasApproved } from "../../../domain/value_objects.js";
import type { CompletionStatus } from "./index.js";

// Gate de conclusão do ConflictReview (reconciliação dos Designs irmãos concorrentes): exige o plano
// reconciliado (reconciliation.md) nas duas saídas — é o que o humano lê para julgar — e, no CLOSED,
// ao menos uma filha Implement viva (o fan-out que a reconciliação abre). No AWAITING pré-aprovação o
// veredito vai primeiro ao humano: recusa se já houver Implement viva (clona rejectEarlyRework).
export function validateConflictReview(queue: Queue, issue: Issue, status: CompletionStatus): void {
  requireReconciliation(queue, issue); // plano reconciliado obrigatório nos dois caminhos
  if (status === "CLOSED") requireLiveImplementChild(queue, issue);
  if (status === "AWAITING" && !wasApproved(issue.phases)) rejectEarlyImplement(queue, issue);
}

function requireReconciliation(queue: Queue, issue: Issue): void {
  const content = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "document", name: "reconciliation.md" });
  if (content === null) throw new DomainError(`Issue ConflictReview não conclui sem reconciliation.md: registre o plano reconciliado dos Designs irmãos com 'issues artifact --id ${issue.id} --name reconciliation.md --file <f>'`);
  DocumentArtifact.validate(content);
}

// Clona requireImplementChild do Design: o CLOSED só fecha com a decomposição feita e uma filha viva.
function requireLiveImplementChild(queue: Queue, issue: Issue): void {
  const hasImplement = issue.relates.filter((relation) => relation.kind === "child")
    .map((relation) => queue.load(relation.id))
    .some((child) => child?.action === "Implement" && isLive(child.status));
  if (!hasImplement) throw new DomainError(`Issue ConflictReview não fecha sem decompor em Implement viva (OPEN ou CLAIMED): crie as filhas reconciliadas com 'issues decompose --id ${issue.id} --into <arquivo.json>'`);
}

// Clona rejectEarlyRework do Review: o retrabalho (Implement) não pode existir ANTES da decisão humana.
function rejectEarlyImplement(queue: Queue, issue: Issue): void {
  const open = issue.relates.map((relation) => queue.load(relation.id))
    .find((related): related is Issue => related !== null && isLive(related.status) && related.action === "Implement");
  if (open === undefined) return;
  throw new DomainError(`ConflictReview não vai para AWAITING com Implement já criada (${open.id} em ${open.status}): a reconciliação vai primeiro ao humano — só quando a Issue voltar APROVADA você cria as Issues Implement e fecha. Abandone a criada cedo com 'issues status --id ${open.id} --reason errado' e reenvie`);
}

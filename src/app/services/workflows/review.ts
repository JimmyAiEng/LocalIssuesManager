import { DocumentArtifact } from "../../../domain/artifacts/document_artifact.js";
import { DomainError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";

// Gate de conclusão de Review: exige o conjunto de documentos da revisão (intent + ≥2 evidence,
// cada ≤300 palavras) e condiciona a conclusão ao veredito. Veredito REPROVADO só conclui com
// retrabalho vivo — uma Issue relacionada Implement/Design fora de CLOSED, distinta das Issues
// revisadas (já fechadas).
export function validateReview(queue: Queue, issue: Issue): void {
  requireIntent(queue, issue);
  requireEvidence(queue, issue);
  if (parseVerdict(queue, issue) === "REPROVADO") requireLiveRework(queue, issue);
}

function requireIntent(queue: Queue, issue: Issue): void {
  const content = readDoc(queue, issue, "intent.md");
  if (content === null) throw new DomainError(`Issue Review não conclui sem intent.md: registre a intenção com 'issues artifact --id ${issue.id} --name intent.md --file <f>'`);
  DocumentArtifact.validate(content);
}

function requireEvidence(queue: Queue, issue: Issue): void {
  // list("document") inclui o sentinela legado "artifact.md" e o intent.md; o prefixo evidence- exclui ambos.
  const evidence = queue.artifacts.list(issue.project, issue.id, "document")
    .filter((name) => name.startsWith("evidence-") && name.endsWith(".md"));
  if (evidence.length < 2) throw new DomainError(`Issue Review exige ao menos duas evidence-*.md (encontradas: ${evidence.length}): grave com 'issues artifact --id ${issue.id} --name evidence-<n>.md --file <f>'`);
  for (const name of evidence) DocumentArtifact.validate(readDoc(queue, issue, name)!); // listada = existe; ≤300 palavras
}

// Veredito no artefato legado (issues artifact sem --name): a primeira palavra decide.
function parseVerdict(queue: Queue, issue: Issue): "APROVADO" | "REPROVADO" {
  const content = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "document" });
  if (content === null) throw new DomainError(`Issue Review não conclui sem o veredito: grave APROVADO | APROVADO com ressalva | REPROVADO com 'issues artifact --id ${issue.id} --file <veredito.md>'`);
  DocumentArtifact.validate(content);
  const first = content.trim().match(/^\p{L}+/u)?.[0]; // palavra inicial, tolerando pontuação (APROVADO:, REPROVADO.)
  if (first === "APROVADO") return "APROVADO";
  if (first === "REPROVADO") return "REPROVADO";
  throw new DomainError(`Veredito de Review deve começar por APROVADO | APROVADO com ressalva | REPROVADO (recebido "${content.trim().split(/\s+/)[0]}")`);
}

// REPROVADO exige retrabalho vivo: ao menos uma Issue relacionada (qualquer kind) de action
// Implement ou Design fora de CLOSED.
function requireLiveRework(queue: Queue, issue: Issue): void {
  const hasRework = issue.relates.some((relation) => {
    const related = queue.load(relation.id);
    return related !== null && related.status !== "CLOSED"
      && (related.action === "Implement" || related.action === "Design");
  });
  if (!hasRework) throw new DomainError(`Review REPROVADO só conclui com retrabalho vivo: relacione ao menos uma Issue Implement ou Design fora de CLOSED (crie com '--relates ${issue.id}' ou use 'issues relate')`);
}

function readDoc(queue: Queue, issue: Issue, name: string): string | null {
  return queue.artifacts.readText(issue.project, { issueId: issue.id, type: "document", name });
}

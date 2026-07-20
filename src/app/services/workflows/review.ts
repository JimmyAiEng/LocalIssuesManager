import { DocumentArtifact } from "../../../domain/artifacts/document_artifact.js";
import { DomainError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { wasApproved } from "../../../domain/value_objects.js";

// Gate de conclusão de Review: exige o conjunto de documentos da revisão (intent + ≥2 evidence,
// cada ≤300 palavras) e condiciona a conclusão ao veredito. Veredito REPROVADO só conclui com
// retrabalho vivo — uma Issue relacionada Implement/Design fora de CLOSED, distinta das Issues
// revisadas (já fechadas).
export function validateReview(queue: Queue, issue: Issue): void {
  // Refactor troca a intenção pelo Diff Check declarado; o restante do gate é igual para todo type.
  const diffCheck = issue.type === "Refactor" ? requireDiffCheck(queue, issue) : null;
  if (diffCheck === null) requireIntent(queue, issue);
  requireEvidence(queue, issue);
  if (parseVerdict(queue, issue) === "REPROVADO") requireLiveRework(queue, issue);
  else if (diffCheck !== null) enforceDiffCheck(queue, issue, diffCheck);
}

function requireIntent(queue: Queue, issue: Issue): void {
  const content = readDoc(queue, issue, "intent.md");
  if (content === null) throw new DomainError(`Issue Review não conclui sem intent.md: registre a intenção com 'issues artifact --id ${issue.id} --name intent.md --file <f>'`);
  DocumentArtifact.validate(content);
}

// Diff Check do Refactor: o agente declara as duas invariantes; o gate cobra a declaração, nunca lê o diff.
const DIFF_CHECK_DECLARATIONS = ["interface_publica_alterada", "teste_e2e_alterado"] as const;

type DiffCheck = Record<(typeof DIFF_CHECK_DECLARATIONS)[number], boolean>;

function requireDiffCheck(queue: Queue, issue: Issue): DiffCheck {
  const content = readDoc(queue, issue, "diff-check.md");
  if (content === null) throw new DomainError(`Issue Review de Refactor não conclui sem diff-check.md: declare o Diff Check com 'issues artifact --id ${issue.id} --name diff-check.md --file <f>'`);
  DocumentArtifact.validate(content);
  return {
    interface_publica_alterada: readDeclaration(content, "interface_publica_alterada"),
    teste_e2e_alterado: readDeclaration(content, "teste_e2e_alterado"),
  };
}

// Consequências da declaração, cobradas só quando o veredito é APROVADO (REPROVADO já pede retrabalho vivo).
function enforceDiffCheck(queue: Queue, issue: Issue, check: DiffCheck): void {
  if (check.teste_e2e_alterado) throw new DomainError(`Review de Refactor não conclui APROVADO com teste_e2e_alterado: true — e2e alterado significa comportamento mudado, o veredito é REPROVADO com retrabalho vivo`);
  if (check.interface_publica_alterada && !hasApprovedDesign(queue, issue)) throw new DomainError(`Review de Refactor com interface_publica_alterada: true só conclui APROVADO se um Design da linhagem tiver passado por APPROVED (aceite humano da mudança de interface): relacione o Design aprovado a esta Review ('issues relate --id ${issue.id} --relates <design> --kind parent') ou dê veredito REPROVADO`);
}

// Sobe a cadeia de parents (no 2º ciclo a Review pende de outra Review) até achar um Design aprovado.
function hasApprovedDesign(queue: Queue, issue: Issue): boolean {
  const seen = new Set([issue.id]);
  const frontier = parentIds(issue);
  while (frontier.length > 0) {
    const id = frontier.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const parent = queue.load(id);
    if (parent === null) continue;
    if (parent.action === "Design" && wasApproved(parent.phases)) return true;
    frontier.push(...parentIds(parent));
  }
  return false;
}

function parentIds(issue: Issue): string[] {
  return issue.relates.filter((relation) => relation.kind === "parent").map((relation) => relation.id);
}

// Uma declaração por linha, valor true|false: case-insensitive e tolerante a marcação de lista/negrito.
// Repetir a mesma invariante é tolerado enquanto os valores concordam; valores conflitantes são
// ambiguidade (o template do guia colado acima da declaração honesta escondia a real) e recusam.
function readDeclaration(content: string, key: string): boolean {
  const declaration = new RegExp(`^${key}\\s*:\\s*(true|false)$`, "i");
  const values = new Set<boolean>();
  for (const line of content.split("\n")) {
    const match = declaration.exec(line.replace(/\*/g, "").replace(/^\s*[-+]\s*/, "").trim());
    if (match) values.add(match[1].toLowerCase() === "true");
  }
  if (values.size === 0) throw new DomainError(`diff-check.md não declara a invariante "${key}": acrescente a linha '${key}: true|false'`);
  if (values.size > 1) throw new DomainError(`diff-check.md declara a invariante "${key}" duas vezes com valores conflitantes (true e false): deixe uma única declaração — apague o bloco de exemplo se colou o do guia`);
  return values.values().next().value!;
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

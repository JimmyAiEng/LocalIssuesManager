import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { mediaTypeForExt } from "../../../domain/artifacts/media_artifact.js";
import { DocumentArtifact } from "../../../domain/artifacts/document_artifact.js";
import { DomainError } from "../../../domain/domain_error.js";
import { Issue } from "../../../domain/issue_entity.js";
import { Queue } from "../../../domain/queue_repository.js";
import {
  type ActionType, type Actor, assertBrief, inverseKind, parseActionType, parseActor, parseAgentId, parseClosedReason,
  parseIssueStatus, parseIssueType, parseRelationKind, parseRole, type TagUpdates,
} from "../../../domain/value_objects.js";
import { type IncomingAttachment, persistableAttachments } from "../attachments.js";
import { requireProject } from "./project_use_cases.js";
import { type IssueSummary, type IssueView, issueView, type RelatedView, summary } from "./issue_views.js";
import { closeByHuman, deliverByAgent } from "../workflows/index.js";
import { afterIssueClosed } from "../workflows/review_trigger.js";

export type { IssueView, RelatedView, IssueSummary }; // re-export para os consumidores atuais (cli.ts, prompt_composition.ts)

export type CreateInput = {
  title: string; project: string; type: string; action: string; problem: string;
  acceptance_criteria?: string; actor: string; now?: Date;
  complexity?: string; human_need?: string; risk?: string; artifact?: string;
  relates?: string[]; attachments?: IncomingAttachment[]; integration?: boolean;
};

export function createIssue(input: CreateInput, root?: string): Issue {
  const actor = parseActor(input.actor);
  const queue = new Queue(root);
  requireProject(queue, input.project);
  if (input.artifact) assertBrief(input.artifact, "artifact");
  for (const id of input.relates ?? []) queue.loadRequired(id); // relação com Issue inexistente é typo
  const created = persistableAttachments(input.attachments, input.now); // valida antes de criar a Issue
  const issue = Issue.create({ title: input.title, project: input.project,
    type: parseIssueType(input.type), action: parseActionType(input.action), problem: input.problem,
    acceptance_criteria: input.acceptance_criteria, integration: input.integration, // relates fica com relateIssues, abaixo
    attachments: created.map(({ entity }) => entity.toJSON()) }, actor, input.now);
  const tags: TagUpdates = { complexity: input.complexity, human_need: input.human_need, risk: input.risk };
  if (Object.values(tags).some((value) => value !== undefined)) issue.tag(tags, actor); // reusa applyTags (valida enums)
  for (const { entity, bytes } of created) queue.artifacts.writeMedia(issue.project, entity, bytes);
  queue.save(issue);
  if (input.artifact) queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "document" }, input.artifact);
  return input.relates?.length ? relateIssues({ id: issue.id, relates: input.relates }, root) : issue; // simetria é invariante de escrita: mesmo caminho de `issues relate` (recíproco see-also)
}

// Humano assume uma Issue OPEN pela web (OPEN->CLAIMED); o claim por IA continua via nextIssue.
export function claimIssue(input: { id: string; now?: Date }, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  issue.claim("human", input.now);
  queue.save(issue);
  return issue;
}

export function getIssue(id: string, root?: string): IssueView {
  const queue = new Queue(root);
  return issueView(queue, queue.loadRequired(id));
}

// Handoff cru (handoff.md) da Issue: a sessão pós-APPROVED o lê para seguir; ausente falha.
export function getHandoff(id: string, root?: string): string {
  const queue = new Queue(root);
  const handoff = queue.artifacts.readText(queue.loadRequired(id).project, { issueId: id, type: "document", name: "handoff.md" });
  if (handoff === null) throw new DomainError(`Issue ${id} sem handoff.md: grave-o com 'issues artifact --id ${id} --name handoff.md --file <f>'`);
  return handoff;
}

// Trava do `issues get` no CLI: Issue OPEN só chega ao agente pelo claim de `issues next` (que entrega
// o contrato da action); sem ela, `list`+`get` deixam trabalhar Issue não reivindicada. A web não passa aqui.
export function assertNotOpen(id: string, root?: string): void {
  const issue = new Queue(root).loadRequired(id);
  if (issue.status !== "OPEN") return;
  throw new DomainError(`Issue ${id} está OPEN: reivindique com 'issues next --id ${id} --agent <ia>' — o claim entrega o contrato da action. 'issues get' só lê Issue já reivindicada.`);
}

export function listIssues(filter: { status?: string; project?: string; title?: string; type?: string }, root?: string): IssueSummary[] {
  const status = filter.status ? parseIssueStatus(filter.status) : undefined;
  const type = filter.type ? parseIssueType(filter.type) : undefined;
  return new Queue(root).list({ ...filter, status, type }).map(summary);
}

// Fila: reivindica a Issue elegível mais antiga do projeto (ou uma por --id). Em concern=HIGH,
// Design/Implement só é reivindicável por agente com todo pai (kind=parent) CLOSED: --id recusa citando o pai; --project pula. LOW/sem-pai/see-also/humano: livres. `actions` (--action a,b) restringe a fila do projeto a essas actions; --id nomeia a Issue e ignora o filtro.
export function nextIssue(input: { agent: string; project?: string; id?: string; actions?: string[]; now?: Date }, root?: string): IssueView | null {
  const agent = parseAgentId(input.agent);
  const queue = new Queue(root);
  if (!input.id && !input.project?.trim()) throw new Error("project is required");
  const issue = input.id ? claimTarget(queue, input.id) : oldestEligible(queue, input.project, input.actions?.map(parseActionType));
  if (!issue) return null;
  issue.claim(agent, input.now);
  queue.save(issue);
  return issueView(queue, issue);
}

function claimTarget(queue: Queue, id: string): Issue {
  const issue = queue.loadRequired(id);
  const parent = blockingParent(queue, issue);
  if (parent) throw new DomainError(`Issue ${issue.id} não é reivindicável por agente: o pai ${parent.id} está ${parent.status} (projeto concern=HIGH exige o pai CLOSED antes de reivindicar Design/Implement). Aguarde o pai fechar ou reivindique outra com 'issues next --project ${issue.project} --agent <ia>'.`);
  return issue;
}

// Elegível = OPEN ou APPROVED (a aprovada reentra na fila para o handoff seguir); pula as filhas
// bloqueadas e ordena como `oldestOpen`; `actions` (quando dado) restringe às actions pedidas.
function oldestEligible(queue: Queue, project: string | undefined, actions?: ActionType[]): Issue | null {
  return [...queue.list({ status: "OPEN", project }), ...queue.list({ status: "APPROVED", project })]
    .sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at) || a.id.localeCompare(b.id))
    .find((issue) => (!actions || actions.includes(issue.action)) && !blockingParent(queue, issue)) ?? null;
}

// Pai (kind=parent) fora de CLOSED que bloqueia o claim de agente, ou null (só HIGH bloqueia; pai purgado já foi CLOSED; see-also do decompose é decorativa).
function blockingParent(queue: Queue, issue: Issue): Issue | null {
  if ((queue.readProject(issue.project)?.concern ?? "LOW") !== "HIGH") return null;
  if (issue.action !== "Design" && issue.action !== "Implement") return null;
  for (const relation of issue.relates) {
    if (relation.kind !== "parent") continue;
    const parent = queue.load(relation.id);
    if (parent && parent.status !== "CLOSED") return parent;
  }
  return null;
}

export type StatusInput = {
  id: string; agent?: string; human?: boolean; status: string; comment: string;
  closed_reason?: string; role?: string; now?: Date;
};

export async function statusIssue(input: StatusInput, root?: string): Promise<Issue> {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  if (input.human && input.agent) throw new DomainError("Choose --human or --agent");
  if (input.human) await closeByHuman(queue, issue, input);
  else await deliverByAgent(queue, issue, input);
  queue.save(issue);
  afterIssueClosed(queue, issue, root); // gatilho de ciclo de vida: cria a Review ao fechar a última Implement
  return issue;
}

export type DecideInput = {
  id: string; human: boolean; status: string; comment: string;
  closed_reason?: string; attachments?: IncomingAttachment[]; now?: Date;
};

// Decisão humana da AWAITING: OPEN rejeita, APPROVED aprova (reentra na fila), CLOSED só abandona
// (concluido recusado). Nenhuma gera Implement CLOSED+concluido: a Review dispara no fechar por agente.
export function decideIssue(input: DecideInput, root?: string): Issue {
  if (!input.human) throw new DomainError("Decide requires --human");
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  if (input.status !== "OPEN" && input.status !== "APPROVED" && input.status !== "CLOSED") throw new DomainError(`Invalid decision: ${input.status} (use OPEN|APPROVED|CLOSED)`);
  const reason = input.closed_reason ? parseClosedReason(input.closed_reason) : undefined;
  const created = persistableAttachments(input.attachments, input.now);
  issue.decide(input.status, input.comment, reason, input.now, created.map(({ entity }) => entity.toJSON()));
  for (const { entity, bytes } of created) queue.artifacts.writeMedia(issue.project, entity, bytes);
  queue.save(issue);
  afterIssueClosed(queue, issue, root); // abandono humano do último Design irmão também re-avalia a reconciliação
  return issue;
}

export function resetClaim(input: { id: string; human: boolean; comment: string; attachments?: IncomingAttachment[]; now?: Date }, root?: string): Issue {
  if (!input.human) throw new DomainError("Reset requires --human");
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  const created = persistableAttachments(input.attachments, input.now);
  issue.reset(input.comment, input.now, created.map(({ entity }) => entity.toJSON()));
  for (const { entity, bytes } of created) queue.artifacts.writeMedia(issue.project, entity, bytes);
  queue.save(issue);
  return issue;
}

// Relaciona Issues (linhagem direcionada): ids devem existir; kind=child (default see-also) grava o par recíproco parent na alvo, tornando a linhagem navegável nos dois sentidos.
// Aresta já existente sobe de kind (see-also → parent/child) nos dois lados; kind igual é no-op silencioso e rebaixar/inverter é erro — a regra vive em Issue.relate.
export function relateIssues(input: { id: string; relates: string[]; kind?: string }, root?: string): Issue {
  const kind = input.kind ? parseRelationKind(input.kind) : "see-also";
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  const ids = [...new Set(input.relates)].filter((id) => id !== issue.id); // dedup: id repetido carregaria a alvo 2x e o 2º save estouraria stale
  const targets = ids.map((id) => queue.loadRequired(id)); // loadRequired em todos: id inexistente é typo
  const changed = issue.relate(ids.map((id) => ({ id, kind }))); // lista vazia (ou só auto-relate) morre aqui
  const dirty = targets.filter((t) => t.relate([{ id: issue.id, kind: inverseKind(kind) }])); // par recíproco; muta antes de salvar para um conflito não deixar meio gravado
  for (const target of dirty) queue.save(target);
  if (changed) queue.save(issue); // salvar sem mudança de revisão seria save stale
  return issue;
}

export type { IncomingAttachment }; // re-export para consumidores atuais (api.ts, cli.ts)

export function attachmentFromFile(path: string): IncomingAttachment {
  const mediaType = mediaTypeForExt(path.slice(path.lastIndexOf(".") + 1).toLowerCase());
  if (!mediaType) throw new Error(`Unsupported attachment extension: ${path}`);
  return { filename: basename(path), mediaType, bytes: readFileSync(path) };
}

export function artifactFromFile(path: string): string {
  return readFileSync(path, "utf8");
}

// Grava/substitui um Artifact doc (não persiste o JSON). Com `name`, grava nomeado; sem, o legado. O --name é trust boundary: barramos travessia de path.
export function setArtifact(input: { issueId: string; content: string; name?: string }, root?: string): void {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  if (issue.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
  DocumentArtifact.validate(input.content);
  const name = input.name === undefined ? undefined : validArtifactName(input.name);
  queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "document", name }, input.content);
}

function validArtifactName(name: string): string {
  if (!name.endsWith(".md") || name.includes("/") || name.includes("..")) {
    throw new DomainError(`Nome de artefato inválido "${name}": use um arquivo .md sem '/' nem '..'`);
  }
  return name;
}

export type CommentInput = {
  issueId: string; comment: string; attachments?: IncomingAttachment[]; actor: string; role?: string; now?: Date;
};

export function addComment(input: CommentInput, root?: string): Issue {
  const actor = parseActor(input.actor);
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const created = persistableAttachments(input.attachments, input.now);
  for (const { entity, bytes } of created) queue.artifacts.writeMedia(issue.project, entity, bytes);
  const role = input.role ? parseRole(input.role) : undefined;
  issue.comment(actor, input.comment, created.map(({ entity }) => entity.toJSON()), input.now, role);
  queue.save(issue);
  return issue;
}

export type TagInput = {
  issueId: string; actor?: string; complexity?: string; human_need?: string; risk?: string;
};

export function updateTags(input: TagInput, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const updates: TagUpdates = { complexity: input.complexity, human_need: input.human_need, risk: input.risk };
  issue.tag(updates, taggingActor(input.actor));
  queue.save(issue);
  return issue;
}

// Tag da Issue é mutação com dono: sem actor não dá para saber se um rebaixamento é permitido.
function taggingActor(actor: string | undefined): Actor {
  if (!actor?.trim()) throw new DomainError("Tag da Issue exige actor: use --agent <ia> ou --human");
  return parseActor(actor);
}

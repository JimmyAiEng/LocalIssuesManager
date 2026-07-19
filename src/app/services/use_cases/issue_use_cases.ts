import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { mediaTypeForExt } from "../../../domain/artifacts/media_artifact.js";
import { DocumentArtifact } from "../../../domain/artifacts/document_artifact.js";
import { DomainError } from "../../../domain/domain_error.js";
import type { ImplementationPlan } from "../../../domain/artifacts/implementation_plan_artifact.js";
import type { Feature } from "../../../domain/artifacts/requirement_artifact.js";
import { Issue, type IssueData, type Phase } from "../../../domain/issue_entity.js";
import { Queue } from "../../../domain/queue_repository.js";
import {
  type ActionType, type Actor, assertBrief, inverseKind, parseActionType, parseActor, parseAgentId, parseClosedReason,
  parseIssueStatus, parseIssueType, parseRelationKind, parseRole, type RelationKind, type Tags, type TagUpdates,
} from "../../../domain/value_objects.js";
import { type IncomingAttachment, persistableAttachments } from "../attachments.js";
import { readPlanForView } from "./plan_use_cases.js";
import { requireProject } from "./project_use_cases.js";
import { designFeatures } from "./requirements_use_cases.js";
import { closeByHuman, deliverByAgent } from "../workflows/index.js";
import { afterIssueClosed } from "../workflows/review_trigger.js";

export type CreateInput = {
  title: string; project: string; type: string; action: string; problem: string;
  acceptance_criteria?: string; actor: string; now?: Date;
  complexity?: string; human_need?: string; risk?: string; artifact?: string;
  relates?: string[]; attachments?: IncomingAttachment[];
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
    acceptance_criteria: input.acceptance_criteria, relates: input.relates,
    attachments: created.map(({ entity }) => entity.toJSON()) }, actor, input.now);
  const tags: TagUpdates = { complexity: input.complexity, human_need: input.human_need, risk: input.risk };
  if (Object.values(tags).some((value) => value !== undefined)) issue.tag(tags, actor); // reusa applyTags (valida enums)
  for (const { entity, bytes } of created) queue.artifacts.writeMedia(issue.project, entity, bytes);
  queue.save(issue);
  if (input.artifact) queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "document" }, input.artifact);
  return issue;
}

// Humano assume uma Issue OPEN pela web (OPEN->CLAIMED); o claim por IA continua via nextIssue.
export function claimIssue(input: { id: string; now?: Date }, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  issue.claim("human", input.now);
  queue.save(issue);
  return issue;
}

export type RelatedView = { id: string; title: string; status: string; action: ActionType; artifact: string | null; kind: RelationKind; plan?: ImplementationPlan | null };
export type IssueView = IssueData & { artifact: string | null; related: RelatedView[]; ancestors: RelatedView[]; features?: Feature[] | null; plan?: ImplementationPlan | null };

export function getIssue(id: string, root?: string): IssueView {
  const queue = new Queue(root);
  return issueView(queue, queue.loadRequired(id));
}

// Trava do `issues get` no CLI: Issue OPEN só chega ao agente pelo claim de `issues next`, que
// entrega junto o contrato da action. Sem ela sobra uma porta lateral — `list` + `get` devolvem a
// Issue inteira sem reivindicar nem mostrar o contrato, e o agente implementa uma Issue que segue
// OPEN para todo mundo (observado no HomeInventory). A web não passa por aqui: no painel humano,
// ver a fila aberta é justamente o ponto.
export function assertNotOpen(id: string, root?: string): void {
  const issue = new Queue(root).loadRequired(id);
  if (issue.status !== "OPEN") return;
  throw new DomainError(`Issue ${id} está OPEN: reivindique com 'issues next --id ${id} --agent <ia>' — o claim entrega o contrato da action. 'issues get' só lê Issue já reivindicada.`);
}

// Injeta o Artefato .md da Issue, a view das relacionadas (com os artefatos delas) e a cadeia
// de ancestrais (subindo os parent): quem reivindica recebe a linhagem sem buscar cada Issue.
export function issueView(queue: Queue, issue: Issue): IssueView {
  return { ...issue.toJSON(), artifact: queue.artifacts.readText(issue.project, { issueId: issue.id, type: "document" }),
    related: issue.relates.flatMap((r) => relatedView(queue, r.id, r.kind)), features: designFeatures(queue, issue),
    ancestors: ancestorChain(queue, issue), plan: readPlanForView(queue, issue.project, issue.id) }; // plan = Small Plan da própria Issue
}

function relatedView(queue: Queue, id: string, kind: RelationKind): RelatedView[] {
  const related = queue.load(id); // relacionada purgada → omitida da view
  if (!related) return [];
  return [{ id: related.id, title: related.title, status: related.status, action: related.action,
    artifact: queue.artifacts.readText(related.project, { issueId: related.id, type: "document" }), kind,
    plan: readPlanForView(queue, related.project, related.id) }]; // plano do Design pai viaja ao filho Implement
}

// Cadeia de ancestrais: sobe pelo primeiro parent de cada nível (Planning→Design→Implement é linear); o guard de visitados corta ciclos.
// ponytail: só o primeiro parent por nível; fan-in com múltiplos parents fica fora da cadeia.
function ancestorChain(queue: Queue, issue: Issue): RelatedView[] {
  const chain: RelatedView[] = [];
  const seen = new Set([issue.id]);
  let current: Issue | null = issue;
  while (current) {
    const parent = current.relates.find((r) => r.kind === "parent" && !seen.has(r.id));
    if (!parent) break;
    seen.add(parent.id);
    const [view] = relatedView(queue, parent.id, "parent");
    if (!view) break; // parent purgado: a cadeia para aqui
    chain.push(view);
    current = queue.load(parent.id);
  }
  return chain;
}

export type IssueSummary = {
  id: string; title: string; project: string; type: string; action: ActionType; status: string;
  owner: string | null; closed_reason: string | null; created_at: string;
  status_changed_at: string; phases: Phase[]; tags: Tags; relates: string[];
};

export function listIssues(filter: { status?: string; project?: string; title?: string; type?: string }, root?: string): IssueSummary[] {
  const status = filter.status ? parseIssueStatus(filter.status) : undefined;
  const type = filter.type ? parseIssueType(filter.type) : undefined;
  return new Queue(root).list({ ...filter, status, type }).map(summary);
}

function summary(issue: Issue): IssueSummary {
  return { id: issue.id, title: issue.title, project: issue.project, type: issue.type,
    action: issue.action, status: issue.status, owner: issue.owner, closed_reason: issue.closed_reason,
    created_at: issue.created_at, status_changed_at: issue.status_changed_at,
    phases: structuredClone(issue.phases), tags: structuredClone(issue.tags),
    relates: issue.relates.map((r) => r.id) }; // o quadro só precisa dos ids das relacionadas
}

// Fila: a Issue OPEN mais antiga do projeto (ou uma específica por id) é reivindicada pela IA.
export function nextIssue(input: { agent: string; project?: string; id?: string; now?: Date }, root?: string): IssueView | null {
  const agent = parseAgentId(input.agent);
  const queue = new Queue(root);
  if (!input.id && !input.project?.trim()) throw new Error("project is required");
  const issue = input.id ? queue.loadRequired(input.id) : queue.oldestOpen(input.project);
  if (!issue) return null;
  issue.claim(agent, input.now);
  queue.save(issue);
  return issueView(queue, issue);
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

export function decideIssue(input: DecideInput, root?: string): Issue {
  if (!input.human) throw new DomainError("Decide requires --human");
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  if (input.status !== "OPEN" && input.status !== "CLOSED") throw new DomainError("Invalid decision");
  const reason = input.closed_reason ? parseClosedReason(input.closed_reason) : undefined;
  const created = persistableAttachments(input.attachments, input.now);
  issue.decide(input.status, input.comment, reason, input.now, created.map(({ entity }) => entity.toJSON()));
  for (const { entity, bytes } of created) queue.artifacts.writeMedia(issue.project, entity, bytes);
  queue.save(issue);
  afterIssueClosed(queue, issue, root); // decide humano da web também fecha Implement e dispara a Review
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

// Relaciona Issues (linhagem direcionada): os ids precisam existir; a relação dá acesso aos
// artefatos. Com kind=child (default see-also), grava o par recíproco parent na Issue alvo,
// tornando a linhagem navegável nos dois sentidos.
export function relateIssues(input: { id: string; relates: string[]; kind?: string }, root?: string): Issue {
  const kind = input.kind ? parseRelationKind(input.kind) : "see-also";
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  const targets = input.relates.map((id) => queue.loadRequired(id));
  issue.relate(input.relates.map((id) => ({ id, kind })));
  for (const target of targets) {
    target.relate([{ id: issue.id, kind: inverseKind(kind) }]); // par recíproco na alvo
    queue.save(target);
  }
  queue.save(issue);
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

// Grava/substitui um Artifact doc da Issue; não persiste o JSON da Issue. Com `name`, grava um
// documento nomeado (intent.md, evidence-*.md); sem, o artefato legado. O nome vem do --name da CLI,
// então é trust boundary: o store faz `join`, aqui barramos travessia de path.
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

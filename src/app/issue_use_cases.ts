import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { mediaTypeForExt } from "../domain/attachment_entity.js";
import { type IncomingAttachment, persistableAttachments } from "./attachments.js";
import { DomainError } from "../domain/domain_error.js";
import { Issue, type IssueData, type Phase } from "../domain/issue_entity.js";
import { Queue, type TicketTarget } from "../domain/queue_repository.js";
import type { Ticket, TicketData } from "../domain/ticket_entity.js";
import { type TicketView, ticketView } from "./ticket_use_cases.js";
import {
  type Actor, type AgentId, parseActor, parseAgentId, parseClosedReason, parseIssueStatus, parseIssueType,
  type Tags, type TagUpdates, type TicketStatus, type TicketType,
} from "../domain/value_objects.js";

export type CreateInput = {
  title: string; project: string; type: string; problem: string;
  artifacts?: string; acceptance_criteria?: string; actor: string; now?: Date;
  complexity?: string; human_need?: string; risk?: string; artifact?: string;
  attachments?: IncomingAttachment[];
};

export function createIssue(input: CreateInput, root?: string): Issue {
  const actor = parseActor(input.actor);
  const created = persistableAttachments(input.attachments, input.now); // valida antes de criar a Issue
  const issue = Issue.create({ title: input.title, project: input.project,
    type: parseIssueType(input.type), problem: input.problem, artifacts: input.artifacts,
    acceptance_criteria: input.acceptance_criteria, attachments: created.map(({ entity }) => entity.toJSON()) },
    actor, input.now);
  const tags: TagUpdates = { complexity: input.complexity, human_need: input.human_need, risk: input.risk };
  if (Object.values(tags).some((value) => value !== undefined)) issue.tag(tags, actor); // reusa applyTags (valida enums)
  const queue = new Queue(root);
  for (const { entity, bytes } of created) queue.writeAttachment(issue.project, entity, bytes);
  queue.save(issue);
  if (input.artifact) queue.writeArtifact(issue.project, issue.id, input.artifact);
  return issue;
}

// Humano assume uma Issue OPEN pela web (OPEN->CLAIMED) para poder criar Tickets.
// Espelha o claim de Ticket por humano; o claim por IA continua via nextIssue.
export function claimIssue(input: { id: string; now?: Date }, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  issue.claim("human", input.now);
  queue.save(issue);
  return issue;
}

export type IssueView = Omit<IssueData, "tickets"> & {
  artifact: string | null;
  tickets: (TicketData & { artifact: string | null })[];
};

export function getIssue(id: string, root?: string): IssueView {
  const queue = new Queue(root);
  return issueView(queue, queue.loadRequired(id));
}

// Injeta o Artefato .md da Issue e de cada Ticket na view (leituras locais, custo desprezível).
function issueView(queue: Queue, issue: Issue): IssueView {
  const { tickets, ...data } = issue.toJSON();
  return { ...data, artifact: queue.readArtifact(issue.project, issue.id),
    tickets: tickets.map((ticket) => ({ ...ticket, artifact: queue.readArtifact(issue.project, ticket.id) })) };
}

// Decora issue (sempre com artifact) e ticket (com artifact + issue_artifact) para o retorno de next.
function nextView(queue: Queue, issue: Issue, ticket: Ticket | null): NextResult {
  return { issue: issueView(queue, issue), ticket: ticket ? ticketView(queue, issue, ticket) : null };
}

export type IssueSummary = {
  id: string; title: string; project: string; type: string; status: string;
  owner: string | null; closed_reason: string | null; created_at: string;
  status_changed_at: string; phases: Phase[]; tags: Tags;
  tickets: { id: string; type: TicketType; status: TicketStatus; owner: Actor | null }[];
};

export function listIssues(filter: { status?: string; project?: string; title?: string; type?: string }, root?: string): IssueSummary[] {
  const status = filter.status ? parseIssueStatus(filter.status) : undefined;
  const type = filter.type ? parseIssueType(filter.type) : undefined;
  return new Queue(root).list({ ...filter, status, type }).map(summary);
}

function summary(issue: Issue): IssueSummary {
  return { id: issue.id, title: issue.title, project: issue.project, type: issue.type,
    status: issue.status, owner: issue.owner, closed_reason: issue.closed_reason,
    created_at: issue.created_at, status_changed_at: issue.status_changed_at,
    phases: structuredClone(issue.phases), tags: structuredClone(issue.tags),
    tickets: issue.tickets.map((t) => ({ id: t.id, type: t.type, status: t.status, owner: t.owner })) };
}

export type NextResult = { issue: IssueView; ticket: TicketView | null };

export function nextIssue(input: { agent: string; project?: string; id?: string; now?: Date }, root?: string): NextResult | null {
  const agent = parseAgentId(input.agent);
  const queue = new Queue(root);
  if (input.id) return claimSpecific(queue, input.id, agent, input.now);
  if (!input.project?.trim()) throw new Error("project is required");
  const target = queue.oldestOpenTicket(input.project);
  if (target) return claimTargetTicket(queue, target, agent, input.now);
  const issue = queue.oldestOpen(input.project);
  if (!issue) return null;
  issue.claim(agent, input.now);
  queue.save(issue);
  return nextView(queue, issue, null);
}

function claimSpecific(queue: Queue, id: string, agent: AgentId, now?: Date): NextResult {
  const issue = queue.loadRequired(id);
  const ready = issue.readyTickets()[0];
  if (ready) {
    issue.claimTicket(ready.id, agent, now);
    queue.save(issue);
    return nextView(queue, issue, issue.ticket(ready.id));
  }
  if (issue.status === "OPEN") {
    issue.claim(agent, now);
    queue.save(issue);
    return nextView(queue, issue, null);
  }
  throw new DomainError(`Issue ${id} não tem trabalho reivindicável`);
}

function claimTargetTicket(queue: Queue, target: TicketTarget, agent: AgentId, now?: Date): NextResult {
  target.issue.claimTicket(target.ticket.id, agent, now);
  queue.save(target.issue);
  return nextView(queue, target.issue, target.issue.ticket(target.ticket.id));
}

export type StatusInput = {
  id: string; agent?: string; human?: boolean; status: string; comment: string;
  closed_reason?: string; now?: Date;
};

export function statusIssue(input: StatusInput, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  if (input.human && input.agent) throw new DomainError("Choose --human or --agent");
  if (input.human) closeByHuman(issue, input);
  else transitionByAgent(issue, input);
  queue.save(issue);
  return issue;
}

function transitionByAgent(issue: Issue, input: StatusInput): void {
  const agent = parseAgentId(input.agent ?? "");
  if (input.status === "CLOSED" && input.closed_reason) {
    issue.closeByAgent(agent, input.comment, parseClosedReason(input.closed_reason), input.now);
  } else throw new DomainError("IA status supports CLOSED with reason");
}

function closeByHuman(issue: Issue, input: StatusInput): void {
  if (input.status !== "CLOSED" || !input.closed_reason) {
    throw new DomainError("Human status supports CLOSED with reason");
  }
  issue.closeByHuman(input.comment, parseClosedReason(input.closed_reason), input.now);
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
  for (const { entity, bytes } of created) queue.writeAttachment(issue.project, entity, bytes);
  queue.save(issue);
  return issue;
}

export function resetClaim(input: { id: string; human: boolean; comment: string; attachments?: IncomingAttachment[]; now?: Date }, root?: string): Issue {
  if (!input.human) throw new DomainError("Reset requires --human");
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.id);
  const created = persistableAttachments(input.attachments, input.now);
  issue.reset(input.comment, input.now, created.map(({ entity }) => entity.toJSON()));
  for (const { entity, bytes } of created) queue.writeAttachment(issue.project, entity, bytes);
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

export type SetArtifactInput = { issueId: string; ticketId?: string; content: string };

// Grava/substitui o Artefato .md da Issue (ou do Ticket, se ticketId). Guard CLOSED em artifactOwnerId;
// não persiste o JSON (não há campo), logo não chama queue.save().
export function setArtifact(input: SetArtifactInput, root?: string): void {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const ownerId = issue.artifactOwnerId(input.ticketId);
  queue.writeArtifact(issue.project, ownerId, input.content);
}

export type CommentInput = {
  issueId: string; ticketId?: string; comment: string;
  attachments?: IncomingAttachment[]; actor: string; now?: Date;
};

export function addComment(input: CommentInput, root?: string): Issue {
  const actor = parseActor(input.actor);
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const created = persistableAttachments(input.attachments, input.now);
  for (const { entity, bytes } of created) queue.writeAttachment(issue.project, entity, bytes);
  const attachments = created.map(({ entity }) => entity.toJSON());
  if (input.ticketId) issue.commentTicket(input.ticketId, actor, input.comment, attachments, input.now);
  else issue.comment(actor, input.comment, attachments, input.now);
  queue.save(issue);
  return issue;
}

export type TagInput = {
  issueId: string; ticketId?: string; actor?: string;
  complexity?: string; human_need?: string; risk?: string;
};

export function updateTags(input: TagInput, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const updates: TagUpdates = { complexity: input.complexity, human_need: input.human_need, risk: input.risk };
  if (input.ticketId) issue.tagTicket(input.ticketId, updates);
  else issue.tag(updates, taggingActor(input.actor));
  queue.save(issue);
  return issue;
}

// Tag da Issue é mutação com dono: sem actor não dá para saber se um rebaixamento é permitido.
// (tagTicket não precisa: rejeita human_need e não alimenta a autonomia derivada.)
function taggingActor(actor: string | undefined): Actor {
  if (!actor?.trim()) throw new DomainError("Tag da Issue exige actor: use --agent <ia> ou --human");
  return parseActor(actor);
}

export type WorktreeInput = { issueId: string; path?: string; cwd?: string };

// Cria (ou devolve) a worktree da Issue. Idempotente: se já houver worktree, devolve sem tocar no git.
export function addWorktree(input: WorktreeInput, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  if (issue.worktree) return issue;
  const cwd = input.cwd ?? process.cwd();
  const path = resolve(cwd, input.path ?? join(".worktrees", issue.id));
  const branch = `issue/${issue.id.slice(0, 8)}`;
  git(cwd, ["worktree", "add", path, "-b", branch]);
  issue.setWorktree({ path, branch });
  queue.save(issue);
  return issue;
}

// Remove a worktree e limpa o campo. Idempotente: sem worktree, não faz nada.
export function removeWorktree(input: WorktreeInput, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  if (!issue.worktree) return issue;
  git(input.cwd ?? process.cwd(), ["worktree", "remove", issue.worktree.path, "--force"]);
  issue.clearWorktree();
  queue.save(issue);
  return issue;
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new DomainError(`git ${args.join(" ")} falhou: ${result.stderr?.trim() || result.error?.message || "erro"}`);
  }
}

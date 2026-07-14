import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ClaimIssueUseCase } from "../app/claim_issue_use_case.js";
import { ClaimTicketUseCase } from "../app/claim_ticket_use_case.js";
import { CommentUseCase, type IncomingAttachment } from "../app/comment_use_case.js";
import { CreateIssueUseCase } from "../app/create_issue_use_case.js";
import { CreateTicketUseCase } from "../app/create_ticket_use_case.js";
import { DecideIssueUseCase } from "../app/decide_issue_use_case.js";
import { DecideTicketUseCase } from "../app/decide_ticket_use_case.js";
import { GetIssueUseCase } from "../app/get_issue_use_case.js";
import { ListIssuesUseCase } from "../app/list_issues_use_case.js";
import { ResetClaimUseCase } from "../app/reset_claim_use_case.js";
import { StatusIssueUseCase } from "../app/status_issue_use_case.js";
import { StatusTicketUseCase } from "../app/status_ticket_use_case.js";
import { TagUseCase } from "../app/tag_use_case.js";
import { Queue } from "../domain/queue_repository.js";

type Body = Record<string, unknown>;

// ponytail: base64-no-corpo (sem parser multipart). Teto generoso p/ nao estourar memoria; o dominio ainda valida 25MB/anexo.
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class RequestError extends Error {}

export type ApiHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

export function createApiHandler(root?: string): ApiHandler {
  return async (request, response) => {
    if (!request.url?.startsWith("/api/")) return false;
    try { await dispatch(request, response, root); } catch (error) { respondError(response, error); }
    return true;
  };
}

async function dispatch(request: IncomingMessage, response: ServerResponse, root?: string): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname.startsWith("/api/attachments/")) {
    return serveAttachment(response, decodeURIComponent(url.pathname.slice("/api/attachments/".length)), root);
  }
  const route = routeParts(url.pathname);
  if (request.method === "GET" && route.length === 0) return list(response, url, root);
  if (request.method === "GET" && route.length === 1) return get(response, route[0], root);
  const body = await readBody(request);
  if (request.method !== "POST") return respond(response, 404, { error: "Not found" });
  if (route.length === 0) return create(response, body, root);
  if (route.length === 2 && route[1] === "comment") return comment(response, route[0], undefined, body, root);
  if (route.length === 2 && route[1] === "tags") return tag(response, route[0], undefined, body, root);
  if (route.length === 2 && route[1] === "tickets") return createTicket(response, route[0], body, root);
  if (route.length === 4 && route[1] === "tickets") return ticketAction(response, route, body, root);
  return issueAction(response, route, body, root);
}

function issueAction(response: ServerResponse, route: string[], body: Body, root?: string): void {
  if (route[1] === "claim") return claimIssue(response, route[0], root);
  if (route[1] === "close") return close(response, route[0], body, root);
  if (route[1] === "decision") return decide(response, route[0], body, root);
  if (route[1] === "reset") return reset(response, route[0], body, root);
  respond(response, 404, { error: "Not found" });
}

function list(response: ServerResponse, url: URL, root?: string): void {
  const query = url.searchParams;
  const issues = new ListIssuesUseCase(root).execute({ status: query.get("status") ?? undefined,
    project: query.get("project") ?? undefined, title: query.get("title") ?? undefined, type: query.get("type") ?? undefined,
    limit: numberValue(query.get("limit")), offset: numberValue(query.get("offset")) });
  respond(response, 200, issues);
}

function get(response: ServerResponse, id: string, root?: string): void {
  respond(response, 200, new GetIssueUseCase(root).execute(id).toJSON());
}

function create(response: ServerResponse, body: Body, root?: string): void {
  const issue = new CreateIssueUseCase(root).execute({ title: text(body, "title"), project: text(body, "project"),
    type: text(body, "type"), problem: text(body, "problem"), artifacts: optionalText(body, "artifacts") ?? "",
    acceptance_criteria: optionalText(body, "acceptance_criteria") ?? "", actor: "human",
    complexity: optionalText(body, "complexity"), human_need: optionalText(body, "human_need"), risk: optionalText(body, "risk") });
  respond(response, 201, issue.toJSON());
}

function createTicket(response: ServerResponse, id: string, body: Body, root?: string): void {
  const issue = new CreateTicketUseCase(root).execute({ issueId: id, type: text(body, "type"),
    objective: text(body, "objective"), task: text(body, "task"), acceptance_criteria: text(body, "acceptance_criteria"),
    artifacts: optionalText(body, "artifacts"), references: optionalText(body, "references"),
    human_need: optionalText(body, "human_need"), actor: "human" });
  respond(response, 201, issue.toJSON());
}

function claimIssue(response: ServerResponse, id: string, root?: string): void {
  const issue = new ClaimIssueUseCase(root).execute({ id });
  respond(response, 200, issue.toJSON());
}

function ticketAction(response: ServerResponse, route: string[], body: Body, root?: string): void {
  if (route[3] === "claim") return claimTicket(response, route[0], route[2], root);
  if (route[3] === "status") return statusTicket(response, route[0], route[2], body, root);
  if (route[3] === "decision") return decideTicket(response, route[0], route[2], body, root);
  if (route[3] === "comment") return comment(response, route[0], route[2], body, root);
  if (route[3] === "tags") return tag(response, route[0], route[2], body, root);
  respond(response, 404, { error: "Not found" });
}

function tag(response: ServerResponse, id: string, ticketId: string | undefined, body: Body, root?: string): void {
  const issue = new TagUseCase(root).execute({ issueId: id, ticketId,
    complexity: optionalText(body, "complexity"), human_need: optionalText(body, "human_need"), risk: optionalText(body, "risk") });
  respond(response, 200, issue.toJSON());
}

function comment(response: ServerResponse, id: string, ticketId: string | undefined, body: Body, root?: string): void {
  const issue = new CommentUseCase(root).execute({ issueId: id, ticketId,
    comment: text(body, "comment"), attachments: decodeAttachments(body), actor: "human" });
  respond(response, 201, issue.toJSON());
}

function decodeAttachments(body: Body): IncomingAttachment[] {
  const raw = body.attachments;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new RequestError("Invalid attachments");
  return raw.map((item) => {
    const attachment = item as Record<string, unknown>;
    if (!item || typeof attachment.filename !== "string" || typeof attachment.mediaType !== "string" || typeof attachment.data !== "string") {
      throw new RequestError("Invalid attachment");
    }
    return { filename: attachment.filename, mediaType: attachment.mediaType, bytes: Buffer.from(attachment.data, "base64") };
  });
}

function serveAttachment(response: ServerResponse, id: string, root?: string): void {
  if (!UUID.test(id)) return respond(response, 404, { error: "Not found" });
  const found = new Queue(root).findAttachment(id);
  if (!found) return respond(response, 404, { error: "Not found" });
  const bytes = readFileSync(found.path);
  response.writeHead(200, { "content-type": found.mediaType, "content-length": bytes.length });
  response.end(bytes);
}

function claimTicket(response: ServerResponse, id: string, tid: string, root?: string): void {
  const issue = new ClaimTicketUseCase(root).execute({ issueId: id, ticketId: tid, actor: "human" });
  respond(response, 200, issue.toJSON());
}

function statusTicket(response: ServerResponse, id: string, tid: string, body: Body, root?: string): void {
  const issue = new StatusTicketUseCase(root).execute({ issueId: id, ticketId: tid, actor: "human",
    status: text(body, "status"), comment: text(body, "comment"), closed_reason: optionalText(body, "closed_reason") });
  respond(response, 200, issue.toJSON());
}

function decideTicket(response: ServerResponse, id: string, tid: string, body: Body, root?: string): void {
  const issue = new DecideTicketUseCase(root).execute({ issueId: id, ticketId: tid, human: true,
    status: text(body, "status"), comment: text(body, "comment"), closed_reason: optionalText(body, "closed_reason") });
  respond(response, 200, issue.toJSON());
}

function close(response: ServerResponse, id: string, body: Body, root?: string): void {
  const issue = new StatusIssueUseCase(root).execute({ id, human: true, status: "CLOSED",
    comment: text(body, "comment"), closed_reason: text(body, "closed_reason") });
  respond(response, 200, issue.toJSON());
}

function decide(response: ServerResponse, id: string, body: Body, root?: string): void {
  const issue = new DecideIssueUseCase(root).execute({ id, human: true, status: text(body, "status"),
    comment: text(body, "comment"), closed_reason: optionalText(body, "closed_reason") });
  respond(response, 200, issue.toJSON());
}

function reset(response: ServerResponse, id: string, body: Body, root?: string): void {
  const issue = new ResetClaimUseCase(root).execute({ id, human: true, comment: text(body, "comment") });
  respond(response, 200, issue.toJSON());
}

function routeParts(pathname: string): string[] {
  if (pathname !== "/api/issues" && !pathname.startsWith("/api/issues/")) return ["__missing"];
  return pathname.slice("/api/issues".length).split("/").filter(Boolean).map(decodeURIComponent);
}

async function readBody(request: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new RequestError("Request body too large");
    chunks.push(Buffer.from(chunk));
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { throw new RequestError("Invalid JSON body"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("Invalid JSON body");
  return value as Body;
}

function text(body: Body, name: string): string {
  const value = body[name];
  if (typeof value !== "string") throw new RequestError(`Invalid ${name}`);
  return value;
}

function optionalText(body: Body, name: string): string | undefined {
  const value = body[name];
  if (value === undefined) return undefined;
  return text(body, name);
}

function numberValue(value: string | null): number | undefined {
  if (value === null) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new RequestError("Invalid pagination");
  return number;
}

function respond(response: ServerResponse, status: number, value: object | object[]): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

function respondError(response: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = errorStatus(error, message);
  respond(response, status, { error: status === 500 ? "Internal server error" : message });
}

function errorStatus(error: unknown, message: string): number {
  if (message.startsWith("Stale Issue save")) return 409;
  if (message.startsWith("Issue not found")) return 404;
  if (error instanceof RequestError || error instanceof Error && error.name === "DomainError") return 400;
  return 500;
}

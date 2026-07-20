import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { deleteIssue } from "../app/services/use_cases/deletion_use_cases.js";
import { getDesignPackage } from "../app/services/use_cases/design_use_cases.js";
import {
  addComment, claimIssue as claimIssueCase, createIssue, decideIssue, getIssue, type IncomingAttachment,
  listIssues, resetClaim, statusIssue, updateTags,
} from "../app/services/use_cases/issue_use_cases.js";
import { createProject, listProjects } from "../app/services/use_cases/project_use_cases.js";
import { renderSvg, sourceHash } from "../app/services/uml-validation/plantuml_check.js";
import { getRequirements } from "../app/services/use_cases/requirements_use_cases.js";
import { DESIGN_KINDS, DesignGateError } from "../domain/gates/design_gate.js";
import { ConflictError, DomainError, NotFoundError } from "../domain/domain_error.js";
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
  if (url.pathname === "/api/projects") return projectAction(request, response, root);
  const route = routeParts(url.pathname);
  // Trava de travessia: o id vem cru da URL e vira caminho em disco lá no Queue#findPath (`${id}.json`).
  // Guarda única no funil por onde TODA rota de Issue passa — /delete e irmãs — em vez de remendo por rota.
  // O UUID já barra `/`, `\`, `..` e o que vier de percent-encoding (o decode acontece antes, no routeParts).
  if (route.length > 0 && !UUID.test(route[0])) return respond(response, 404, { error: "Not found" });
  if (request.method === "GET") return getAction(request, response, url, route, root);
  const body = await readBody(request);
  if (request.method !== "POST") return respond(response, 404, { error: "Not found" });
  if (route.length === 0) return create(response, body, root);
  return issueAction(response, route, body, root);
}

// Rotas de leitura. GET sem match cai no 404.
async function getAction(
  request: IncomingMessage, response: ServerResponse, url: URL, route: string[], root?: string,
): Promise<void> {
  if (route.length === 0) return list(response, url, root);
  if (route.length === 1) return get(response, route[0], root);
  if (route.length === 2 && route[1] === "requirements") {
    return respond(response, 200, getRequirements({ issueId: route[0] }, root));
  }
  if (route.length === 2 && route[1] === "design") {
    return respond(response, 200, await getDesignPackage({ issueId: route[0] }, root));
  }
  if (route.length === 2 && route[1] === "documents") return serveDocuments(response, route[0], root);
  if (route.length === 3 && route[1] === "design") return serveDiagram(request, response, route, root);
  respond(response, 404, { error: "Not found" });
}

function issueAction(response: ServerResponse, route: string[], body: Body, root?: string): void | Promise<void> {
  if (route[1] === "claim") return claimIssue(response, route[0], root);
  if (route[1] === "close") return close(response, route[0], body, root);
  if (route[1] === "decision") return decide(response, route[0], body, root);
  if (route[1] === "reset") return reset(response, route[0], body, root);
  if (route[1] === "comment") return comment(response, route[0], body, root);
  if (route[1] === "tags") return tag(response, route[0], body, root);
  // Remoção definitiva: o use case é quem trava (raiz e árvore de relates toda CLOSED) e o
  // DomainError vira 400 no respondError.
  if (route[1] === "delete") return respond(response, 200, deleteIssue({ issueId: route[0] }, root));
  respond(response, 404, { error: "Not found" });
}

// Projetos: sem isso o painel não se sustenta sozinho — Issue só nasce em projeto registrado, e
// registrar era exclusivo do CLI. Nome e repo exigidos; concern opcional (createProject valida o enum
// e faz default LOW quando ausente).
async function projectAction(request: IncomingMessage, response: ServerResponse, root?: string): Promise<void> {
  if (request.method === "GET") return respond(response, 200, listProjects(root));
  if (request.method !== "POST") return respond(response, 404, { error: "Not found" });
  const body = await readBody(request);
  const project = createProject({ name: text(body, "name"), repo: text(body, "repo"), concern: optionalText(body, "concern") }, root);
  respond(response, 201, project);
}

function list(response: ServerResponse, url: URL, root?: string): void {
  const query = url.searchParams;
  const issues = listIssues({ status: query.get("status") ?? undefined,
    project: query.get("project") ?? undefined, title: query.get("title") ?? undefined,
    type: query.get("type") ?? undefined }, root);
  respond(response, 200, issues);
}

function get(response: ServerResponse, id: string, root?: string): void {
  respond(response, 200, getIssue(id, root)); // IssueView (com artefato e relacionadas)
}

function create(response: ServerResponse, body: Body, root?: string): void {
  const issue = createIssue({ title: text(body, "title"), project: text(body, "project"),
    type: text(body, "type"), action: text(body, "action"), problem: text(body, "problem"),
    acceptance_criteria: optionalText(body, "acceptance_criteria") ?? "", actor: "human",
    complexity: optionalText(body, "complexity"), human_need: optionalText(body, "human_need"), risk: optionalText(body, "risk"),
    attachments: decodeAttachments(body) }, root);
  respond(response, 201, issue.toJSON());
}

function claimIssue(response: ServerResponse, id: string, root?: string): void {
  respond(response, 200, claimIssueCase({ id }, root).toJSON());
}

function tag(response: ServerResponse, id: string, body: Body, root?: string): void {
  // actor "human" como todas as mutações desta API: o painel web é o teclado do humano.
  const issue = updateTags({ issueId: id, actor: "human",
    complexity: optionalText(body, "complexity"), human_need: optionalText(body, "human_need"), risk: optionalText(body, "risk") }, root);
  respond(response, 200, issue.toJSON());
}

function comment(response: ServerResponse, id: string, body: Body, root?: string): void {
  const issue = addComment({ issueId: id,
    comment: text(body, "comment"), attachments: decodeAttachments(body), actor: "human" }, root);
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

// SVG de um diagrama da Issue de Design. Servido como recurso próprio para o client
// embutir via <img> (que não executa script no SVG) em vez de injetar no innerHTML.
// ETag = hash do fonte: o browser revalida barato e o diagrama não pisca a cada poll.
async function serveDiagram(request: IncomingMessage, response: ServerResponse, route: string[], root?: string): Promise<void> {
  const [issueId, , file] = route;
  const kind = file.endsWith(".svg") ? file.slice(0, -".svg".length) : "";
  if (!(DESIGN_KINDS as readonly string[]).includes(kind)) return respond(response, 404, { error: "Not found" });
  const queue = new Queue(root);
  const issue = queue.loadRequired(issueId); // inexistente → 404 de domínio
  const source = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "uml", name: `${kind}.puml` });
  if (source === null) return respond(response, 404, { error: `Diagrama ${kind}.puml não entregue na Issue ${issue.id}` });
  const etag = `"${sourceHash(source)}"`;
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, { etag, "cache-control": "no-cache" });
    return void response.end();
  }
  const svg = Buffer.from(await renderSvg(source));
  response.writeHead(200, { "content-type": "image/svg+xml", "content-length": svg.length, etag, "cache-control": "no-cache" });
  response.end(svg);
}

// Documentos da Issue para o painel: os nomeados (intent.md, evidence-*.md) e o legado.
// list() devolve o legado como "artifact.md"; a assimetria está na leitura — o legado sai sem
// name (artifacts/<id>.md), os nomeados com name (artifacts/<id>/<name>). O client mostra os
// nomeados no detalhe; o legado continua na seção Artefato (issue.artifact).
function serveDocuments(response: ServerResponse, id: string, root?: string): void {
  const queue = new Queue(root);
  const issue = queue.loadRequired(id);
  const documents = queue.artifacts.list(issue.project, issue.id, "document").map((name) => ({
    name,
    markdown: queue.artifacts.readText(issue.project,
      { issueId: issue.id, type: "document", name: name === "artifact.md" ? undefined : name }),
  }));
  respond(response, 200, documents);
}

function serveAttachment(response: ServerResponse, id: string, root?: string): void {
  if (!UUID.test(id)) return respond(response, 404, { error: "Not found" });
  const found = new Queue(root).artifacts.findMedia(id);
  if (!found) return respond(response, 404, { error: "Not found" });
  const bytes = readFileSync(found.path);
  response.writeHead(200, { "content-type": found.mediaType, "content-length": bytes.length });
  response.end(bytes);
}

async function close(response: ServerResponse, id: string, body: Body, root?: string): Promise<void> {
  const issue = await statusIssue({ id, human: true, status: "CLOSED",
    comment: text(body, "comment"), closed_reason: text(body, "closed_reason") }, root);
  respond(response, 200, issue.toJSON());
}

function decide(response: ServerResponse, id: string, body: Body, root?: string): void {
  const status = text(body, "status");
  const closedReason = optionalText(body, "closed_reason");
  // ponytail: ponte até a fatia 4 trocar o botão. O painel ainda posta "aprovar" como decide
  // CLOSED+concluido; o modelo novo aprova para APPROVED. Mapeia aqui p/ não quebrar a web viva.
  const approve = status === "CLOSED" && closedReason === "concluido";
  const issue = decideIssue({ id, human: true, status: approve ? "APPROVED" : status,
    comment: text(body, "comment"), closed_reason: approve ? undefined : closedReason,
    attachments: decodeAttachments(body) }, root);
  respond(response, 200, issue.toJSON());
}

function reset(response: ServerResponse, id: string, body: Body, root?: string): void {
  const issue = resetClaim({ id, human: true, comment: text(body, "comment"), attachments: decodeAttachments(body) }, root);
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

function respond(response: ServerResponse, status: number, value: object | object[]): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

function respondError(response: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = errorStatus(error);
  // DesignGateError (DomainError → 400) mantém o payload estruturado do gate no corpo.
  if (error instanceof DesignGateError) return respond(response, status, { error: message, errors: error.errors });
  respond(response, status, { error: status === 500 ? "Internal server error" : message });
}

function errorStatus(error: unknown): number {
  if (error instanceof ConflictError) return 409;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof RequestError || error instanceof DomainError) return 400;
  return 500;
}

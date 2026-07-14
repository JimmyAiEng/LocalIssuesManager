import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ClaimTicketUseCase } from "../../src/app/claim_ticket_use_case.js";
import { NextIssueUseCase } from "../../src/app/next_issue_use_case.js";
import { StatusIssueUseCase } from "../../src/app/status_issue_use_case.js";
import { StatusTicketUseCase } from "../../src/app/status_ticket_use_case.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

const input = { title: "Web issue", project: "web", type: "Fix", problem: "p" };
const ticketInput = { type: "Implement", objective: "o", task: "t", acceptance_criteria: "c" };

test("API cria, lista por tipo, lê e fecha pela camada app", async () => withWeb(async (url) => {
  const created = await request(url, "POST", "/api/issues", input);
  assert.equal(created.status, 201);
  assert.equal(created.body.human_presence, true);
  assert.equal(created.body.type, "Fix");
  assert.equal((await request(url, "GET", "/api/issues?type=Fix")).body.length, 1);
  assert.equal((await request(url, "GET", "/api/issues?type=Feat")).body.length, 0);
  assert.equal((await request(url, "GET", `/api/issues/${created.body.id}`)).body.id, created.body.id);
  const closed = await request(url, "POST", `/api/issues/${created.body.id}/close`, { comment: "feito", closed_reason: "concluido" });
  assert.equal(closed.body.status, "CLOSED");
}));

test("API cria Ticket (Issue vira ON-GOING), transiciona status e decide", async () => withWeb(async (url, root) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  new NextIssueUseCase(root).execute({ agent: "pi" });
  const ticketRes = await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput);
  assert.equal(ticketRes.status, 201);
  assert.equal(ticketRes.body.status, "ON-GOING");
  const tickets = ticketRes.body.tickets as { id: string; status: string }[];
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].status, "OPEN");
  const tid = tickets[0].id;
  new ClaimTicketUseCase(root).execute({ issueId: id, ticketId: tid, actor: "human" });
  const statusRes = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/status`, { status: "AWAITING", comment: "revisar" });
  assert.equal(statusRes.status, 200);
  assert.equal(ticketOf(statusRes.body, tid).status, "AWAITING");
  const decideRes = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/decision`, { status: "CLOSED", comment: "ok", closed_reason: "concluido" });
  assert.equal(decideRes.status, 200);
  assert.equal(ticketOf(decideRes.body, tid).status, "CLOSED");
}));

test("API deixa o Humano assumir um Ticket OPEN e então fechá-lo pela web", async () => withWeb(async (url, root) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  new NextIssueUseCase(root).execute({ agent: "pi" });
  const tid = ((await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput)).body.tickets as { id: string }[])[0].id;
  const claimed = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/claim`, {});
  assert.equal(claimed.status, 200);
  const claimedTicket = (claimed.body.tickets as { id: string; status: string; owner: string }[]).find((t) => t.id === tid)!;
  assert.equal(claimedTicket.status, "CLAIMED");
  assert.equal(claimedTicket.owner, "human");
  const closed = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/status`, { status: "CLOSED", comment: "cancelado", closed_reason: "obsoleto" });
  assert.equal(closed.status, 200);
  assert.equal(ticketOf(closed.body, tid).status, "CLOSED");
}));

test("API rejeita criar Ticket em Issue não reivindicada", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const result = await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput);
  assert.equal(result.status, 400);
}));

test("API decide e reseta transições humanas", async () => withWeb(async (url, root) => {
  const awaiting = await createAwaiting(url, root);
  const decided = await request(url, "POST", `/api/issues/${awaiting}/decision`, { status: "OPEN", comment: "corrigir" });
  assert.equal(decided.body.status, "OPEN");
  await request(url, "POST", "/api/issues", input);
  const claimed = new NextIssueUseCase(root).execute({ agent: "pi" })!.issue.id;
  const reset = await request(url, "POST", `/api/issues/${claimed}/reset`, { comment: "liberar" });
  assert.equal(reset.body.owner, null);
}));

test("API devolve 4xx para regra inválida e não vaza detalhe interno", async () => withWeb(async (url) => {
  const result = await request(url, "POST", "/api/issues", { ...input, type: "invalid" });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /type|Tipo/i);
}));

test("API comenta com anexo (Issue e Ticket), persiste e serve a mídia", async () => withWeb(async (url, root) => {
  const bytes = Buffer.from([137, 80, 78, 71, 1, 2, 3]);
  const data = bytes.toString("base64");
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;

  const commented = await request(url, "POST", `/api/issues/${id}/comment`,
    { comment: "evidência", attachments: [{ filename: "shot.png", mediaType: "image/png", data }] });
  assert.equal(commented.status, 201);
  const thread = commented.body.thread as { attachments?: { id: string; kind: string; mediaType: string }[] }[];
  const attachment = thread.at(-1)!.attachments![0];
  assert.equal(attachment.kind, "image");
  assert.equal(attachment.mediaType, "image/png");

  const media = await fetch(`${url}/api/attachments/${attachment.id}`);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), bytes);

  assert.equal((await fetch(`${url}/api/attachments/not-a-uuid`)).status, 404);

  new NextIssueUseCase(root).execute({ agent: "pi" });
  const tid = ((await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput)).body.tickets as { id: string }[])[0].id;
  const onTicket = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/comment`,
    { comment: "", attachments: [{ filename: "clip.mp4", mediaType: "video/mp4", data }] });
  assert.equal(onTicket.status, 201);
  assert.equal(ticketOf(onTicket.body, tid).status, "OPEN");
  const tThread = (onTicket.body.tickets as { id: string; thread: { attachments?: { kind: string }[] }[] }[]).find((t) => t.id === tid)!.thread;
  assert.equal(tThread.at(-1)!.attachments![0].kind, "video");
}));

test("API rejeita anexo com mediaType não suportado", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const result = await request(url, "POST", `/api/issues/${id}/comment`,
    { comment: "x", attachments: [{ filename: "a.txt", mediaType: "text/plain", data: "AA==" }] });
  assert.equal(result.status, 400);
}));

test("API grava tags em Issue e Ticket e rejeita valor inválido", async () => withWeb(async (url, root) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const tagged = await request(url, "POST", `/api/issues/${id}/tags`, { complexity: "ALTA", human_need: "AFK", risk: "MEDIO" });
  assert.equal(tagged.status, 200);
  assert.deepEqual(tagged.body.tags, { complexity: "ALTA", human_need: "AFK", risk: "MEDIO" });
  new NextIssueUseCase(root).execute({ agent: "pi" });
  const tid = ((await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput)).body.tickets as { id: string }[])[0].id;
  const ticketTagged = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/tags`, { risk: "ALTO" });
  assert.equal(ticketTagged.status, 200);
  assert.deepEqual((ticketTagged.body.tickets as { id: string; tags: object }[]).find((t) => t.id === tid)!.tags, { risk: "ALTO" });
  assert.equal((await request(url, "POST", `/api/issues/${id}/tags`, { complexity: "GIGANTE" })).status, 400);
}));

test("API cria Issue com tags no create, sem tags segue funcionando e rejeita valor inválido", async () => withWeb(async (url) => {
  const withTags = await request(url, "POST", "/api/issues", { ...input, complexity: "ALTA", human_need: "AFK" });
  assert.equal(withTags.status, 201);
  assert.deepEqual(withTags.body.tags, { complexity: "ALTA", human_need: "AFK" });
  const persisted = await request(url, "GET", `/api/issues/${withTags.body.id}`);
  assert.deepEqual(persisted.body.tags, { complexity: "ALTA", human_need: "AFK" });
  const noTags = await request(url, "POST", "/api/issues", input);
  assert.equal(noTags.status, 201);
  assert.deepEqual(noTags.body.tags, {});
  assert.equal((await request(url, "POST", "/api/issues", { ...input, risk: "GIGANTE" })).status, 400);
}));

function ticketOf(issue: Record<string, unknown>, tid: string): { status: string } {
  return (issue.tickets as { id: string; status: string }[]).find((ticket) => ticket.id === tid)!;
}

async function createAwaiting(url: string, root: string): Promise<string> {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  new NextIssueUseCase(root).execute({ agent: "pi" });
  const tickets = (await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput)).body.tickets as { id: string }[];
  const tid = tickets[0].id;
  new ClaimTicketUseCase(root).execute({ issueId: id, ticketId: tid, actor: "pi" });
  new StatusTicketUseCase(root).execute({ issueId: id, ticketId: tid, actor: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" });
  const conf = ((await request(url, "GET", `/api/issues/${id}`)).body.tickets as { id: string; type: string }[]).find((ticket) => ticket.type === "Confirmation")!;
  new ClaimTicketUseCase(root).execute({ issueId: id, ticketId: conf.id, actor: "pi" });
  new StatusTicketUseCase(root).execute({ issueId: id, ticketId: conf.id, actor: "pi", status: "CLOSED", comment: "verificado", closed_reason: "concluido" });
  new StatusIssueUseCase(root).execute({ id, agent: "pi", status: "AWAITING", comment: "feito" });
  return id;
}

async function withWeb(run: (url: string, root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "issues-web-"));
  const web = await startWebServer(0, root);
  try { await run(web.url, root); } finally { await close(web); }
}

async function request(url: string, method: string, path: string, body?: object): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function close(web: WebServer): Promise<void> {
  return new Promise((resolve, reject) => web.server.close((error) => error ? reject(error) : resolve()));
}

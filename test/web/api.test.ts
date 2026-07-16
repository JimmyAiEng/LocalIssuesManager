import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { nextIssue, setArtifact } from "../../src/app/issue_use_cases.js";
import { setRequirements } from "../../src/app/requirements_use_cases.js";
import { claimTicket, statusTicket } from "../../src/app/ticket_use_cases.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

const input = { title: "Web issue", project: "web", type: "Fix", problem: "p" };
const ticketInput = { type: "Implement", objective: "o", task: "t", acceptance_criteria: "c" };
const VALID_REQ = JSON.stringify({
  features: ["Feature: Login\n  Como um usuário\n  Eu quero poder entrar\n  Para que eu acesse\n\n  Scenario: ok\n    Given a tela\n    When entro\n    Then vejo o painel"],
});

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
  nextIssue({ agent: "pi", project: "web" }, root);
  const ticketRes = await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput);
  assert.equal(ticketRes.status, 201);
  assert.equal(ticketRes.body.status, "ON-GOING");
  const tickets = ticketRes.body.tickets as { id: string; status: string }[];
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].status, "OPEN");
  const tid = tickets[0].id;
  claimTicket({ issueId: id, ticketId: tid, actor: "human" }, root);
  const statusRes = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/status`, { status: "AWAITING", comment: "revisar" });
  assert.equal(statusRes.status, 200);
  assert.equal(ticketOf(statusRes.body, tid).status, "AWAITING");
  const decideRes = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/decision`, { status: "CLOSED", comment: "ok", closed_reason: "concluido" });
  assert.equal(decideRes.status, 200);
  assert.equal(ticketOf(decideRes.body, tid).status, "CLOSED");
}));

test("API deixa o Humano assumir um Ticket OPEN e então fechá-lo pela web", async () => withWeb(async (url, root) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  nextIssue({ agent: "pi", project: "web" }, root);
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

test("API deixa o Humano assumir uma Issue OPEN (OPEN->CLAIMED) e criar Ticket pela web", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const claimed = await request(url, "POST", `/api/issues/${id}/claim`, {});
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.status, "CLAIMED");
  assert.equal(claimed.body.owner, "human");
  assert.equal(claimed.body.human_presence, true);
  const ticketRes = await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput);
  assert.equal(ticketRes.status, 201);
  assert.equal(ticketRes.body.status, "ON-GOING");
}));

test("API encaminha human_need ao criar Ticket em Issue HITL pela web", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", { ...input, human_need: "HITL" })).body.id as string;
  await request(url, "POST", `/api/issues/${id}/claim`, {});
  const semTag = await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput);
  assert.equal(semTag.status, 400); // Issue HITL exige human_need no Ticket
  const comTag = await request(url, "POST", `/api/issues/${id}/tickets`, { ...ticketInput, human_need: "HITL" });
  assert.equal(comTag.status, 201);
  assert.equal(comTag.body.status, "ON-GOING");
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
  const claimed = nextIssue({ agent: "pi", project: "web" }, root)!.issue.id;
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

  nextIssue({ agent: "pi", project: "web" }, root);
  const tid = ((await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput)).body.tickets as { id: string }[])[0].id;
  const onTicket = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/comment`,
    { comment: "", attachments: [{ filename: "clip.mp4", mediaType: "video/mp4", data }] });
  assert.equal(onTicket.status, 201);
  assert.equal(ticketOf(onTicket.body, tid).status, "OPEN");
  const tThread = (onTicket.body.tickets as { id: string; thread: { attachments?: { kind: string }[] }[] }[]).find((t) => t.id === tid)!.thread;
  assert.equal(tThread.at(-1)!.attachments![0].kind, "video");
}));

test("API cria Issue com imagem: anexo fica na entrada 'Issue created', persiste e é servido", async () => withWeb(async (url) => {
  const bytes = Buffer.from([137, 80, 78, 71, 9, 8, 7]);
  const data = bytes.toString("base64");
  const created = await request(url, "POST", "/api/issues",
    { ...input, attachments: [{ filename: "erro.png", mediaType: "image/png", data }] });
  assert.equal(created.status, 201);
  const thread = created.body.thread as { comment: string; attachments?: { id: string; kind: string; filename: string }[] }[];
  const first = thread[0];
  assert.equal(first.comment, "Issue created");
  assert.equal(first.attachments![0].kind, "image");
  assert.equal(first.attachments![0].filename, "erro.png");

  const media = await fetch(`${url}/api/attachments/${first.attachments![0].id}`);
  assert.equal(media.status, 200);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), bytes);
}));

test("API cria Ticket com imagem: anexo fica na entrada 'Ticket created'", async () => withWeb(async (url, root) => {
  const data = Buffer.from([137, 80, 78, 71, 2, 4]).toString("base64");
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  nextIssue({ agent: "pi", project: "web" }, root);
  const res = await request(url, "POST", `/api/issues/${id}/tickets`,
    { ...ticketInput, attachments: [{ filename: "diag.png", mediaType: "image/png", data }] });
  assert.equal(res.status, 201);
  const ticket = (res.body.tickets as { thread: { comment: string; attachments?: { kind: string }[] }[] }[])[0];
  assert.equal(ticket.thread[0].comment, "Ticket created");
  assert.equal(ticket.thread[0].attachments![0].kind, "image");
}));

test("API cria Issue sem anexo: entrada 'Issue created' não ganha attachments (sem regressão)", async () => withWeb(async (url) => {
  const created = await request(url, "POST", "/api/issues", input);
  assert.equal(created.status, 201);
  const first = (created.body.thread as { attachments?: unknown[] }[])[0];
  assert.equal(first.attachments, undefined);
}));

test("API devolve Issue para OPEN (reset) com imagem: anexo fica na entrada OPEN", async () => withWeb(async (url) => {
  const data = Buffer.from([137, 80, 78, 71, 6, 6]).toString("base64");
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  await request(url, "POST", `/api/issues/${id}/claim`, {}); // OPEN -> CLAIMED
  const reset = await request(url, "POST", `/api/issues/${id}/reset`,
    { comment: "liberar", attachments: [{ filename: "erro.png", mediaType: "image/png", data }] });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.status, "OPEN");
  const last = (reset.body.thread as { status: string; attachments?: { kind: string }[] }[]).at(-1)!;
  assert.equal(last.status, "OPEN");
  assert.equal(last.attachments![0].kind, "image");
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
  nextIssue({ agent: "pi", project: "web" }, root);
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
  nextIssue({ agent: "pi", project: "web" }, root);
  const tickets = (await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput)).body.tickets as { id: string }[];
  const tid = tickets[0].id;
  claimTicket({ issueId: id, ticketId: tid, actor: "pi" }, root);
  statusTicket({ issueId: id, ticketId: tid, actor: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido", last: true }, root);
  const conf = ((await request(url, "GET", `/api/issues/${id}`)).body.tickets as { id: string; type: string }[]).find((ticket) => ticket.type === "Confirmation")!;
  claimTicket({ issueId: id, ticketId: conf.id, actor: "pi" }, root);
  statusTicket({ issueId: id, ticketId: conf.id, actor: "pi", status: "CLOSED", comment: "verificado", closed_reason: "concluido" }, root); // avança a Issue para AWAITING
  return id;
}

test("API GET /issues/:id devolve a IssueView com o Artefato injetado (null sem artefato)", async () => withWeb(async (url, root) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  assert.equal((await request(url, "GET", `/api/issues/${id}`)).body.artifact, null);
  setArtifact({ issueId: id, content: "# doc web" }, root);
  assert.equal((await request(url, "GET", `/api/issues/${id}`)).body.artifact, "# doc web");
}));

test("API GET /issues/:id/requirements devolve requisitos persistidos (200) e 404 sem eles", async () => withWeb(async (url, root) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  assert.equal((await request(url, "GET", `/api/issues/${id}/requirements`)).status, 404);
  const file = join(root, "req.json");
  writeFileSync(file, VALID_REQ, "utf8");
  setRequirements({ issueId: id, file }, root);
  const ok = await request(url, "GET", `/api/issues/${id}/requirements`);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.features, JSON.parse(VALID_REQ).features);
}));

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

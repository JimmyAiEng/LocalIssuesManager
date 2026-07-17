import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addDesignDiagram, setDesignDoc } from "../../src/app/design_use_cases.js";
import { nextIssue, setArtifact } from "../../src/app/issue_use_cases.js";
import { setRequirements } from "../../src/app/requirements_use_cases.js";
import { claimTicket, statusTicket } from "../../src/app/ticket_use_cases.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

// Issue já classificada: a criação de Ticket exige risk+complexity para derivar a autonomia.
const input = { title: "Web issue", project: "web", type: "Fix", problem: "p", complexity: "BAIXA", risk: "BAIXO" };
const bare = { title: "Web issue", project: "web", type: "Fix", problem: "p" }; // sem classificação
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

test("API deriva a autonomia do Ticket em vez de aceitar human_need do cliente", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", { ...input, human_need: "HITL" })).body.id as string;
  await request(url, "POST", `/api/issues/${id}/claim`, {});
  // Implement é reversível: nem o override HITL da Issue nem o human_need do POST o forçam a HITL.
  const created = await request(url, "POST", `/api/issues/${id}/tickets`, { ...ticketInput, human_need: "HITL" });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "ON-GOING");
  assert.deepEqual((created.body.tickets as { tags: object }[]).at(-1)!.tags, { human_need: "AFK" });
  // Planning é fase de decisão: o override da Issue força HITL, derivado pela regra.
  const planning = await request(url, "POST", `/api/issues/${id}/tickets`, { ...ticketInput, type: "Planning" });
  assert.equal(planning.status, 201);
  assert.equal((planning.body.tickets as { tags: { human_need: string } }[]).at(-1)!.tags.human_need, "HITL");
}));

test("API rejeita criar Ticket em Issue sem risk/complexity (mesmo guard da CLI)", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", bare)).body.id as string;
  await request(url, "POST", `/api/issues/${id}/claim`, {});
  const result = await request(url, "POST", `/api/issues/${id}/tickets`, ticketInput);
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /risk e complexity/);
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
  // human_need não vem do cliente: é derivado da Issue e convive com as tags graváveis do Ticket.
  assert.deepEqual((ticketTagged.body.tickets as { id: string; tags: object }[]).find((t) => t.id === tid)!.tags, { human_need: "AFK", risk: "ALTO" });
  const derived = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/tags`, { human_need: "HITL" });
  assert.equal(derived.status, 400);
  assert.match(derived.body.error as string, /derivado/);
  assert.equal((await request(url, "POST", `/api/issues/${id}/tags`, { complexity: "GIGANTE" })).status, 400);
  // O painel web é o teclado do humano: rebaixar segue permitido por ali (a IA é barrada na CLI).
  const rebaixado = await request(url, "POST", `/api/issues/${id}/tags`, { complexity: "BAIXA", risk: "BAIXO" });
  assert.equal(rebaixado.status, 200);
  assert.deepEqual(rebaixado.body.tags, { complexity: "BAIXA", human_need: "AFK", risk: "BAIXO" });
}));

test("API cria Issue com tags no create, sem tags segue funcionando e rejeita valor inválido", async () => withWeb(async (url) => {
  const withTags = await request(url, "POST", "/api/issues", { ...bare, complexity: "ALTA", human_need: "AFK" });
  assert.equal(withTags.status, 201);
  assert.deepEqual(withTags.body.tags, { complexity: "ALTA", human_need: "AFK" });
  const persisted = await request(url, "GET", `/api/issues/${withTags.body.id}`);
  assert.deepEqual(persisted.body.tags, { complexity: "ALTA", human_need: "AFK" });
  const noTags = await request(url, "POST", "/api/issues", bare);
  assert.equal(noTags.status, 201);
  assert.deepEqual(noTags.body.tags, {}); // Issue nasce sem classificação; o guard só morde ao criar Ticket
  assert.equal((await request(url, "POST", "/api/issues", { ...bare, risk: "GIGANTE" })).status, 400);
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
  await statusTicket({ issueId: id, ticketId: tid, actor: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido", last: true }, root);
  const conf = ((await request(url, "GET", `/api/issues/${id}`)).body.tickets as { id: string; type: string }[]).find((ticket) => ticket.type === "Confirmation")!;
  claimTicket({ issueId: id, ticketId: conf.id, actor: "pi" }, root);
  await statusTicket({ issueId: id, ticketId: conf.id, actor: "pi", status: "CLOSED", comment: "verificado", closed_reason: "concluido" }, root); // avança a Issue para AWAITING
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

// Regressão: o pacote de Design existia no app mas o Web não tinha rota — os diagramas
// nunca chegavam ao painel. O 404 de Issue inexistente prova que a rota existe (mensagem
// de domínio) e não é o fallthrough genérico do roteador.
test("API GET /issues/:id/design devolve o pacote de Design com os diagramas (200)", async () => withWeb(async (url, root) => {
  const id = await withDesign(url, root);
  const ok = await request(url, "GET", `/api/issues/${id}/design`);
  assert.equal(ok.status, 200);
  const tickets = ok.body.tickets as { design_md: string; diagrams: Record<string, string | null> }[];
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].design_md, "# design web");
  assert.ok(tickets[0].diagrams.class?.includes("@startuml"));

  const missing = await request(url, "GET", "/api/issues/00000000-0000-4000-8000-000000000000/design");
  assert.equal(missing.status, 404);
  assert.notEqual(missing.body.error, "Not found"); // mensagem de domínio, não fallthrough
}));

test("API GET /issues/:id/design/:tid/:kind.svg renderiza o PlantUML (200 image/svg+xml)", async () => withWeb(async (url, root) => {
  const id = await withDesign(url, root);
  const tid = (await request(url, "GET", `/api/issues/${id}/design`)).body.tickets as { ticketId: string }[];
  const svg = await fetch(`${url}/api/issues/${id}/design/${tid[0].ticketId}/class.svg`);
  assert.equal(svg.status, 200);
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  const body = await svg.text();
  assert.ok(body.startsWith("<svg"), `corpo deve ser SVG cru, veio: ${body.slice(0, 40)}`);

  // ETag: o browser revalida e leva 304 — sem isso o diagrama re-baixa a cada poll do detalhe.
  const etag = svg.headers.get("etag");
  assert.ok(etag);
  const revalidated = await fetch(svg.url, { headers: { "if-none-match": etag } });
  assert.equal(revalidated.status, 304);

  const absent = await fetch(`${url}/api/issues/${id}/design/${tid[0].ticketId}/state.svg`);
  assert.equal(absent.status, 404); // kind válido, diagrama não entregue
  const bad = await fetch(`${url}/api/issues/${id}/design/${tid[0].ticketId}/nope.svg`);
  assert.equal(bad.status, 404); // kind inexistente
}));

// O ticketId da URL vira segmento de caminho (design/<ticketId>/<kind>.puml): sem o guard de
// UUID, "../../../" sai da fila e serve qualquer <kind>.puml da máquina como diagrama.
test("API não deixa o ticketId da rota .svg escapar da fila por path traversal", async () => withWeb(async (url, root) => {
  const id = await withDesign(url, root);
  const secret = join(root, "segredo");
  mkdirSync(secret, { recursive: true });
  writeFileSync(join(secret, "class.puml"), "@startuml\nclass SEGREDO_VAZADO\n@enduml", "utf8");
  const traversal = encodeURIComponent("../../../segredo"); // root/projects/<p>/design/<tid> → root
  const leaked = await fetch(`${url}/api/issues/${id}/design/${traversal}/class.svg`);
  assert.equal(leaked.status, 404);
  assert.doesNotMatch(await leaked.text(), /SEGREDO_VAZADO/);
}));

// Issue com Ticket Design portando design.md + class.puml entregues.
async function withDesign(url: string, root: string): Promise<string> {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  nextIssue({ agent: "pi", project: "web" }, root);
  const created = await request(url, "POST", `/api/issues/${id}/tickets`, { ...ticketInput, type: "Design" });
  const tid = (created.body.tickets as { id: string }[])[0].id;
  const doc = join(root, "design.md");
  writeFileSync(doc, "# design web", "utf8");
  setDesignDoc({ issueId: id, ticketId: tid, file: doc }, root);
  const puml = join(root, "class.puml");
  writeFileSync(puml, "@startuml\nclass A\nA --> B\n@enduml", "utf8");
  await addDesignDiagram({ issueId: id, ticketId: tid, kind: "class", file: puml }, root);
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

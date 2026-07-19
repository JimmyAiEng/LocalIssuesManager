import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addDesignDiagram, setDesignDoc } from "../../src/app/services/use_cases/design_use_cases.js";
import { nextIssue, setArtifact, statusIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { setRequirements } from "../../src/app/services/use_cases/requirements_use_cases.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

const input = { title: "Web issue", project: "web", type: "Fix", action: "Review", problem: "p" };
// JSONL: uma Feature estruturada por linha, o formato que o RequirementArtifact valida.
const VALID_REQ_FEATURES = [{
  feature: "Login", como: "usuário", quero: "entrar", para: "acesse o painel",
  scenarios: [{ nome: "ok", steps: ["Given a tela", "When entro", "Then vejo o painel"] }],
}];
const VALID_REQ = VALID_REQ_FEATURES.map((feature) => JSON.stringify(feature)).join("\n");

test("API cria, lista por tipo, lê e fecha pela camada app", async () => withWeb(async (url, root) => {
  const created = await request(url, "POST", "/api/issues", input);
  assert.equal(created.status, 201);
  assert.equal(created.body.type, "Fix");
  assert.equal(created.body.action, "Review");
  assert.equal((await request(url, "GET", "/api/issues?type=Fix")).body.length, 1);
  assert.equal((await request(url, "GET", "/api/issues?type=Feat")).body.length, 0);
  assert.equal((await request(url, "GET", `/api/issues/${created.body.id}`)).body.id, created.body.id);
  setArtifact({ issueId: created.body.id as string, content: "# Review ok" }, root);
  const closed = await request(url, "POST", `/api/issues/${created.body.id}/close`, { comment: "feito", closed_reason: "concluido" });
  assert.equal(closed.body.status, "CLOSED");
}));

test("API registra projeto e o lista — o painel deixa de depender do CLI para começar", async () => withWeb(async (url, root) => {
  assert.deepEqual(await projectNames(url), ["web"]);
  const created = await request(url, "POST", "/api/projects", { name: "novo", repo: root });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, "novo");
  assert.equal(created.body.repo, root);
  assert.deepEqual((await projectNames(url)).sort(), ["novo", "web"]);
  // e a Issue passa a nascer nele: era exatamente o que travava quem só usa o web
  assert.equal((await request(url, "POST", "/api/issues", { ...input, project: "novo" })).status, 201);
}));

test("API rejeita projeto sem nome/repo e com repo inexistente", async () => withWeb(async (url) => {
  assert.equal((await request(url, "POST", "/api/projects", { repo: "/tmp" })).status, 400);
  const semRepo = await request(url, "POST", "/api/projects", { name: "x" });
  assert.equal(semRepo.status, 400);
  const inexistente = await request(url, "POST", "/api/projects", { name: "x", repo: "/nao/existe/mesmo" });
  assert.equal(inexistente.status, 400);
  assert.match(inexistente.body.error as string, /Repositório não encontrado/);
  assert.equal((await request(url, "PUT", "/api/projects", { name: "x" })).status, 404);
}));

test("API create exige projeto registrado e action válida", async () => withWeb(async (url) => {
  const noProject = await request(url, "POST", "/api/issues", { ...input, project: "ghost" });
  assert.equal(noProject.status, 400);
  assert.match(noProject.body.error as string, /Projeto não registrado/);
  const badAction = await request(url, "POST", "/api/issues", { ...input, action: "Confirmation" });
  assert.equal(badAction.status, 400);
  assert.match(badAction.body.error as string, /Invalid action/);
}));

test("API deixa o Humano assumir uma Issue OPEN (OPEN->CLAIMED) pela web", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const claimed = await request(url, "POST", `/api/issues/${id}/claim`, {});
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.status, "CLAIMED");
  assert.equal(claimed.body.owner, "human");
}));

test("API decide e reseta transições humanas", async () => withWeb(async (url, root) => {
  const awaiting = await createAwaiting(url, root);
  const decided = await request(url, "POST", `/api/issues/${awaiting}/decision`, { status: "OPEN", comment: "corrigir" });
  assert.equal(decided.body.status, "OPEN");
  await request(url, "POST", "/api/issues", input);
  const claimed = nextIssue({ agent: "pi", project: "web" }, root)!.id;
  const reset = await request(url, "POST", `/api/issues/${claimed}/reset`, { comment: "liberar" });
  assert.equal(reset.body.owner, null);
}));

test("API devolve 4xx para regra inválida e não vaza detalhe interno", async () => withWeb(async (url) => {
  const result = await request(url, "POST", "/api/issues", { ...input, type: "invalid" });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /type|Tipo/i);
}));

test("API comenta com anexo, persiste e serve a mídia", async () => withWeb(async (url) => {
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

test("API rejeita comentário acima de 300 palavras com orientação", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const result = await request(url, "POST", `/api/issues/${id}/comment`,
    { comment: Array(301).fill("x").join(" ") });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /limite 300/);
}));

test("API grava tags na Issue e rejeita valor inválido; painel humano rebaixa", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const tagged = await request(url, "POST", `/api/issues/${id}/tags`, { complexity: "ALTA", human_need: "AFK", risk: "MEDIO" });
  assert.equal(tagged.status, 200);
  assert.deepEqual(tagged.body.tags, { complexity: "ALTA", human_need: "AFK", risk: "MEDIO" });
  assert.equal((await request(url, "POST", `/api/issues/${id}/tags`, { complexity: "GIGANTE" })).status, 400);
  // O painel web é o teclado do humano: rebaixar segue permitido por ali (a IA é barrada na CLI).
  const rebaixado = await request(url, "POST", `/api/issues/${id}/tags`, { complexity: "BAIXA", risk: "BAIXO" });
  assert.equal(rebaixado.status, 200);
  assert.deepEqual(rebaixado.body.tags, { complexity: "BAIXA", human_need: "AFK", risk: "BAIXO" });
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

async function createAwaiting(url: string, root: string): Promise<string> {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  nextIssue({ agent: "pi", project: "web" }, root);
  setArtifact({ issueId: id, content: "# Review ok" }, root); // input é Review: satisfaz o gate antes do AWAITING
  await statusIssue({ id, agent: "pi", status: "AWAITING", comment: "evidência" }, root);
  return id;
}

test("API GET /issues/:id devolve a IssueView com Artefato e relacionadas injetados", async () => withWeb(async (url, root) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const view = (await request(url, "GET", `/api/issues/${id}`)).body;
  assert.equal(view.artifact, null);
  assert.deepEqual(view.related, []);
  setArtifact({ issueId: id, content: "# doc web" }, root);
  assert.equal((await request(url, "GET", `/api/issues/${id}`)).body.artifact, "# doc web");
}));

test("API GET /issues/:id/requirements devolve requisitos persistidos (200) e 404 sem eles", async () => withWeb(async (url, root) => {
  const id = (await request(url, "POST", "/api/issues", { ...input, action: "Planning" })).body.id as string;
  assert.equal((await request(url, "GET", `/api/issues/${id}/requirements`)).status, 404);
  const file = join(root, "req.json");
  writeFileSync(file, VALID_REQ, "utf8");
  setRequirements({ issueId: id, file }, root);
  const ok = await request(url, "GET", `/api/issues/${id}/requirements`);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.features, VALID_REQ_FEATURES);
}));

test("API GET /issues/:id/design devolve o pacote de Design com os diagramas (200)", async () => withWeb(async (url, root) => {
  const id = await withDesign(url, root);
  const ok = await request(url, "GET", `/api/issues/${id}/design`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.design_md, "# design web");
  assert.ok((ok.body.diagrams as Record<string, string | null>).class?.includes("@startuml"));

  const missing = await request(url, "GET", "/api/issues/00000000-0000-4000-8000-000000000000/design");
  assert.equal(missing.status, 404);
  assert.notEqual(missing.body.error, "Not found"); // mensagem de domínio, não fallthrough
}));

test("API GET /issues/:id/design/:kind.svg renderiza o PlantUML (200 image/svg+xml)", async () => withWeb(async (url, root) => {
  const id = await withDesign(url, root);
  const svg = await fetch(`${url}/api/issues/${id}/design/class.svg`);
  assert.equal(svg.status, 200);
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  const body = await svg.text();
  assert.ok(body.startsWith("<svg"), `corpo deve ser SVG cru, veio: ${body.slice(0, 40)}`);

  // ETag: o browser revalida e leva 304 — sem isso o diagrama re-baixa a cada poll do detalhe.
  const etag = svg.headers.get("etag");
  assert.ok(etag);
  const revalidated = await fetch(svg.url, { headers: { "if-none-match": etag } });
  assert.equal(revalidated.status, 304);

  const absent = await fetch(`${url}/api/issues/${id}/design/state.svg`);
  assert.equal(absent.status, 404); // kind válido, diagrama não entregue
  const bad = await fetch(`${url}/api/issues/${id}/design/nope.svg`);
  assert.equal(bad.status, 404); // kind inexistente
}));

// Issue action=Design portando design.md + class.puml entregues.
async function withDesign(url: string, root: string): Promise<string> {
  const id = (await request(url, "POST", "/api/issues", { ...input, action: "Design" })).body.id as string;
  const doc = join(root, "design.md");
  writeFileSync(doc, "# design web", "utf8");
  setDesignDoc({ issueId: id, file: doc }, root);
  const puml = join(root, "class.puml");
  writeFileSync(puml, "@startuml\nclass A\nA --> B\n@enduml", "utf8");
  await addDesignDiagram({ issueId: id, kind: "class", file: puml }, root);
  return id;
}

async function withWeb(run: (url: string, root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "issues-web-"));
  createProject({ name: "web", repo: root }, root);
  const web = await startWebServer(0, root);
  try { await run(web.url, root); } finally { await close(web); }
}

// O helper request tipa o corpo como objeto; /api/projects devolve lista.
async function projectNames(url: string): Promise<string[]> {
  const response = await fetch(`${url}/api/projects`);
  return ((await response.json()) as { name: string }[]).map((project) => project.name);
}

async function request(url: string, method: string, path: string, body?: object): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function close(web: WebServer): Promise<void> {
  return new Promise((resolve, reject) => web.server.close((error) => error ? reject(error) : resolve()));
}

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { nextIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

// Cobertura de rota x erro complementar ao api.test.ts (happy paths): 400/404 e a
// justificativa para o único 409 do domínio (Stale Issue save em queue_repository.ts).
const input = { title: "Web issue", project: "web", type: "Fix", action: "QA", problem: "p" };

test("API 400: corpo não-JSON, JSON não-objeto (array/null) e corpo maior que 64MB", async () => withWeb(async (url) => {
  const naoJson = await raw(url, "POST", "/api/issues", "isto não é json");
  assert.equal(naoJson.status, 400);
  assert.match(naoJson.body.error as string, /Invalid JSON/i);

  assert.equal((await raw(url, "POST", "/api/issues", "[1,2,3]")).status, 400);
  assert.equal((await raw(url, "POST", "/api/issues", "null")).status, 400);

  const big = Buffer.alloc(64 * 1024 * 1024 + 1024, 0x61); // > MAX_BODY_BYTES (64MiB) — sem precisar de JSON válido
  const tooBig = await fetch(`${url}/api/issues`, { method: "POST", headers: { "content-type": "application/json" }, body: big });
  assert.equal(tooBig.status, 400);
  assert.match((await tooBig.json()).error, /too large/i);
}));

test("API 400: campo string obrigatório ausente ou com tipo errado", async () => withWeb(async (url) => {
  assert.equal((await request(url, "POST", "/api/issues", { project: "web", type: "Fix", action: "QA", problem: "p" })).status, 400); // sem title
  assert.equal((await request(url, "POST", "/api/issues", { ...input, title: 123 })).status, 400); // title não-string
  assert.equal((await request(url, "POST", "/api/issues", { title: "x", project: "web", type: "Fix", problem: "p" })).status, 400); // sem action
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  assert.equal((await request(url, "POST", `/api/issues/${id}/comment`, {})).status, 400); // sem comment
  assert.equal((await request(url, "POST", `/api/issues/${id}/close`, { comment: "x" })).status, 400); // sem closed_reason
}));

test("API 400: anexos malformados (não-array, item sem filename/mediaType/data)", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const casos: unknown[] = [
    "não é array",
    [null],
    [{ mediaType: "image/png", data: "AA==" }], // sem filename
    [{ filename: "a.png", data: "AA==" }], // sem mediaType
    [{ filename: "a.png", mediaType: "image/png" }], // sem data
  ];
  for (const attachments of casos) {
    const result = await request(url, "POST", `/api/issues/${id}/comment`, { comment: "x", attachments });
    assert.equal(result.status, 400, JSON.stringify(attachments));
  }
}));

test("API 400: transições de domínio inválidas (claim/close/decision/reset fora do estado esperado)", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  assert.equal((await request(url, "POST", `/api/issues/${id}/decision`, { status: "OPEN", comment: "x" })).status, 400); // Issue não está AWAITING
  assert.equal((await request(url, "POST", `/api/issues/${id}/reset`, { comment: "x" })).status, 400); // Issue não está CLAIMED
  await request(url, "POST", `/api/issues/${id}/claim`, {});
  assert.equal((await request(url, "POST", `/api/issues/${id}/claim`, {})).status, 400); // já CLAIMED
}));

test("API 400: filtro de listagem inválido", async () => withWeb(async (url) => {
  assert.equal((await request(url, "GET", "/api/issues?type=Bogus")).status, 400);
  assert.equal((await request(url, "GET", "/api/issues?status=Bogus")).status, 400);
  assert.equal((await request(url, "GET", "/api/issues?status=ON-GOING")).status, 400); // status extinto
}));

test("API 404: Issue inexistente em todas as rotas por id", async () => withWeb(async (url) => {
  const missing = randomUUID();
  assert.equal((await request(url, "GET", `/api/issues/${missing}`)).status, 404);
  assert.equal((await request(url, "GET", `/api/issues/${missing}/requirements`)).status, 404);
  assert.equal((await request(url, "GET", `/api/issues/${missing}/design`)).status, 404);
  assert.equal((await request(url, "POST", `/api/issues/${missing}/comment`, { comment: "x" })).status, 404);
  assert.equal((await request(url, "POST", `/api/issues/${missing}/tags`, { risk: "ALTO" })).status, 404);
  assert.equal((await request(url, "POST", `/api/issues/${missing}/claim`, {})).status, 404);
  assert.equal((await request(url, "POST", `/api/issues/${missing}/close`, { comment: "x", closed_reason: "concluido" })).status, 404);
  assert.equal((await request(url, "POST", `/api/issues/${missing}/decision`, { status: "OPEN", comment: "x" })).status, 404);
  assert.equal((await request(url, "POST", `/api/issues/${missing}/reset`, { comment: "x" })).status, 404);
}));

test("API 404: attachment com UUID válido mas inexistente, e id não-UUID", async () => withWeb(async (url) => {
  assert.equal((await fetch(`${url}/api/attachments/${randomUUID()}`)).status, 404);
  assert.equal((await fetch(`${url}/api/attachments/nao-e-uuid`)).status, 404);
}));

test("API 404: rotas desconhecidas sob /api e método não mapeado", async () => withWeb(async (url) => {
  assert.equal((await request(url, "GET", "/api/frobnicate")).status, 404);
  assert.equal((await request(url, "POST", "/api/frobnicate")).status, 404);
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  assert.equal((await request(url, "POST", `/api/issues/${id}/frobnicate`, {})).status, 404); // ação de Issue desconhecida
  assert.equal((await request(url, "GET", `/api/issues/${id}/frobnicate/extra`)).status, 404); // GET de 3 segmentos sem match
  const put = await fetch(`${url}/api/issues/${id}`, { method: "PUT", body: "{}" });
  assert.equal(put.status, 404); // método não-GET/POST dentro de /api
  const del = await fetch(`${url}/api/issues`, { method: "DELETE" });
  assert.equal(del.status, 404);
}));

test("API 409: não há caminho determinístico via HTTP (load+mutate+save é síncrono por requisição); a corrida vira 400 de domínio", async () => withWeb(async (url) => {
  // ConflictError (queue_repository.ts #guard) só dispara quando o disco muda entre o load e o save do
  // MESMO objeto Issue. Cada handler HTTP faz load→mutate→save de forma síncrona (sem await no meio),
  // então duas requisições concorrentes no mesmo processo Node nunca se intercalam nesse intervalo — uma
  // sempre completa (load+mutate+save) antes da outra sequer carregar. O guard só protege contra dois
  // PROCESSOS distintos (ex.: CLI + web) escrevendo o mesmo arquivo, o que não é reproduzível num teste
  // de integração HTTP de processo único. Documentamos o efeito observável: a 2ª requisição carrega o
  // estado já atualizado pela 1ª e é rejeitada pela regra de domínio (400), não por conflito de revisão.
  const id = (await request(url, "POST", "/api/issues", input)).body.id as string;
  const [a, b] = await Promise.all([
    request(url, "POST", `/api/issues/${id}/claim`, {}),
    request(url, "POST", `/api/issues/${id}/claim`, {}),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400]);
}));

test("API 404: gate de Planning sem requisitos bloqueia o close humano? não — close humano não passa por gate", async () => withWeb(async (url, root) => {
  // O gate por action só vale para a IA (transitionByAgent); o humano fecha por override.
  const id = (await request(url, "POST", "/api/issues", { ...input, action: "Planning" })).body.id as string;
  nextIssue({ agent: "pi", project: "web" }, root);
  const closed = await request(url, "POST", `/api/issues/${id}/close`, { comment: "cancelada", closed_reason: "obsoleto" });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.status, "CLOSED");
}));

async function withWeb(run: (url: string, root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "issues-web-"));
  createProject({ name: "web", repo: root }, root);
  const web = await startWebServer(0, root);
  try { await run(web.url, root); } finally { await close(web); }
}

async function request(url: string, method: string, path: string, body?: object): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function raw(url: string, method: string, path: string, body: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json" }, body });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function close(web: WebServer): Promise<void> {
  return new Promise((resolve, reject) => web.server.close((error) => error ? reject(error) : resolve()));
}

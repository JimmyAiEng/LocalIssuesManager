import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextIssueUseCase } from "../../src/app/next_issue_use_case.js";
import { StatusIssueUseCase } from "../../src/app/status_issue_use_case.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

const input = { title: "Web issue", project: "web", tag: "Implement", problem: "p", artifacts: "a", acceptance_criteria: "c" };

test("API cria, lista, lê e fecha pela camada app", async () => withWeb(async (url) => {
  const created = await request(url, "POST", "/api/issues", input);
  assert.equal(created.status, 201);
  assert.equal(created.body.human_presence, true);
  assert.equal((await request(url, "GET", "/api/issues?tag=Implement")).body.length, 1);
  assert.equal((await request(url, "GET", "/api/issues?tag=QA")).body.length, 0);
  assert.equal((await request(url, "GET", `/api/issues/${created.body.id}`)).body.id, created.body.id);
  const closed = await request(url, "POST", `/api/issues/${created.body.id}/close`, { comment: "feito", closed_reason: "concluido" });
  assert.equal(closed.body.status, "CLOSED");
}));

test("API decide e reseta transições humanas", async () => withWeb(async (url, root) => {
  const awaiting = await createAwaiting(url, root);
  const decided = await request(url, "POST", `/api/issues/${awaiting}/decision`, { status: "OPEN", comment: "corrigir" });
  assert.equal(decided.body.status, "OPEN");
  await request(url, "POST", "/api/issues", input);
  const claimed = new NextIssueUseCase(root).execute({ agent: "pi" })!.id;
  const reset = await request(url, "POST", `/api/issues/${claimed}/reset`, { comment: "liberar" });
  assert.equal(reset.body.owner, null);
}));

test("API devolve 4xx para regra inválida e não vaza detalhe interno", async () => withWeb(async (url) => {
  const result = await request(url, "POST", "/api/issues", { ...input, tag: "invalid" });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /TAG/);
}));

async function createAwaiting(url: string, root: string): Promise<string> {
  const created = await request(url, "POST", "/api/issues", input);
  new NextIssueUseCase(root).execute({ agent: "pi" });
  new StatusIssueUseCase(root).execute({ id: created.body.id as string, agent: "pi", status: "AWAITING", comment: "feito" });
  return created.body.id as string;
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

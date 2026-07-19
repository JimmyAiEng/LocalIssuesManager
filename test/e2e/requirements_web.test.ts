import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

// E2E pela superfície humana real (servidor web HTTP) e pela infra (`issues init`, `web`).
// Cobre CA-05 (fluxo humano via API: criar, decidir, reset) e RF-12/CA-06 (pack + web shell).
const bin = resolve("bin/issues");
const cli = (args: string[], root: string): string =>
  execFileSync(bin, args, { env: { ...process.env, ISSUES_ROOT: root }, encoding: "utf8" });

const issueBody = { title: "Web issue", project: "web", type: "Fix", action: "Review", problem: "quebra", human_need: "HITL" };

// --- CA-05: fluxo humano equivalente via API web -----------------------------
test("CA-05: humano cria Issue HITL pela web; IA entrega evidência via CLI; humano decide AWAITING -> CLOSED", async () =>
  withWeb(async (url, root) => {
    const created = await request(url, "POST", "/api/issues", issueBody);
    assert.equal(created.status, 201);
    const id = created.body.id as string;
    // IA conduz pela CLI real no mesmo store: claim + artefato de Review (gate) + evidência para AWAITING.
    cli(["next", "--agent", "pi", "--project", "web"], root);
    const qaDir = mkdtempSync(join(tmpdir(), "issues-qa-"));
    const qaFile = (name: string, content: string): string => { const p = join(qaDir, name); writeFileSync(p, content); return p; };
    cli(["artifact", "--id", id, "--name", "intent.md", "--file", qaFile("intent.md", "# intenção")], root);
    cli(["artifact", "--id", id, "--name", "evidence-a.md", "--file", qaFile("evidence-a.md", "# evidência a")], root);
    cli(["artifact", "--id", id, "--name", "evidence-b.md", "--file", qaFile("evidence-b.md", "# evidência b")], root);
    cli(["artifact", "--id", id, "--file", qaFile("verdict.md", "APROVADO ok")], root);
    cli(["status", "--id", id, "--agent", "pi", "--status", "AWAITING", "--comment", "evidência: relatório"], root);
    assert.equal((await request(url, "GET", `/api/issues/${id}`)).body.status, "AWAITING");
    const decided = await request(url, "POST", `/api/issues/${id}/decision`,
      { status: "CLOSED", comment: "aceito", closed_reason: "concluido" });
    assert.equal(decided.status, 200);
    assert.equal(decided.body.status, "CLOSED");
  }));

test("CA-05: humano assume Issue OPEN e a reseta pela web (OPEN -> CLAIMED -> OPEN)", async () =>
  withWeb(async (url) => {
    const id = (await request(url, "POST", "/api/issues", issueBody)).body.id as string;
    const claimed = await request(url, "POST", `/api/issues/${id}/claim`, {});
    assert.equal(claimed.body.status, "CLAIMED");
    assert.equal(claimed.body.owner, "human");
    const reset = await request(url, "POST", `/api/issues/${id}/reset`, { comment: "liberar" });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.status, "OPEN");
    assert.equal(reset.body.owner, null);
  }));

// --- RF-12: web server sobe e serve o shell ----------------------------------
test("RF-12: servidor web sobe em porta efêmera e serve o shell HTML", async () =>
  withWeb(async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const html = await response.text();
    assert.match(html, /<title>Issues locais<\/title>/);
    assert.match(html, /id="app"/);
  }));

// --- RF-12 / CA-06: pack instalável e descobrível via `issues init` ----------
test("RF-12/CA-06: `issues init` cria AGENTS.md, .agents/skills e wiring do harness", () => {
  const target = mkdtempSync(join(tmpdir(), "issues-e2e-init-"));
  const out = JSON.parse(cli(["init", "--target", target, "--harness", "pi"], target));
  assert.ok(Array.isArray(out.installed) && out.installed.length >= 1);
  const agents = readFileSync(join(target, "AGENTS.md"), "utf8");
  assert.match(agents, /sdlc-workflow/); // Camada 0 aponta para a skill de entrada
  assert.ok(existsSync(join(target, ".agents", "skills", "sdlc-workflow", "SKILL.md")));
  assert.ok(existsSync(join(target, ".agents", "skills", "sdlc-workflow", "phases", "planning.md")));
  const link = join(target, ".pi", "skills");
  assert.ok(existsSync(join(link, "sdlc-workflow", "SKILL.md"))); // discovery do harness pi
  assert.ok(lstatSync(link).isSymbolicLink());
});

async function withWeb(runner: (url: string, root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "issues-e2e-web-"));
  createProject({ name: "web", repo: root }, root);
  const web = await startWebServer(0, root);
  try {
    await runner(web.url, root);
  } finally {
    await close(web);
  }
}

async function request(url: string, method: string, path: string, body?: object): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, {
    method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function close(web: WebServer): Promise<void> {
  return new Promise((resolvePromise, reject) => web.server.close((error) => (error ? reject(error) : resolvePromise())));
}

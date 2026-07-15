import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Queue } from "../../src/domain/queue_repository.js";

const bin = resolve("bin/issues");
const env = () => ({ ...process.env, ISSUES_ROOT: mkdtempSync(join(tmpdir(), "issues-cli-")) });
const run = (args: string[], vars: NodeJS.ProcessEnv) =>
  execFileSync(bin, args, { env: vars, encoding: "utf8" });

const createArgs = [
  "create", "--title", "CLI issue", "--project", "demo", "--type", "Feat",
  "--problem", "problem", "--artifacts", "src", "--acceptance-criteria", "done", "--agent", "pi",
];

const ticketArgs = (issueId: string) => [
  "ticket", "create", "--issue", issueId, "--type", "Implement", "--objective", "o",
  "--task", "t", "--acceptance-criteria", "c", "--agent", "pi",
];

test("CLI retorna JSON por padrão e next devolve { issue, ticket }", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  assert.equal(created.status, "OPEN");
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.issue.id, created.id);
  assert.equal(claimed.ticket, null);
  const fetched = JSON.parse(run(["get", "--id", created.id], vars));
  assert.equal(fetched.owner, "pi");
});

test("CLI next --id reivindica Issue específica sem --project; sem id nem project falha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const claimed = JSON.parse(run(["next", "--id", created.id, "--agent", "pi"], vars));
  assert.equal(claimed.issue.id, created.id);
  assert.equal(claimed.issue.status, "CLAIMED");
  assert.equal(claimed.ticket, null);
  const missing = spawnSync(bin, ["next", "--agent", "pi"], { env: vars, encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /project is required/);
});

test("CLI exige --human em comandos humanos e devolve erro claro", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const result = spawnSync(bin, ["reset", "--id", created.id, "--comment", "x"], { env: vars, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /human/i);
});

test("CLI --pretty mantém JSON legível", () => {
  const vars = env();
  run(createArgs, vars);
  run(createArgs, vars);
  const output = run(["list", "--project", "demo", "--pretty"], vars);
  assert.match(output, /\n {2}\{/);
  assert.equal(JSON.parse(output).length, 2);
});

test("CLI lista por tipo sem alterar filtros existentes", () => {
  const vars = env();
  run(createArgs, vars);
  run(createArgs.map((arg) => arg === "Feat" ? "Fix" : arg), vars);
  const issues = JSON.parse(run(["list", "--project", "demo", "--type", "Fix"], vars));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, "Fix");
});

test("e2e: ciclo Issue+Ticket via CLI até CLOSED", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const ongoing = JSON.parse(run(ticketArgs(created.id), vars));
  assert.equal(ongoing.status, "ON-GOING");
  const tid = ongoing.tickets[0].id;
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.ticket.id, tid);
  assert.equal(claimed.ticket.status, "CLAIMED");
  run(["ticket", "status", "--issue", created.id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido", "--last"], vars);
  const cid = JSON.parse(run(["get", "--id", created.id], vars)).tickets
    .find((ticket: { type: string }) => ticket.type === "Confirmation").id;
  run(["ticket", "claim", "--issue", created.id, "--id", cid, "--agent", "pi"], vars);
  run(["ticket", "status", "--issue", created.id, "--id", cid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "verificado", "--reason", "concluido"], vars); // avança a Issue para AWAITING
  const closed = JSON.parse(run(["decide", "--id", created.id, "--human", "--status", "CLOSED",
    "--comment", "aceito", "--reason", "concluido"], vars));
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.tickets[0].status, "CLOSED");
});

test("e2e: grupo ticket suporta claim humano, get, list e decisão", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = JSON.parse(run(ticketArgs(created.id), vars)).tickets[0].id;
  run(["ticket", "claim", "--issue", created.id, "--id", tid, "--human"], vars);
  const got = JSON.parse(run(["ticket", "get", "--issue", created.id, "--id", tid], vars));
  assert.equal(got.owner, "human");
  run(["ticket", "status", "--issue", created.id, "--id", tid, "--human",
    "--status", "AWAITING", "--comment", "revisar"], vars);
  const decided = JSON.parse(run(["ticket", "decide", "--issue", created.id, "--id", tid, "--human",
    "--status", "OPEN", "--comment", "corrigir"], vars));
  assert.equal(decided.tickets[0].status, "OPEN");
  const list = JSON.parse(run(["ticket", "list", "--issue", created.id, "--status", "OPEN"], vars));
  assert.equal(list.length, 1);
});

test("e2e: fechamento por IA respeita presença humana", () => {
  const vars = env();
  const machine = JSON.parse(run(createArgs, vars));
  const closed = JSON.parse(run(["status", "--id", machine.id, "--agent", "pi", "--status", "CLOSED",
    "--comment", "incorreta", "--reason", "errado"], vars));
  assert.equal(closed.closed_reason, "errado");

  const human = JSON.parse(run(createArgs.slice(0, -2).concat("--human"), vars));
  const denied = spawnSync(bin, ["status", "--id", human.id, "--agent", "pi", "--status", "CLOSED",
    "--comment", "cancelar", "--reason", "errado"], { env: vars, encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.equal(JSON.parse(run(["get", "--id", human.id], vars)).status, "OPEN");
});

test("e2e: comment --attach anexa mídia na Thread (repetível)", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const dir = mkdtempSync(join(tmpdir(), "issues-attach-"));
  const png = join(dir, "shot.png");
  const mp4 = join(dir, "clip.mp4");
  writeFileSync(png, Buffer.from([137, 80, 78, 71, 1, 2]));
  writeFileSync(mp4, Buffer.from([0, 0, 0, 24]));
  const result = JSON.parse(run(["comment", "--id", created.id, "--agent", "pi",
    "--comment", "evidência", "--attach", png, "--attach", mp4], vars));
  const attachments = result.thread.at(-1).attachments;
  assert.equal(attachments.length, 2);
  assert.equal(attachments[0].kind, "image");
  assert.equal(attachments[1].kind, "video");
  assert.equal(attachments[0].filename, "shot.png");
});

test("e2e: tag insere complexidade/humano/risco em Issue e Ticket; valor inválido falha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = JSON.parse(run(ticketArgs(created.id), vars)).tickets[0].id;
  const tagged = JSON.parse(run(["tag", "--id", created.id,
    "--complexity", "ALTA", "--human-need", "AFK", "--risk", "BAIXO"], vars));
  assert.deepEqual(tagged.tags, { complexity: "ALTA", human_need: "AFK", risk: "BAIXO" });
  const ticketTagged = JSON.parse(run(["ticket", "tag", "--issue", created.id, "--id", tid,
    "--complexity", "MEDIA", "--human-need", "HITL", "--risk", "ALTO"], vars));
  assert.deepEqual(ticketTagged.tickets[0].tags, { complexity: "MEDIA", human_need: "HITL", risk: "ALTO" });
  const bad = spawnSync(bin, ["tag", "--id", created.id, "--risk", "ENORME"], { env: vars, encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Invalid risk: ENORME/);
});

test("CLI next --prompt (fila) retorna Markdown começando com ## SDLC, não JSON", () => {
  const vars = env();
  run(createArgs, vars);
  const output = run(["next", "--prompt", "--agent", "pi", "--project", "demo"], vars);
  assert.ok(output.startsWith("## SDLC"), output.slice(0, 40));
  assert.throws(() => JSON.parse(output));
});

test("CLI next --prompt --id reivindica Issue específica como Markdown", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const output = run(["next", "--prompt", "--id", created.id, "--agent", "pi"], vars);
  assert.ok(output.startsWith("## SDLC"), output.slice(0, 40));
  assert.match(output, /## Issue/);
  assert.throws(() => JSON.parse(output));
});

test("CLI next --prompt com Ticket claimado inclui ## Ticket", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  run(ticketArgs(created.id), vars);
  const output = run(["next", "--prompt", "--agent", "pi", "--project", "demo"], vars);
  assert.match(output, /## Tipo do Ticket/);
  assert.match(output, /## Ticket/);
});

test("CLI next sem --prompt mantém JSON { issue, ticket } (regressão)", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.issue.id, created.id);
  assert.equal(claimed.ticket, null);
});

test("CLI next --prompt com fila vazia = stdout vazio e exit 0", () => {
  const vars = env();
  const result = spawnSync(bin, ["next", "--prompt", "--agent", "pi", "--project", "demo"], { env: vars, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("e2e: artifact grava .md da Issue/Ticket e create --artifact-file grava no id novo", () => {
  const vars = env();
  const dir = mkdtempSync(join(tmpdir(), "issues-art-"));
  const md = join(dir, "doc.md");
  writeFileSync(md, "# artefato");
  const queue = new Queue(vars.ISSUES_ROOT);

  const created = JSON.parse(run(createArgs.concat("--artifact-file", md), vars));
  assert.equal(queue.readArtifact("demo", created.id), "# artefato");

  const updated = join(dir, "up.md");
  writeFileSync(updated, "# issue atualizado");
  const ok = JSON.parse(run(["artifact", "--id", created.id, "--file", updated], vars));
  assert.deepEqual(ok, { ok: true, id: created.id });
  assert.equal(queue.readArtifact("demo", created.id), "# issue atualizado");

  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = JSON.parse(run(ticketArgs(created.id).concat("--artifact-file", md), vars)).tickets[0].id;
  assert.equal(queue.readArtifact("demo", tid), "# artefato");
  const tmd = join(dir, "t.md");
  writeFileSync(tmd, "# ticket doc");
  run(["ticket", "artifact", "--issue", created.id, "--id", tid, "--file", tmd], vars);
  assert.equal(queue.readArtifact("demo", tid), "# ticket doc");
});

test("e2e: get/next/ticket get imprimem os campos de artefato no JSON", () => {
  const vars = env();
  const dir = mkdtempSync(join(tmpdir(), "issues-view-"));
  const md = join(dir, "doc.md");
  writeFileSync(md, "# art issue");
  const created = JSON.parse(run(createArgs.concat("--artifact-file", md), vars));

  assert.equal(JSON.parse(run(["get", "--id", created.id], vars)).artifact, "# art issue");
  const queued = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(queued.issue.artifact, "# art issue"); // só-issue: artifact presente, ticket null
  assert.equal(queued.ticket, null);

  const tmd = join(dir, "t.md");
  writeFileSync(tmd, "# art ticket");
  const tid = JSON.parse(run(ticketArgs(created.id).concat("--artifact-file", tmd), vars)).tickets[0].id;
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.ticket.id, tid);
  assert.equal(claimed.ticket.artifact, "# art ticket");
  assert.equal(claimed.ticket.issue_artifact, "# art issue");

  const got = JSON.parse(run(["ticket", "get", "--issue", created.id, "--id", tid], vars));
  assert.equal(got.artifact, "# art ticket");
  assert.equal(got.issue_artifact, "# art issue");
});

test("e2e: reset humano libera Issue CLAIMED e subcomando ticket inválido falha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "cursor", "--project", "demo"], vars);
  const reset = JSON.parse(run(["reset", "--id", created.id, "--human", "--comment", "liberar"], vars));
  assert.equal(reset.owner, null);
  const bogus = spawnSync(bin, ["ticket", "bogus", "--issue", created.id], { env: vars, encoding: "utf8" });
  assert.notEqual(bogus.status, 0);
  assert.match(bogus.stderr, /Usage: issues ticket/);
});

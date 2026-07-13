import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Issue } from "../../src/domain/issue_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";

const body = { title: "one", project: "space / project", tag: "QA" as const,
  problem: "p", artifacts: "a", acceptance_criteria: "c" };
const root = () => mkdtempSync(join(tmpdir(), "queue-test-"));

test("Queue move o mesmo JSON entre pastas sem cópia obsoleta", () => {
  const dir = root();
  const queue = new Queue(dir);
  const issue = Issue.create(body, "pi", new Date("2026-01-01"));
  queue.save(issue);
  const project = encodeURIComponent(body.project);
  const open = join(dir, "projects", project, "open", `${issue.id}.json`);
  assert.equal(existsSync(open), true);
  issue.claim("pi");
  queue.save(issue);
  assert.equal(existsSync(open), false);
  assert.equal(existsSync(join(dir, "projects", project, "claimed", `${issue.id}.json`)), true);
});

test("nomes de Projeto em dot-segment permanecem dentro de projects", () => {
  for (const [project, segment] of [[".", "%2E"], ["..", "%2E%2E"]]) {
    const dir = root();
    const queue = new Queue(dir);
    const issue = Issue.create({ ...body, project }, "pi");
    queue.save(issue);
    assert.equal(queue.load(issue.id)?.project, project);
    assert.equal(existsSync(join(dir, "projects", segment, "open", `${issue.id}.json`)), true);
  }
});

test("oldestOpen usa timestamp de entrada em OPEN e desempate estável", () => {
  const queue = new Queue(root());
  const newer = Issue.create({ ...body, project: "p", title: "new" }, "pi", new Date("2026-02-01"));
  const older = Issue.create({ ...body, project: "p", title: "old" }, "pi", new Date("2026-01-01"));
  queue.save(newer);
  queue.save(older);
  assert.equal(queue.oldestOpen("p")?.id, older.id);
});

test("save rejeita snapshot sem transição", () => {
  const queue = new Queue(root());
  const issue = Issue.create({ ...body, project: "p" }, "pi");
  queue.save(issue);
  assert.throws(() => queue.save(issue), /Stale Issue save/);
});

test("save rejeita segundo Claim obsoleto", () => {
  const queue = new Queue(root());
  const issue = Issue.create({ ...body, project: "p" }, "pi");
  queue.save(issue);
  const first = queue.load(issue.id)!;
  const stale = queue.load(issue.id)!;
  first.claim("pi");
  queue.save(first);
  stale.claim("codex");
  assert.throws(() => queue.save(stale), /stale/i);
  assert.equal(queue.load(issue.id)?.owner, "pi");
});

test("pastas AWAITING e CLOSED preservam a separação por status", () => {
  const dir = root();
  const queue = new Queue(dir);
  const awaiting = Issue.create({ ...body, project: "p", title: "awaiting" }, "pi");
  awaiting.claim("pi");
  awaiting.await("pi", "review");
  queue.save(awaiting);
  const closed = Issue.create({ ...body, project: "p", title: "closed" }, "pi");
  closed.closeByAgent("pi", "done", "concluido");
  queue.save(closed);
  assert.equal(existsSync(join(dir, "projects/p/awaiting", `${awaiting.id}.json`)), true);
  assert.equal(existsSync(join(dir, "projects/p/closed", `${closed.id}.json`)), true);
});

test("list aplica todos os filtros mesmo a JSONs em diretórios inconsistentes", () => {
  const dir = root();
  const queue = new Queue(dir);
  const wanted = Issue.create({ ...body, project: "p", title: "Needle" }, "pi");
  const wrongTitle = Issue.create({ ...body, project: "p", title: "other" }, "pi");
  queue.save(wanted);
  queue.save(wrongTitle);

  const wrongProject = Issue.create({ ...body, project: "other", title: "Needle" }, "pi");
  const wrongStatus = Issue.create({ ...body, project: "p", title: "Needle" }, "pi");
  wrongStatus.claim("pi");
  writeFileSync(join(dir, "projects/p/open", `${wrongProject.id}.json`), JSON.stringify(wrongProject));
  writeFileSync(join(dir, "projects/p/open", `${wrongStatus.id}.json`), JSON.stringify(wrongStatus));
  writeFileSync(join(dir, "projects/p/open", "README.txt"), "not json");

  assert.deepEqual(queue.list({ project: "p", status: "OPEN", title: "needle" }).map((issue) => issue.id), [wanted.id]);
});

test("Claims concorrentes têm um único vencedor persistido", async () => {
  const dir = root();
  const queue = new Queue(dir);
  queue.save(Issue.create({ ...body, project: "p" }, "pi"));
  const [left, right] = await Promise.all([claim(dir, "pi"), claim(dir, "codex")]);
  const winners = [left, right].filter((result) => result !== null);
  assert.equal(winners.length, 1);
  assert.equal(queue.list({ status: "CLAIMED" })[0].owner, winners[0]?.owner);
});

test("save não apaga Reset humano com snapshot antigo", () => {
  const queue = new Queue(root());
  const issue = Issue.create({ ...body, project: "p" }, "pi");
  queue.save(issue);
  issue.claim("pi");
  queue.save(issue);
  const stale = queue.load(issue.id)!;
  const reset = queue.load(issue.id)!;
  reset.reset("liberar");
  queue.save(reset);
  stale.await("pi", "velho");
  assert.throws(() => queue.save(stale), /stale/i);
  assert.equal(queue.load(issue.id)?.human_presence, true);
});

function claim(dir: string, agent: string): Promise<{ owner: string } | null> {
  return new Promise((resolve) => {
    execFile("bin/issues", ["next", "--agent", agent],
      { env: { ...process.env, ISSUES_ROOT: dir }, encoding: "utf8" }, (error, stdout) => {
        resolve(error || stdout.trim() === "null" ? null : JSON.parse(stdout));
      });
  });
}

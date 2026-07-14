import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Attachment } from "../../src/domain/attachment_entity.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";
import { Ticket } from "../../src/domain/ticket_entity.js";

const body = { title: "one", project: "space / project", type: "Feat" as const, problem: "p" };
const root = () => mkdtempSync(join(tmpdir(), "queue-test-"));

function ongoingIssue(queue: Queue, project: string, id: string, ticketDate: Date) {
  const issue = Issue.create({ ...body, project }, "pi");
  issue.id = id;
  issue.claim("pi");
  const ticket = Ticket.create({ issue_id: id, objective: "o", task: "t",
    acceptance_criteria: "c", type: "Implement", actor: "pi" }, ticketDate);
  issue.addTicket(ticket);
  queue.save(issue);
  return { issue, ticket };
}

test("oldestOpenTicket omite Ticket cuja dependência não está AWAITING/CLOSED", () => {
  const queue = new Queue(root());
  const issue = Issue.create({ ...body, project: "p" }, "pi");
  issue.claim("pi");
  const t1 = Ticket.create({ issue_id: issue.id, objective: "o", task: "t",
    acceptance_criteria: "c", type: "Implement", actor: "pi" }, new Date("2026-01-01"));
  issue.addTicket(t1);
  const t2 = Ticket.create({ issue_id: issue.id, objective: "o", task: "t",
    acceptance_criteria: "c", type: "Implement", depends_on: [t1.id], actor: "pi" }, new Date("2026-01-02"));
  issue.addTicket(t2);
  queue.save(issue);

  // T1 OPEN → next entrega T1, nunca T2
  assert.equal(queue.oldestOpenTicket("p")?.ticket.id, t1.id);
  // T1 CLAIMED → T2 ainda bloqueado; T1 já não está OPEN, então nada a entregar
  issue.claimTicket(t1.id, "pi");
  queue.save(issue);
  assert.equal(queue.oldestOpenTicket("p"), null);
  // T1 CLOSED → T2 liberado
  issue.transitionTicket(t1.id, "pi", "AWAITING", "done");
  issue.decideTicket(t1.id, "CLOSED", "ok", "concluido");
  queue.save(issue);
  assert.equal(queue.oldestOpenTicket("p")?.ticket.id, t2.id);
});

test("addTicket recusa dependência inexistente na Issue", () => {
  const issue = Issue.create(body, "pi");
  issue.claim("pi");
  const orphan = Ticket.create({ issue_id: issue.id, objective: "o", task: "t",
    acceptance_criteria: "c", type: "Implement", depends_on: ["nao-existe"], actor: "pi" });
  assert.throws(() => issue.addTicket(orphan), /Dependency not found: nao-existe/);
});

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
  newer.id = "newer";
  older.id = "older";
  queue.save(newer);
  queue.save(older);
  assert.equal(queue.oldestOpen("p")?.id, older.id);
});

test("oldestOpenTicket prioriza Ticket OPEN mais antigo com desempate por id", () => {
  const queue = new Queue(root());
  const recent = ongoingIssue(queue, "p", "a", new Date("2026-02-01"));
  const old = ongoingIssue(queue, "p", "b", new Date("2026-01-01"));
  const target = queue.oldestOpenTicket("p");
  assert.equal(target?.issue.id, old.issue.id);
  assert.equal(target?.ticket.id, old.ticket.id);
  assert.notEqual(recent.ticket.id, target?.ticket.id);
  assert.equal(queue.oldestOpenTicket("missing"), null);
});

test("save sobrescreve in-place quando apenas um Ticket muda", () => {
  const dir = root();
  const queue = new Queue(dir);
  const { issue, ticket } = ongoingIssue(queue, "p", "x", new Date("2026-01-01"));
  const loaded = queue.load(issue.id)!;
  loaded.claimTicket(ticket.id, "pi");
  queue.save(loaded);
  assert.equal(existsSync(join(dir, "projects/p/ongoing", `${issue.id}.json`)), true);
  assert.equal(queue.load(issue.id)?.tickets[0].status, "CLAIMED");
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

test("save rejeita mutação de Ticket sobre snapshot antigo por revisão", () => {
  const queue = new Queue(root());
  const { issue, ticket } = ongoingIssue(queue, "p", "y", new Date("2026-01-01"));
  const first = queue.load(issue.id)!;
  const stale = queue.load(issue.id)!;
  first.claimTicket(ticket.id, "pi");
  queue.save(first);
  stale.claimTicket(ticket.id, "codex");
  assert.throws(() => queue.save(stale), /stale/i);
  assert.equal(queue.load(issue.id)?.tickets[0].owner, "pi");
});

test("pastas AWAITING e CLOSED preservam a separação por status", () => {
  const dir = root();
  const queue = new Queue(dir);
  const { issue, ticket } = ongoingIssue(queue, "p", "awaiting", new Date("2026-01-01"));
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido");
  issue.await("pi", "review");
  queue.save(issue);
  const closed = Issue.create({ ...body, project: "p", title: "closed" }, "pi");
  closed.closeByAgent("pi", "done", "concluido");
  queue.save(closed);
  assert.equal(existsSync(join(dir, "projects/p/awaiting", `${issue.id}.json`)), true);
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

test("list filtra Issues por tipo", () => {
  const dir = root();
  const queue = new Queue(dir);
  queue.save(Issue.create({ ...body, project: "p", title: "feat", type: "Feat" }, "pi"));
  queue.save(Issue.create({ ...body, project: "p", title: "fix", type: "Fix" }, "pi"));
  assert.deepEqual(queue.list({ project: "p", type: "Fix" }).map((issue) => issue.title), ["fix"]);
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
  stale.addTicket(Ticket.create({ issue_id: issue.id, objective: "o", task: "t",
    acceptance_criteria: "c", type: "Implement", actor: "pi" }));
  assert.throws(() => queue.save(stale), /stale/i);
  assert.equal(queue.load(issue.id)?.human_presence, true);
});

test("purgeClosed remove CLOSED com >= 7 dias e preserva < 7 dias (tempo mockado)", () => {
  const dir = root();
  const queue = new Queue(dir);
  const closedDir = join(dir, "projects/p/closed");
  mkdirSync(closedDir, { recursive: true });
  const put = (id: string, closedAt: string) => {
    const issue = Issue.create({ ...body, project: "p" }, "pi");
    issue.id = id;
    issue.closeByAgent("pi", "done", "concluido", new Date(closedAt));
    writeFileSync(join(closedDir, `${id}.json`), JSON.stringify(issue));
  };
  put("old", "2026-07-06T00:00:00Z"); // 8 dias -> remove
  put("edge", "2026-07-07T00:00:00Z"); // exatamente 7 dias -> remove
  put("fresh", "2026-07-10T00:00:00Z"); // 4 dias -> mantém
  const purged = queue.purgeClosed(new Date("2026-07-14T00:00:00Z"));
  assert.deepEqual(purged.sort(), ["edge", "old"]);
  assert.equal(existsSync(join(closedDir, "old.json")), false);
  assert.equal(existsSync(join(closedDir, "edge.json")), false);
  assert.equal(existsSync(join(closedDir, "fresh.json")), true);
});

test("purgeClosed não toca itens não-CLOSED", () => {
  const queue = new Queue(root());
  const open = Issue.create({ ...body, project: "p" }, "pi", new Date("2026-01-01"));
  queue.save(open);
  assert.deepEqual(queue.purgeClosed(new Date("2026-07-14")), []);
  assert.equal(queue.load(open.id)?.status, "OPEN");
});

test("save dispara a purga de CLOSED expirado", () => {
  const dir = root();
  const queue = new Queue(dir);
  const closedDir = join(dir, "projects/p/closed");
  mkdirSync(closedDir, { recursive: true });
  const stale = Issue.create({ ...body, project: "p" }, "pi");
  stale.id = "stale";
  stale.closeByAgent("pi", "done", "concluido", new Date("2020-01-01"));
  writeFileSync(join(closedDir, "stale.json"), JSON.stringify(stale));
  queue.save(Issue.create({ ...body, project: "p" }, "pi"));
  assert.equal(existsSync(join(closedDir, "stale.json")), false);
});

test("blob de anexo é gravado fora das pastas de status e sobrevive à transição", () => {
  const dir = root();
  const queue = new Queue(dir);
  const { issue, ticket } = ongoingIssue(queue, "p", "att", new Date("2026-01-01"));
  const attachment = Attachment.create({ filename: "prova.png", mediaType: "image/png", size: 3 }).toJSON();
  queue.writeAttachment("p", attachment, Buffer.from("png"));

  // move a Issue de ongoing -> awaiting (renomeia a pasta do JSON)
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido");
  issue.await("pi", "pronto");
  queue.save(issue);

  const found = queue.findAttachment(attachment.id);
  assert.equal(found?.mediaType, "image/png");
  assert.equal(existsSync(join(dir, "projects/p/attachments", `${attachment.id}.png`)), true);
  assert.equal(readFileSync(found!.path, "utf8"), "png");
  assert.equal(queue.findAttachment("00000000-0000-0000-0000-000000000000"), null);
});

test("purgeClosed remove os anexos das Issues purgadas", () => {
  const dir = root();
  const queue = new Queue(dir);
  const issue = Issue.create({ ...body, project: "p" }, "pi");
  issue.id = "withatt";
  const att = Attachment.create({ filename: "a.png", mediaType: "image/png", size: 3 }).toJSON();
  issue.comment("pi", "veja", [att]);
  queue.writeAttachment("p", att, Buffer.from("png"));
  issue.closeByAgent("pi", "done", "concluido", new Date("2026-01-01"));
  mkdirSync(join(dir, "projects/p/closed"), { recursive: true });
  writeFileSync(join(dir, "projects/p/closed/withatt.json"), JSON.stringify(issue));
  const blob = join(dir, "projects/p/attachments", `${att.id}.png`);
  assert.equal(existsSync(blob), true);
  assert.deepEqual(queue.purgeClosed(new Date("2026-07-14")), ["withatt"]);
  assert.equal(existsSync(blob), false);
  assert.equal(existsSync(join(dir, "projects/p/closed/withatt.json")), false);
});

function claim(dir: string, agent: string): Promise<{ owner: string } | null> {
  return new Promise((resolve) => {
    execFile("bin/issues", ["next", "--agent", agent],
      { env: { ...process.env, ISSUES_ROOT: dir }, encoding: "utf8" }, (error, stdout) => {
        resolve(error || stdout.trim() === "null" ? null : JSON.parse(stdout).issue);
      });
  });
}

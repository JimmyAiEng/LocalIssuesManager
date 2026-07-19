import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MediaArtifact } from "../../src/domain/artifacts/media_artifact.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";

const body = { title: "one", project: "space / project", type: "Feat" as const, action: "Implement" as const, problem: "p" };
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

test("registro de projeto: write/read/list com project.json e pastas de status criadas", () => {
  const dir = root();
  const queue = new Queue(dir);
  assert.equal(queue.readProject("app"), null);
  assert.deepEqual(queue.listProjects(), []);
  queue.writeProject({ name: "app", repo: "/tmp/repo" });
  queue.writeProject({ name: "space / project", repo: "/tmp/other" });
  assert.deepEqual(queue.readProject("app"), { name: "app", repo: "/tmp/repo" });
  assert.deepEqual(queue.readProject("space / project"), { name: "space / project", repo: "/tmp/other" });
  assert.deepEqual(queue.listProjects().map((project) => project.name).sort(), ["app", "space / project"]);
  assert.equal(existsSync(join(dir, "projects", "app", "open")), true);
  assert.equal(existsSync(join(dir, "projects", "app", "project.json")), true);
});

test("registro de projeto é upsert: regravar atualiza o repo", () => {
  const queue = new Queue(root());
  queue.writeProject({ name: "app", repo: "/tmp/repo" });
  queue.writeProject({ name: "app", repo: "/tmp/outro" });
  assert.equal(queue.readProject("app")?.repo, "/tmp/outro");
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
  assert.equal(queue.oldestOpen("missing"), null);
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
  const issue = Issue.create({ ...body, project: "p" }, "pi");
  issue.claim("pi");
  issue.submit("pi", "evidência");
  queue.save(issue);
  const closed = Issue.create({ ...body, project: "p", title: "closed" }, "pi");
  closed.claim("pi");
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
  const queue = new Queue(root());
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
  stale.comment("pi", "ainda trabalhando");
  assert.throws(() => queue.save(stale), /stale/i);
  assert.equal(queue.load(issue.id)?.status, "OPEN");
});

test("purgeClosed remove CLOSED com >= 7 dias e preserva < 7 dias (tempo mockado)", () => {
  const dir = root();
  const queue = new Queue(dir);
  const closedDir = join(dir, "projects/p/closed");
  mkdirSync(closedDir, { recursive: true });
  const put = (id: string, closedAt: string) => {
    const issue = Issue.create({ ...body, project: "p" }, "human");
    issue.id = id;
    issue.closeByHuman("done", "concluido", new Date(closedAt));
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

test("save não purga CLOSED expirado; purga é manutenção explícita, fora do caminho de escrita", () => {
  const dir = root();
  const queue = new Queue(dir);
  const closedDir = join(dir, "projects/p/closed");
  mkdirSync(closedDir, { recursive: true });
  const stale = Issue.create({ ...body, project: "p" }, "human");
  stale.id = "stale";
  stale.closeByHuman("done", "concluido", new Date("2020-01-01"));
  writeFileSync(join(closedDir, "stale.json"), JSON.stringify(stale));
  queue.save(Issue.create({ ...body, project: "p" }, "pi"));
  assert.equal(existsSync(join(closedDir, "stale.json")), true); // save não varre CLOSED
  queue.purgeClosed(); // a purga só ocorre quando chamada (loop periódico)
  assert.equal(existsSync(join(closedDir, "stale.json")), false);
});

test("blob de anexo é gravado fora das pastas de status e sobrevive à transição", () => {
  const dir = root();
  const queue = new Queue(dir);
  const issue = Issue.create({ ...body, project: "p" }, "pi");
  issue.claim("pi");
  queue.save(issue);
  const attachment = MediaArtifact.create({ filename: "prova.png", mediaType: "image/png", size: 3 }).toJSON();
  queue.writeAttachment("p", attachment, Buffer.from("png"));

  // move a Issue de claimed -> awaiting (renomeia a pasta do JSON)
  issue.submit("pi", "evidência");
  queue.save(issue);

  const found = queue.findAttachment(attachment.id);
  assert.equal(found?.mediaType, "image/png");
  assert.equal(existsSync(join(dir, "projects/p/attachments", `${attachment.id}.png`)), true);
  assert.equal(readFileSync(found!.path, "utf8"), "png");
  assert.equal(queue.findAttachment("00000000-0000-0000-0000-000000000000"), null);
});

test("purgeClosed remove Media, Document, UML e Requirement Artifacts da Issue", () => {
  const dir = root();
  const queue = new Queue(dir);
  const issue = Issue.create({ ...body, project: "p" }, "pi");
  issue.id = "withall";
  const att = MediaArtifact.create({ filename: "a.png", mediaType: "image/png", size: 3 }).toJSON();
  issue.comment("pi", "veja", [att]);
  queue.writeAttachment("p", att, Buffer.from("png"));
  queue.writeArtifact("p", issue.id, "# artefato");
  queue.writeDesign("p", issue.id, "design.md", "# doc");
  queue.writeRequirements("p", issue.id, JSON.stringify({ feature: "F", como: "a", quero: "b", para: "c",
    scenarios: [{ nome: "ok", steps: ["Given a"] }] }));
  issue.status = "CLOSED"; // força o estado terminal no JSON (o purge lê status do disco)
  issue.status_changed_at = "2026-01-01T00:00:00.000Z";
  mkdirSync(join(dir, "projects/p/closed"), { recursive: true });
  writeFileSync(join(dir, "projects/p/closed/withall.json"), JSON.stringify(issue));
  const blob = join(dir, "projects/p/attachments", `${att.id}.png`);
  const artifact = join(dir, "projects/p/artifacts", `${issue.id}.md`);
  const design = join(dir, "projects/p/design", issue.id);
  const requirements = join(dir, "projects/p/requirements", `${issue.id}.jsonl`);
  for (const path of [blob, artifact, design, requirements]) assert.equal(existsSync(path), true);
  assert.deepEqual(queue.purgeClosed(new Date("2026-07-14")), ["withall"]);
  for (const path of [blob, artifact, design, requirements]) assert.equal(existsSync(path), false);
});

test("findAttachment pula projeto sem pasta attachments até achar no projeto seguinte", () => {
  const dir = root();
  const queue = new Queue(dir);
  // "aaa" nunca recebe writeAttachment: nunca cria a pasta attachments (força o continue)
  queue.save(Issue.create({ ...body, project: "aaa" }, "pi"));
  queue.save(Issue.create({ ...body, project: "bbb" }, "pi"));
  const attachment = MediaArtifact.create({ filename: "prova.png", mediaType: "image/png", size: 3 }).toJSON();
  queue.writeAttachment("bbb", attachment, Buffer.from("png"));
  const found = queue.findAttachment(attachment.id);
  assert.equal(found?.mediaType, "image/png");
});

test("Artefato .md faz round-trip write/read e devolve null quando inexistente", () => {
  const dir = root();
  const queue = new Queue(dir);
  assert.equal(queue.readArtifact("space / project", "owner"), null);
  const content = "# Exploração\n\ncontexto & critérios";
  queue.writeArtifact("space / project", "owner", content);
  assert.equal(queue.readArtifact("space / project", "owner"), content);
  const segment = encodeURIComponent("space / project");
  assert.equal(existsSync(join(dir, "projects", segment, "artifacts", "owner.md")), true);
});

test("Artefato .md é sobrescrito por completo na reescrita (nunca append)", () => {
  const queue = new Queue(root());
  queue.writeArtifact("p", "owner", "primeiro");
  queue.writeArtifact("p", "owner", "segundo");
  assert.equal(queue.readArtifact("p", "owner"), "segundo");
});

test("Design faz round-trip write/read/list por Issue e regravar substitui", () => {
  const dir = root();
  const queue = new Queue(dir);
  assert.equal(queue.readDesign("space / project", "iid", "design.md"), null);
  assert.deepEqual(queue.listDesign("space / project", "iid"), []);
  queue.writeDesign("space / project", "iid", "design.md", "# doc");
  queue.writeDesign("space / project", "iid", "class.puml", "@startuml\n@enduml");
  queue.writeDesign("space / project", "iid", "design.md", "# doc v2");
  assert.equal(queue.readDesign("space / project", "iid", "design.md"), "# doc v2");
  assert.deepEqual(queue.listDesign("space / project", "iid"), ["class.puml"]);
  const segment = encodeURIComponent("space / project");
  assert.equal(existsSync(join(dir, "projects", segment, "design", "iid", "class.puml")), true);
});

function claim(dir: string, agent: string, project = "p"): Promise<{ owner: string } | null> {
  return new Promise((resolve) => {
    execFile("bin/issues", ["next", "--agent", agent, "--project", project],
      { env: { ...process.env, ISSUES_ROOT: dir }, encoding: "utf8" }, (error, stdout) => {
        resolve(error || stdout.trim() === "null" ? null : JSON.parse(stdout));
      });
  });
}

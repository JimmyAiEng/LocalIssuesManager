import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  claimIssue, createIssue, decideIssue, getIssue, listIssues, nextIssue, relateIssues, resetClaim,
  setArtifact, statusIssue, updateTags,
} from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject, listProjects } from "../../src/app/services/use_cases/project_use_cases.js";
import { Queue } from "../../src/domain/queue_repository.js";

// Os testes genéricos de fluxo usam a action Review; seu gate de conclusão exige o conjunto de
// documentos da revisão, semeado por seedReview() nos testes que transicionam a Issue.
const body = { project: "app", type: "Feat" as const, action: "Review", problem: "p", actor: "human" as const };
const longText = Array(301).fill("x").join(" ");

const root = () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-test-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};

// Conjunto de documentos de uma Review válida (intent + 2 evidence nomeadas + veredito APROVADO no
// artefato legado), gravado pela superfície real setArtifact (exercita a flag --name).
const seedReview = (dir: string, id: string): void => {
  setArtifact({ issueId: id, content: "# intenção", name: "intent.md" }, dir);
  setArtifact({ issueId: id, content: "# evidência a", name: "evidence-a.md" }, dir);
  setArtifact({ issueId: id, content: "# evidência b", name: "evidence-b.md" }, dir);
  setArtifact({ issueId: id, content: "APROVADO revisão ok" }, dir);
};

test("createIssue exige projeto registrado, com orientação de como criar", () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-test-"));
  assert.throws(() => createIssue({ ...body, title: "x" }, dir),
    /Projeto não registrado: app.*issues project create/);
});

test("project create valida repo existente e list devolve os registrados", () => {
  const dir = root();
  assert.throws(() => createProject({ name: "ghost", repo: join(dir, "nope") }, dir), /Repositório não encontrado/);
  assert.throws(() => createProject({ name: " ", repo: dir }, dir), /name is required/);
  createProject({ name: "other", repo: dir }, dir);
  const projects = listProjects(dir).map((project) => project.name).sort();
  assert.deepEqual(projects, ["app", "other"]);
});

test("next reivindica a Issue OPEN mais antiga do projeto (FIFO)", () => {
  const dir = root();
  const older = createIssue({ ...body, title: "older", now: new Date("2026-01-01") }, dir);
  const newer = createIssue({ ...body, title: "newer", now: new Date("2026-01-02") }, dir);
  const claimed = nextIssue({ agent: "pi", project: "app" }, dir);
  assert.equal(claimed?.id, older.id);
  assert.equal(claimed?.status, "CLAIMED");
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir)?.id, newer.id);
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir), null);
});

test("next --id reivindica a Issue específica; inexistente lança NotFound", () => {
  const dir = root();
  createIssue({ ...body, title: "older", now: new Date("2026-01-01") }, dir);
  const target = createIssue({ ...body, title: "target", now: new Date("2026-01-02") }, dir);
  const claimed = nextIssue({ agent: "pi", id: target.id }, dir);
  assert.equal(claimed?.id, target.id);
  assert.equal(claimed?.status, "CLAIMED");
  assert.throws(() => nextIssue({ agent: "pi", id: "nope" }, dir), /Issue not found: nope/);
  assert.throws(() => nextIssue({ agent: "pi" }, dir), /project is required/);
});

test("ciclo AFK: IA reivindica, entrega evidência e fecha direto", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "afk" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  seedReview(dir, issue.id); // body é Review: satisfaz o gate
  await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito: passos e decisões", closed_reason: "concluido" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("ciclo HITL: IA envia para AWAITING e o humano decide", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "hitl", human_need: "HITL" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  seedReview(dir, issue.id); // gate satisfeito: a rejeição abaixo é da supervisão humana, não do gate
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir),
    /decisão humana/,
  );
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "evidência: relatório" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "AWAITING");
  decideIssue({ id: issue.id, human: true, status: "CLOSED", comment: "ok", closed_reason: "concluido" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("gate Planning: sem requirements a IA não conclui a Issue", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "plan", action: "Planning" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir),
    /sem requisitos.*issues requirements set/,
  );
  assert.equal(getIssue(issue.id, dir).status, "CLAIMED"); // nada foi aplicado
});

test("gate Implement: sem gate de entrega, fecha AFK só com a evidência", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "impl", action: "Implement" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("gate Review: sem intent/evidence/veredito a IA não conclui a Issue", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "qa", action: "Review" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir),
    /sem intent\.md.*issues artifact/,
  );
  assert.equal(getIssue(issue.id, dir).status, "CLAIMED"); // nada foi aplicado
  seedReview(dir, issue.id);
  await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("gate Deploy: nunca fecha AFK — CLOSED pela IA é barrado e orienta AWAITING", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "dep", action: "Deploy" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects( // mesmo com evidência de PR, o agente não fecha: só o humano decide
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "https://git/pr/1 SonarQube ok", closed_reason: "concluido" }, dir),
    /não fecha por agente.*AWAITING/,
  );
  assert.equal(getIssue(issue.id, dir).status, "CLAIMED");
});

test("gate Deploy: AWAITING exige link http(s) de PR e análise; só o decide humano fecha", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "dep2", action: "Deploy" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "pronto para subir" }, dir),
    /evidência de PR.*link http.*análise/,
  );
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "PR https://git/pr/9; SonarQube sem apontamentos" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "AWAITING");
  const decided = decideIssue({ id: issue.id, human: true, status: "CLOSED", comment: "go", closed_reason: "concluido" }, dir);
  assert.equal(decided.status, "CLOSED");
  assert.equal(decided.thread.at(-1)?.decided_by, "human"); // Code Review final auditado
});

test("status pela IA só aceita AWAITING ou CLOSED com reason", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "gate", artifact: "# qa ok" }, dir); // gate Review satisfeito
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "OPEN", comment: "x" }, dir),
    /use status AWAITING.*ou CLOSED/,
  );
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "x" }, dir),
    /Closed reason is required/,
  );
  await assert.rejects(statusIssue({ id: issue.id, human: true, agent: "pi", status: "CLOSED", comment: "x", closed_reason: "errado" }, dir),
    /Choose --human or --agent/);
});

test("humano fecha via status CLOSED e as demais combinações são rejeitadas", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "hclose" }, dir);
  await assert.rejects(
    statusIssue({ id: issue.id, human: true, status: "AWAITING", comment: "x" }, dir),
    /Human status supports CLOSED with reason/,
  );
  await statusIssue({ id: issue.id, human: true, status: "CLOSED", comment: "duplicada", closed_reason: "duplicado" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("relateIssues liga Issues existentes e a view carrega os artefatos relacionados", () => {
  const dir = root();
  const design = createIssue({ ...body, title: "design", action: "Design", artifact: "# spec congelada" }, dir);
  const impl = createIssue({ ...body, title: "impl", action: "Implement" }, dir);
  assert.throws(() => relateIssues({ id: impl.id, relates: ["nope"] }, dir), /Issue not found: nope/);
  relateIssues({ id: impl.id, relates: [design.id] }, dir);
  const view = getIssue(impl.id, dir);
  assert.deepEqual(view.relates, [{ id: design.id, kind: "see-also" }]); // default see-also
  assert.equal(view.related[0].title, "design");
  assert.equal(view.related[0].action, "Design");
  assert.equal(view.related[0].kind, "see-also");
  assert.equal(view.related[0].artifact, "# spec congelada");
});

test("relateIssues com kind=child grava a inversa parent na Issue alvo", () => {
  const dir = root();
  const design = createIssue({ ...body, title: "design", action: "Design" }, dir);
  const impl = createIssue({ ...body, title: "impl", action: "Implement" }, dir);
  relateIssues({ id: design.id, relates: [impl.id], kind: "child" }, dir);
  assert.deepEqual(getIssue(design.id, dir).relates, [{ id: impl.id, kind: "child" }]);
  assert.deepEqual(getIssue(impl.id, dir).relates, [{ id: design.id, kind: "parent" }]); // recíproca
});

test("createIssue com relates valida existência e persiste a linhagem", () => {
  const dir = root();
  const parent = createIssue({ ...body, title: "parent" }, dir);
  assert.throws(() => createIssue({ ...body, title: "orphan", relates: ["ghost"] }, dir), /Issue not found: ghost/);
  const child = createIssue({ ...body, title: "child", relates: [parent.id] }, dir);
  assert.deepEqual(getIssue(child.id, dir).relates, [{ id: parent.id, kind: "see-also" }]);
});

test("issueView expõe a cadeia de ancestrais subindo os parent", () => {
  const dir = root();
  const planning = createIssue({ ...body, title: "planning", action: "Planning" }, dir);
  const design = createIssue({ ...body, title: "design", action: "Design" }, dir);
  const impl = createIssue({ ...body, title: "impl", action: "Implement" }, dir);
  relateIssues({ id: planning.id, relates: [design.id], kind: "child" }, dir);
  relateIssues({ id: design.id, relates: [impl.id], kind: "child" }, dir);
  const ancestors = getIssue(impl.id, dir).ancestors;
  assert.deepEqual(ancestors.map((a) => a.title), ["design", "planning"]);
});

test("view omite relacionada purgada em vez de quebrar", () => {
  const dir = root();
  const parent = createIssue({ ...body, title: "parent" }, dir);
  const child = createIssue({ ...body, title: "child", relates: [parent.id] }, dir);
  const queue = new Queue(dir);
  const gone = queue.loadRequired(parent.id);
  gone.closeByHuman("limpa", "obsoleto", new Date("2026-01-01"));
  queue.save(gone);
  queue.purgeClosed(new Date("2026-07-14"));
  assert.deepEqual(getIssue(child.id, dir).related, []);
});

test("claimIssue humano leva OPEN a CLAIMED (teclado da web)", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "webclaim" }, dir);
  assert.equal(claimIssue({ id: issue.id }, dir).status, "CLAIMED");
});

test("decideIssue rejeita status inválido e exige --human", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "gate2" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  seedReview(dir, issue.id);
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "evidência" }, dir);
  assert.throws(() => decideIssue({ id: issue.id, human: true, status: "AWAITING", comment: "x" }, dir), /Invalid decision/);
  assert.throws(() => decideIssue({ id: issue.id, human: false, status: "OPEN", comment: "x" }, dir), /Decide requires --human/);
});

test("reset humano limpa o claim da Issue CLAIMED", () => {
  const dir = root();
  const issue = createIssue({ ...body, actor: "pi", title: "reset" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const reopened = resetClaim({ id: issue.id, human: true, comment: "liberar" }, dir);
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.owner, null);
  assert.throws(() => resetClaim({ id: issue.id, human: false, comment: "x" }, dir), /Reset requires --human/);
});

test("devolução para OPEN carrega imagem: reset e decide-open", async () => {
  const dir = root();
  const img = () => ({ filename: "shot.png", mediaType: "image/png", bytes: Buffer.from([137, 80, 78, 71, 3]) });
  const issue = createIssue({ ...body, actor: "pi", title: "dev" }, dir);
  seedReview(dir, issue.id);
  nextIssue({ agent: "pi", project: "app" }, dir); // -> CLAIMED
  const afterReset = resetClaim({ id: issue.id, human: true, comment: "liberar", attachments: [img()] }, dir);
  const resetEntry = afterReset.thread.at(-1)!;
  assert.equal(resetEntry.status, "OPEN");
  assert.equal(resetEntry.attachments?.[0].kind, "image");
  assert.ok(new Queue(dir).artifacts.findMedia(resetEntry.attachments![0].id));

  nextIssue({ agent: "pi", project: "app" }, dir);
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "evidência" }, dir);
  const reopened = decideIssue({ id: issue.id, human: true, status: "OPEN", comment: "voltar", attachments: [img()] }, dir);
  const entry = reopened.thread.at(-1)!;
  assert.equal(entry.status, "OPEN");
  assert.equal(entry.attachments?.[0].kind, "image");
});

test("list combina filtros por tipo", () => {
  const dir = root();
  createIssue({ ...body, type: "Fix", title: "Needle old", now: new Date("2026-01-01") }, dir);
  createIssue({ ...body, type: "Fix", title: "Needle new", now: new Date("2026-01-03") }, dir);
  createIssue({ ...body, type: "Feat", title: "Needle feat" }, dir);
  const filtered = listIssues({ project: "app", status: "OPEN", title: "needle", type: "Fix" }, dir);
  assert.deepEqual(filtered.map((issue) => issue.title).sort(), ["Needle new", "Needle old"]);
  assert.equal(filtered[0].type, "Fix");
});

test("summary do quadro traz action, status_changed_at, tags e relates", () => {
  const dir = root();
  const parent = createIssue({ ...body, title: "parent", now: new Date("2026-01-01") }, dir);
  const issue = createIssue({ ...body, title: "board", complexity: "ALTA", relates: [parent.id], now: new Date("2026-01-02") }, dir);
  const card = listIssues({ project: "app", title: "board" }, dir)[0];
  assert.equal(card.action, "Review");
  assert.equal(card.status_changed_at, getIssue(issue.id, dir).status_changed_at);
  assert.deepEqual(card.tags, { complexity: "ALTA" });
  assert.deepEqual(card.relates, [parent.id]);
});

test("setArtifact grava o .md da Issue; artefato na criação idem; view injeta", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "art", artifact: "# na criação" }, dir);
  const queue = new Queue(dir);
  assert.equal(queue.artifacts.readText("app", { issueId: issue.id, type: "document" }), "# na criação");
  setArtifact({ issueId: issue.id, content: "# issue doc" }, dir);
  assert.equal(queue.artifacts.readText("app", { issueId: issue.id, type: "document" }), "# issue doc");
  assert.equal(getIssue(issue.id, dir).artifact, "# issue doc");
  assert.equal(getIssue(createIssue({ ...body, title: "sem art" }, dir).id, dir).artifact, null);
});

test("setArtifact --name grava documento nomeado e barra nome inseguro (trust boundary)", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "named" }, dir);
  const queue = new Queue(dir);
  setArtifact({ issueId: issue.id, content: "# intenção", name: "intent.md" }, dir);
  assert.equal(queue.artifacts.readText("app", { issueId: issue.id, type: "document", name: "intent.md" }), "# intenção");
  assert.equal(queue.artifacts.readText("app", { issueId: issue.id, type: "document" }), null); // não tocou o legado
  for (const bad of ["../escapa.md", "sub/dir.md", "semext", "..", "evidence.txt"]) {
    assert.throws(() => setArtifact({ issueId: issue.id, content: "x", name: bad }, dir), /Nome de artefato inválido/);
  }
});

test("limite de 300 palavras vale para artefato (criação e setArtifact)", () => {
  const dir = root();
  assert.throws(() => createIssue({ ...body, title: "big", artifact: longText }, dir), /limite 300/);
  const issue = createIssue({ ...body, title: "ok" }, dir);
  assert.throws(() => setArtifact({ issueId: issue.id, content: longText }, dir), /limite 300/);
  assert.equal(getIssue(issue.id, dir).artifact, null); // nada foi gravado
});

test("createIssue com anexo: grava bytes e põe metadados na entrada 'Issue created'; valida mediaType", () => {
  const dir = root();
  const bytes = Buffer.from([137, 80, 78, 71, 5, 5]);
  const issue = createIssue({ ...body, title: "img",
    attachments: [{ filename: "erro.png", mediaType: "image/png", bytes }] }, dir);
  const first = issue.thread[0];
  assert.equal(first.comment, "Issue created");
  assert.equal(first.attachments?.length, 1);
  assert.equal(first.attachments?.[0].kind, "image");
  const found = new Queue(dir).artifacts.findMedia(first.attachments![0].id);
  assert.equal(found?.mediaType, "image/png");
  const plain = createIssue({ ...body, title: "sem img" }, dir);
  assert.equal(plain.thread[0].attachments, undefined);
  assert.throws(() => createIssue({ ...body, title: "bad",
    attachments: [{ filename: "a.txt", mediaType: "text/plain", bytes: Buffer.from("x") }] }, dir));
});

test("setArtifact em Issue CLOSED propaga DomainError do guard", async () => {
  const dir = root();
  const issue = createIssue({ ...body, actor: "pi", title: "closed", artifact: "# qa ok" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "x", closed_reason: "errado" }, dir);
  assert.throws(() => setArtifact({ issueId: issue.id, content: "nope" }, dir), /CLOSED aggregate is immutable/);
});

test("erros não persistem mutação parcial", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "safe", action: "Planning" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects(statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "x" }, dir));
  assert.equal(getIssue(issue.id, dir).status, "CLAIMED");
});

// updateTags é exportado: a CLI barra o actor ausente antes (--agent is required), mas o guard
// da camada de aplicação é o que protege qualquer outro chamador do mesmo buraco.
test("updateTags exige actor para taggear a Issue, e só o humano rebaixa", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "tags", complexity: "ALTA", risk: "ALTO" }, dir);
  assert.throws(() => updateTags({ issueId: issue.id, risk: "BAIXO" }, dir), /exige actor/);
  assert.throws(() => updateTags({ issueId: issue.id, actor: "pi", risk: "BAIXO" }, dir), /rebaixar risk/);
  assert.equal(getIssue(issue.id, dir).tags.risk, "ALTO"); // nada persistiu
  updateTags({ issueId: issue.id, actor: "pi", human_need: "HITL" }, dir); // escalar: livre
  updateTags({ issueId: issue.id, actor: "human", risk: "BAIXO" }, dir); // rebaixar: só humano
  assert.equal(getIssue(issue.id, dir).tags.risk, "BAIXO");
});

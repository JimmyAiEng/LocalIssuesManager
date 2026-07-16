import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  claimIssue, createIssue, decideIssue, getIssue, listIssues, nextIssue, resetClaim, setArtifact, statusIssue,
} from "../../src/app/issue_use_cases.js";
import { claimTicket, createTicket, decideTicket, getTicket, listTickets, statusTicket } from "../../src/app/ticket_use_cases.js";
import { Queue } from "../../src/domain/queue_repository.js";

const body = { project: "app", type: "Feat" as const, problem: "p", actor: "human" as const };
const ticketBody = { type: "Implement", objective: "o", task: "t", acceptance_criteria: "c" };
const root = () => mkdtempSync(join(tmpdir(), "issues-test-"));

const addTicket = (dir: string, issueId: string, actor = "pi") =>
  createTicket({ ...ticketBody, issueId, actor }, dir).tickets.at(-1)!.id;

const closeConfirmation = (dir: string, issueId: string, actor = "pi") => {
  const conf = getIssue(issueId, dir).tickets.find((t) => t.type === "Confirmation")!;
  claimTicket({ issueId, ticketId: conf.id, actor }, dir);
  statusTicket({ issueId, ticketId: conf.id, actor,
    status: "CLOSED", comment: "verificado", closed_reason: "concluido" }, dir);
};

test("next prioriza Ticket de Issue ON-GOING antes de abrir nova Issue", () => {
  const dir = root();
  const first = createIssue({ ...body, title: "first", now: new Date("2026-01-01") }, dir);
  createIssue({ ...body, title: "second", now: new Date("2026-01-02") }, dir);
  const claimedIssue = nextIssue({ agent: "pi", project: "app" }, dir);
  assert.equal(claimedIssue?.issue.id, first.id);
  assert.equal(claimedIssue?.ticket, null);
  const ticketId = addTicket(dir, first.id);
  const claimedTicket = nextIssue({ agent: "pi", project: "app" }, dir);
  assert.equal(claimedTicket?.issue.id, first.id);
  assert.equal(claimedTicket?.ticket?.id, ticketId);
  assert.equal(claimedTicket?.ticket?.status, "CLAIMED");
});

test("next cai para a Issue OPEN mais antiga quando não há Ticket pendente", () => {
  const dir = root();
  const older = createIssue({ ...body, title: "older", now: new Date("2026-01-01") }, dir);
  const newer = createIssue({ ...body, title: "newer", now: new Date("2026-01-02") }, dir);
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir)?.issue.id, older.id);
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir)?.issue.id, newer.id);
  assert.equal(nextIssue({ agent: "pi", project: "missing" }, dir), null);
});

test("next --id reivindica o Ticket pronto de uma Issue ON-GOING específica", () => {
  const dir = root();
  createIssue({ ...body, title: "older", now: new Date("2026-01-01") }, dir); // FIFO pegaria esta
  const target = createIssue({ ...body, title: "target", now: new Date("2026-01-02") }, dir);
  claimIssue({ id: target.id }, dir); // OPEN -> CLAIMED para poder criar Ticket
  const ticketId = addTicket(dir, target.id); // CLAIMED -> ON-GOING
  const claimed = nextIssue({ agent: "pi", id: target.id }, dir);
  assert.equal(claimed?.issue.id, target.id);
  assert.equal(claimed?.ticket?.id, ticketId);
  assert.equal(claimed?.ticket?.status, "CLAIMED");
});

test("next --id reivindica uma Issue OPEN para decomposição (ticket null)", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "decompose" }, dir);
  const claimed = nextIssue({ agent: "pi", id: issue.id }, dir);
  assert.equal(claimed?.issue.id, issue.id);
  assert.equal(claimed?.issue.status, "CLAIMED");
  assert.equal(claimed?.ticket, null);
});

test("next --id com id inexistente lança NotFound", () => {
  const dir = root();
  assert.throws(() => nextIssue({ agent: "pi", id: "nope" }, dir), /Issue not found: nope/);
});

test("next --id sem trabalho reivindicável lança DomainError", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "blocked" }, dir);
  claimIssue({ id: issue.id }, dir); // CLAIMED, ainda sem Ticket pronto e não OPEN
  assert.throws(() => nextIssue({ agent: "pi", id: issue.id }, dir), /não tem trabalho reivindicável/);
});

test("next sem --id mantém FIFO pela Issue mais antiga", () => {
  const dir = root();
  const older = createIssue({ ...body, title: "older", now: new Date("2026-01-01") }, dir);
  createIssue({ ...body, title: "newer", now: new Date("2026-01-02") }, dir);
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir)?.issue.id, older.id);
});

test("ciclo completo Issue+Ticket até CLOSED via decisão humana", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "life" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const ticketId = addTicket(dir, issue.id);
  nextIssue({ agent: "pi", project: "app" }, dir);
  statusTicket({ issueId: issue.id, ticketId, actor: "pi",
    status: "CLOSED", comment: "feito", closed_reason: "concluido", last: true }, dir);
  closeConfirmation(dir, issue.id); // avança a Issue para AWAITING
  decideIssue({ id: issue.id, human: true, status: "CLOSED", comment: "ok", closed_reason: "concluido" }, dir);
  const full = getIssue(issue.id, dir);
  assert.equal(full.status, "CLOSED");
  assert.equal(full.tickets[0].status, "CLOSED");
});

test("status AWAITING pela IA é rejeitado (avanço é automático ao fechar o Confirmation)", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "gate" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  addTicket(dir, issue.id);
  assert.throws(
    () => statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "x" }, dir),
    /IA status supports CLOSED with reason/,
  );
  assert.equal(getIssue(issue.id, dir).status, "ON-GOING");
});

test("CreateTicket recusa o tipo Confirmation (gerado pelo sistema)", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "guard" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  assert.throws(
    () => createTicket({ ...ticketBody, type: "Confirmation", issueId: issue.id, actor: "pi" }, dir),
    /Confirmation Tickets são gerados pelo sistema/,
  );
});

test("ClaimTicket humano, decisão humana e get/list de Tickets", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "tickets" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const ticketId = addTicket(dir, issue.id);
  claimTicket({ issueId: issue.id, ticketId, actor: "human" }, dir);
  statusTicket({ issueId: issue.id, ticketId, actor: "human",
    status: "AWAITING", comment: "revisar" }, dir);
  const reopened = decideTicket({ issueId: issue.id, ticketId, human: true,
    status: "OPEN", comment: "corrigir" }, dir);
  assert.equal(reopened.tickets[0].status, "OPEN");
  assert.equal(reopened.tickets[0].owner, null);
  const fetched = getTicket({ issueId: issue.id, ticketId }, dir);
  assert.equal(fetched.id, ticketId);
  const listed = listTickets({ issueId: issue.id, type: "Implement", status: "OPEN" }, dir);
  assert.equal(listed.length, 1);
  assert.equal(listTickets({ issueId: issue.id, status: "CLOSED" }, dir).length, 0);
});

test("CreateTicket humano propaga actor, artifacts, references e now", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "props" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const created = createTicket({ ...ticketBody, issueId: issue.id,
    actor: "human", artifacts: "src/x.ts", references: "T-1", now: new Date("2026-05-05") }, dir);
  const ticket = created.tickets.at(-1)!;
  assert.equal(ticket.thread[0].actor, "human");
  assert.equal(ticket.artifacts, "src/x.ts");
  assert.equal(ticket.references, "T-1");
  assert.equal(ticket.created_at, "2026-05-05T00:00:00.000Z");
});

test("Ticket decide exige --human e get de Ticket inexistente falha", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "auth" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const ticketId = addTicket(dir, issue.id);
  assert.throws(
    () => decideTicket({ issueId: issue.id, ticketId, human: false, status: "OPEN", comment: "x" }, dir),
    /Decide requires --human/,
  );
  assert.throws(
    () => getTicket({ issueId: issue.id, ticketId: "nope" }, dir),
    /Ticket not found: nope/,
  );
});

test("reset humano limpa o claim da Issue CLAIMED", () => {
  const dir = root();
  const issue = createIssue({ ...body, actor: "pi", title: "reset" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const reopened = resetClaim({ id: issue.id, human: true, comment: "liberar" }, dir);
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.owner, null);
  assert.throws(
    () => resetClaim({ id: issue.id, human: false, comment: "x" }, dir),
    /Reset requires --human/,
  );
});

test("devolução para OPEN carrega imagem: reset da Issue, decide-open e reopen do Ticket", () => {
  const dir = root();
  const img = () => ({ filename: "shot.png", mediaType: "image/png", bytes: Buffer.from([137, 80, 78, 71, 3]) });
  const issue = createIssue({ ...body, actor: "pi", title: "dev" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir); // -> CLAIMED
  const afterReset = resetClaim({ id: issue.id, human: true, comment: "liberar", attachments: [img()] }, dir);
  const resetEntry = afterReset.thread.at(-1)!;
  assert.equal(resetEntry.status, "OPEN");
  assert.equal(resetEntry.attachments?.[0].kind, "image");
  assert.ok(new Queue(dir).findAttachment(resetEntry.attachments![0].id));

  nextIssue({ agent: "pi", project: "app" }, dir); // re-claim para criar Ticket
  const ticketId = addTicket(dir, issue.id);
  claimTicket({ issueId: issue.id, ticketId, actor: "human" }, dir);
  statusTicket({ issueId: issue.id, ticketId, actor: "human", status: "AWAITING", comment: "revisar" }, dir);
  const tDecide = decideTicket({ issueId: issue.id, ticketId, human: true, status: "OPEN", comment: "voltar", attachments: [img()] }, dir);
  const decideEntry = tDecide.tickets.find((t) => t.id === ticketId)!.thread.at(-1)!;
  assert.equal(decideEntry.status, "OPEN");
  assert.equal(decideEntry.attachments?.[0].kind, "image");

  claimTicket({ issueId: issue.id, ticketId, actor: "human" }, dir);
  const tReopen = statusTicket({ issueId: issue.id, ticketId, actor: "human", status: "OPEN", comment: "reabrir", attachments: [img()] }, dir);
  const reopenEntry = tReopen.tickets.find((t) => t.id === ticketId)!.thread.at(-1)!;
  assert.equal(reopenEntry.status, "OPEN");
  assert.equal(reopenEntry.attachments?.[0].kind, "image");
});

test("decideIssue AWAITING→OPEN carrega imagem", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "dec" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const ticketId = addTicket(dir, issue.id);
  nextIssue({ agent: "pi", project: "app" }, dir); // claima o Ticket
  statusTicket({ issueId: issue.id, ticketId, actor: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido", last: true }, dir);
  closeConfirmation(dir, issue.id); // Issue -> AWAITING
  const reopened = decideIssue({ id: issue.id, human: true, status: "OPEN", comment: "voltar",
    attachments: [{ filename: "e.png", mediaType: "image/png", bytes: Buffer.from([137, 80, 78, 71, 4]) }] }, dir);
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

test("summary do quadro traz status_changed_at, tags e resumo mínimo de Tickets", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "board", complexity: "ALTA" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir); // OPEN -> CLAIMED
  const ticketId = addTicket(dir, issue.id); // CLAIMED -> ON-GOING
  const [card] = listIssues({ project: "app" }, dir);
  assert.equal(card.status_changed_at, getIssue(issue.id, dir).status_changed_at);
  assert.deepEqual(card.tags, { complexity: "ALTA" });
  assert.deepEqual(card.tickets, [{ id: ticketId, type: "Implement", status: "OPEN", owner: null }]);
});

test("setArtifact grava .md da Issue e do Ticket; createIssue/createTicket com artifact idem", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "art", artifact: "# na criação" }, dir);
  const queue = new Queue(dir);
  assert.equal(queue.readArtifact("app", issue.id), "# na criação");
  setArtifact({ issueId: issue.id, content: "# issue doc" }, dir);
  assert.equal(queue.readArtifact("app", issue.id), "# issue doc");
  nextIssue({ agent: "pi", project: "app" }, dir);
  const ticketId = addTicket(dir, issue.id);
  setArtifact({ issueId: issue.id, ticketId, content: "# ticket doc" }, dir);
  assert.equal(queue.readArtifact("app", ticketId), "# ticket doc");
  const withArt = createTicket({ ...ticketBody, issueId: issue.id, actor: "pi", artifact: "# ticket na criação" }, dir);
  assert.equal(queue.readArtifact("app", withArt.tickets.at(-1)!.id), "# ticket na criação");
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
  const found = new Queue(dir).findAttachment(first.attachments![0].id);
  assert.ok(found);
  assert.equal(found?.mediaType, "image/png");
  // sem anexo: entrada não ganha attachments
  const plain = createIssue({ ...body, title: "sem img" }, dir);
  assert.equal(plain.thread[0].attachments, undefined);
  // mediaType inválido é rejeitado antes de gravar
  assert.throws(() => createIssue({ ...body, title: "bad",
    attachments: [{ filename: "a.txt", mediaType: "text/plain", bytes: Buffer.from("x") }] }, dir));
});

test("createTicket com anexo: grava bytes e põe metadados na entrada 'Ticket created'", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "tk img" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const withImg = createTicket({ ...ticketBody, issueId: issue.id, actor: "pi",
    attachments: [{ filename: "diag.png", mediaType: "image/png", bytes: Buffer.from([137, 80, 78, 71, 1]) }] }, dir);
  const ticket = withImg.tickets.at(-1)!;
  assert.equal(ticket.thread[0].comment, "Ticket created");
  assert.equal(ticket.thread[0].attachments?.[0].kind, "image");
  assert.ok(new Queue(dir).findAttachment(ticket.thread[0].attachments![0].id));
});

test("slice C: get/next/getTicket injetam o Artefato nas views; sem artefato → null", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "views", artifact: "# issue art" }, dir);
  assert.equal(getIssue(issue.id, dir).artifact, "# issue art");
  const claimed = nextIssue({ agent: "pi", project: "app" }, dir); // Issue-só p/ decompor
  assert.equal(claimed?.issue.artifact, "# issue art");
  assert.equal(claimed?.ticket, null);
  const ticketId = addTicket(dir, issue.id);
  setArtifact({ issueId: issue.id, ticketId, content: "# ticket art" }, dir);
  const withTicket = nextIssue({ agent: "pi", project: "app" }, dir); // Issue+Ticket
  assert.equal(withTicket?.issue.artifact, "# issue art");
  assert.equal(withTicket?.ticket?.artifact, "# ticket art");
  assert.equal(withTicket?.ticket?.issue_artifact, "# issue art");
  const got = getTicket({ issueId: issue.id, ticketId }, dir);
  assert.equal(got.artifact, "# ticket art");
  assert.equal(got.issue_artifact, "# issue art");
  const view = getIssue(issue.id, dir); // web detail: cada Ticket carrega o próprio Artefato
  assert.equal(view.tickets.find((ticket) => ticket.id === ticketId)?.artifact, "# ticket art");
});

test("slice C: views trazem artifact null quando não há Artefato .md", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "sem art" }, dir);
  assert.equal(getIssue(issue.id, dir).artifact, null);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const ticketId = addTicket(dir, issue.id);
  const got = getTicket({ issueId: issue.id, ticketId }, dir);
  assert.equal(got.artifact, null);
  assert.equal(got.issue_artifact, null);
});

test("setArtifact em item CLOSED propaga DomainError do guard", () => {
  const dir = root();
  const issue = createIssue({ ...body, actor: "pi", title: "closed" }, dir);
  statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "x", closed_reason: "errado" }, dir);
  assert.throws(() => setArtifact({ issueId: issue.id, content: "nope" }, dir), /CLOSED aggregate is immutable/);
});

test("erros não persistem mutação parcial", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "safe" }, dir);
  assert.throws(() => statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "x" }, dir));
  assert.equal(getIssue(issue.id, dir).status, "OPEN");
});

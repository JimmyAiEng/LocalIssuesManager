import assert from "node:assert/strict";
import test from "node:test";
import { Attachment } from "../../src/domain/attachment_entity.js";
import { DomainError } from "../../src/domain/domain_error.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { Ticket } from "../../src/domain/ticket_entity.js";

const input = {
  title: "Implementar fila",
  project: "workflowdev",
  type: "Feat" as const,
  problem: "Não há fila",
};

const ticketFor = (issue: Issue, actor: "human" | "pi" | "codex" = "pi") =>
  Ticket.create({ issue_id: issue.id, objective: "o", task: "t", acceptance_criteria: "c",
    type: "Implement", actor });

const ongoing = (actor: "pi" | "codex" = "pi") => {
  const issue = Issue.create(input, "pi");
  issue.claim(actor);
  const ticket = ticketFor(issue, actor);
  issue.addTicket(ticket);
  return { issue, ticket };
};

test("cria Issue OPEN com defaults, revisão zero e sem Tickets", () => {
  const issue = Issue.create(input, "human", new Date("2026-01-01T00:00:00Z"));
  assert.equal(issue.status, "OPEN");
  assert.equal(issue.owner, null);
  assert.equal(issue.human_presence, true);
  assert.equal(issue.artifacts, "");
  assert.equal(issue.acceptance_criteria, "");
  assert.deepEqual(issue.tickets, []);
  assert.equal(issue.revision, 0);
  assert.equal(issue.baseRevision, 0);
  assert.deepEqual(issue.phases, [{ status: "OPEN", timestamp: "2026-01-01T00:00:00.000Z" }]);
});

test("campos obrigatórios rejeitam whitespace; artefatos são opcionais", () => {
  assert.throws(
    () => Issue.create({ ...input, problem: "   " }, "pi"),
    (error: unknown) => error instanceof DomainError && error.message === "problem is required",
  );
  const issue = Issue.create({ ...input, artifacts: "src/", acceptance_criteria: "ok" }, "pi");
  assert.equal(issue.artifacts, "src/");
  assert.equal(issue.acceptance_criteria, "ok");
});

test("claim leva OPEN a CLAIMED e incrementa a revisão", () => {
  const issue = Issue.create(input, "pi");
  issue.claim("codex");
  assert.equal(issue.status, "CLAIMED");
  assert.equal(issue.owner, "codex");
  assert.equal(issue.revision, 1);
  assert.equal(issue.thread.length, 1);
});

test("o primeiro Ticket move CLAIMED para ON-GOING sem thread de Issue", () => {
  const issue = Issue.create(input, "pi");
  issue.claim("pi");
  issue.addTicket(ticketFor(issue));
  assert.equal(issue.status, "ON-GOING");
  assert.equal(issue.tickets.length, 1);
  assert.equal(issue.thread.length, 1);
  assert.equal(issue.phases.at(-1)?.status, "ON-GOING");
  assert.equal(issue.revision, 2);
});

test("addTicket recusa fora de CLAIMED/ON-GOING e Ticket de outra Issue", () => {
  const open = Issue.create(input, "pi");
  assert.throws(() => open.addTicket(ticketFor(open)), /Expected CLAIMED or ON-GOING, got OPEN/);

  const { issue } = ongoing();
  const alheio = Ticket.create({ issue_id: "outra", objective: "o", task: "t",
    acceptance_criteria: "c", type: "QA", actor: "pi" });
  assert.throws(() => issue.addTicket(alheio), /Ticket belongs to another Issue/);
});

test("Tickets seguintes mantêm ON-GOING e apenas incrementam a revisão", () => {
  const { issue } = ongoing();
  const revision = issue.revision;
  issue.addTicket(ticketFor(issue));
  assert.equal(issue.status, "ON-GOING");
  assert.equal(issue.tickets.length, 2);
  assert.equal(issue.phases.at(-1)?.status, "ON-GOING");
  assert.equal(issue.revision, revision + 1);
});

test("claim/transition/decide de Ticket delegam à raiz e incrementam a revisão", () => {
  const issue = Issue.create(input, "pi");
  issue.claim("pi");
  const ticket = ticketFor(issue, "codex");
  issue.addTicket(ticket);
  let revision = issue.revision;
  issue.claimTicket(ticket.id, "codex");
  assert.equal(issue.tickets[0].status, "CLAIMED");
  assert.equal(issue.revision, ++revision);
  issue.transitionTicket(ticket.id, "codex", "AWAITING", "pronto");
  assert.equal(issue.tickets[0].status, "AWAITING");
  assert.equal(issue.revision, ++revision);
  issue.decideTicket(ticket.id, "CLOSED", "aceito", "concluido");
  assert.equal(issue.tickets[0].status, "CLOSED");
  assert.equal(issue.revision, ++revision);
});

test("operações de Ticket inexistente falham identificando o id", () => {
  const { issue } = ongoing();
  assert.throws(() => issue.claimTicket("nope", "pi"), /Ticket not found: nope/);
  assert.throws(() => issue.transitionTicket("nope", "pi", "OPEN", "x"), /Ticket not found: nope/);
  assert.throws(() => issue.decideTicket("nope", "OPEN", "x"), /Ticket not found: nope/);
});

test("await exige ON-GOING, dono e todos os Tickets CLOSED", () => {
  const claimedOnly = Issue.create(input, "pi");
  claimedOnly.claim("pi");
  assert.throws(() => claimedOnly.await("pi", "feito"), /Expected ON-GOING, got CLAIMED/);

  const { issue, ticket } = ongoing();
  assert.throws(() => issue.await("codex", "feito"), /Only the Owner may await/);
  assert.throws(() => issue.await("pi", "  "), /comment is required/);
  assert.throws(() => issue.await("pi", "feito"), /All Tickets must be CLOSED/);

  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido");
  issue.await("pi", "tudo pronto", new Date("2026-03-01T00:00:00Z"));
  assert.equal(issue.status, "AWAITING");
  assert.equal(issue.thread.at(-1)?.comment, "tudo pronto");
});

test("reset só age em CLAIMED e nunca em ON-GOING", () => {
  const reset = Issue.create(input, "pi");
  reset.claim("pi");
  reset.reset("abandono");
  assert.equal(reset.status, "OPEN");
  assert.equal(reset.owner, null);
  assert.equal(reset.claimed_at, null);
  assert.equal(reset.human_presence, true);

  const { issue } = ongoing();
  assert.throws(() => issue.reset("liberar"), /Expected CLAIMED, got ON-GOING/);
});

test("decisão humana fecha a Issue AWAITING com motivo", () => {
  const { issue, ticket } = ongoing();
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido");
  issue.await("pi", "entregue");
  issue.decide("CLOSED", "aceito", "concluido");
  assert.equal(issue.status, "CLOSED");
  assert.equal(issue.closed_reason, "concluido");
  assert.equal(issue.human_presence, true);
});

test("IA fecha OPEN apenas sem presença humana; CLOSED é imutável", () => {
  const machine = Issue.create(input, "pi");
  machine.closeByAgent("pi", "criada errada", "errado");
  assert.equal(machine.status, "CLOSED");
  assert.throws(() => machine.claim("pi"));

  const human = Issue.create(input, "human");
  assert.throws(() => human.closeByAgent("pi", "cancelar", "errado"), /Human presence prevents IA closure/);
  human.closeByHuman("", "errado");
  assert.equal(human.status, "CLOSED");
  assert.equal(human.closed_reason, "errado");
});

test("comment anexa entrada à thread sem mudar status nem exigir dono", () => {
  const { issue } = ongoing();
  const attachment = Attachment.create({ filename: "prova.png", mediaType: "image/png", size: 10 }).toJSON();
  const revision = issue.revision;
  issue.comment("codex", "vejam a evidência", [attachment], new Date("2026-05-01T00:00:00Z"));
  assert.equal(issue.status, "ON-GOING");
  assert.equal(issue.revision, revision + 1);
  const entry = issue.thread.at(-1)!;
  assert.deepEqual(entry, { actor: "codex", timestamp: "2026-05-01T00:00:00.000Z",
    comment: "vejam a evidência", status: "ON-GOING", closed_reason: null, attachments: [attachment] });
});

test("comment aceita só anexo sem texto, mas exige comentário ou anexo", () => {
  const { issue } = ongoing();
  const attachment = Attachment.create({ filename: "v.mp4", mediaType: "video/mp4", size: 10 }).toJSON();
  issue.comment("pi", "", [attachment]);
  assert.equal(issue.thread.at(-1)?.attachments?.length, 1);
  assert.throws(() => issue.comment("pi", "   ", []), /comment or attachment is required/);
});

test("comment é bloqueado quando a Issue está CLOSED (imutável)", () => {
  const issue = Issue.create(input, "pi");
  issue.closeByAgent("pi", "errada", "errado");
  assert.throws(() => issue.comment("pi", "tarde demais"), /CLOSED aggregate is immutable/);
});

test("commentTicket delega ao Ticket e incrementa a revisão da Issue", () => {
  const { issue, ticket } = ongoing();
  const revision = issue.revision;
  issue.commentTicket(ticket.id, "pi", "nota no ticket");
  assert.equal(issue.tickets[0].thread.at(-1)?.comment, "nota no ticket");
  assert.equal(issue.revision, revision + 1);
  assert.throws(() => issue.commentTicket("nope", "pi", "x"), /Ticket not found: nope/);
});

test("tag valida categoria/valor, mescla e incrementa a revisão", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ complexity: "ALTA" });
  issue.tag({ human_need: "AFK", risk: "BAIXO" });
  assert.deepEqual(issue.tags, { complexity: "ALTA", human_need: "AFK", risk: "BAIXO" });
  assert.equal(issue.revision, 2);
  assert.throws(() => issue.tag({ risk: "GIGANTE" }), (error: unknown) => error instanceof DomainError && error.message === "Invalid risk: GIGANTE");
  assert.throws(() => issue.tag({}), /At least one tag is required/);
});

test("tagTicket delega ao Ticket; CLOSED é imutável para tags", () => {
  const { issue, ticket } = ongoing();
  const revision = issue.revision;
  issue.tagTicket(ticket.id, { complexity: "MEDIA" });
  assert.deepEqual(issue.tickets[0].tags, { complexity: "MEDIA" });
  assert.equal(issue.revision, revision + 1);
  const closed = Issue.create(input, "pi");
  closed.closeByAgent("pi", "errada", "errado");
  assert.throws(() => closed.tag({ risk: "ALTO" }), /CLOSED aggregate is immutable/);
});

test("fromJSON hidrata Tickets como entidades e toJSON os serializa", () => {
  const { issue } = ongoing();
  const clone = Issue.fromJSON(issue.toJSON());
  assert.ok(clone.tickets[0] instanceof Ticket);
  assert.equal(clone.baseRevision, issue.revision);
  assert.equal("baseRevision" in issue.toJSON(), false);
  assert.deepEqual(clone.toJSON(), issue.toJSON());
});

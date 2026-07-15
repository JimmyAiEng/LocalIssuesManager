import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import { Ticket } from "../../src/domain/ticket_entity.js";

const input = {
  issue_id: "issue-1",
  objective: "Entregar fatia",
  task: "Codificar fila",
  acceptance_criteria: "FIFO",
  type: "Implement" as const,
  actor: "pi" as const,
};

const claimed = (actor: "human" | "pi" | "codex" = "pi") => {
  const ticket = Ticket.create(input);
  ticket.claim(actor);
  return ticket;
};

test("cria Ticket OPEN com defaults e entrada na thread", () => {
  const ticket = Ticket.create(input, new Date("2026-01-01T00:00:00Z"));
  assert.equal(ticket.status, "OPEN");
  assert.equal(ticket.owner, null);
  assert.equal(ticket.artifacts, "");
  assert.equal(ticket.references, "");
  assert.equal(ticket.closed_reason, null);
  assert.equal(ticket.issue_id, "issue-1");
  assert.deepEqual(ticket.thread, [{
    actor: "pi", timestamp: "2026-01-01T00:00:00.000Z", comment: "Ticket created",
    status: "OPEN", closed_reason: null,
  }]);
});

test("campos obrigatórios rejeitam whitespace identificando o campo", () => {
  for (const key of ["issue_id", "objective", "task", "acceptance_criteria"] as const) {
    assert.throws(
      () => Ticket.create({ ...input, [key]: "  " }),
      (error: unknown) => error instanceof DomainError && error.message === `${key} is required`,
    );
  }
});

test("claim grava owner sem criar thread e recusa fora de OPEN", () => {
  const ticket = claimed("codex");
  assert.equal(ticket.status, "CLAIMED");
  assert.equal(ticket.owner, "codex");
  assert.equal(ticket.thread.length, 1);
  assert.throws(() => ticket.claim("pi"), /Expected OPEN, got CLAIMED/);
});

test("changeStatus exige owner e comentário e respeita a matriz", () => {
  assert.throws(() => Ticket.create(input).changeStatus("pi", "AWAITING", "x"), /Expected CLAIMED, got OPEN/);
  assert.throws(() => claimed().changeStatus("codex", "AWAITING", "x"), /Only the Owner may change status/);
  assert.throws(() => claimed().changeStatus("pi", "CLAIMED", "x"), /Invalid ticket transition/);
  assert.throws(() => claimed().changeStatus("pi", "AWAITING", "  "), /comment is required/);
  assert.throws(() => claimed().changeStatus("pi", "CLOSED", "fim"), /Closed reason is required/);
  assert.throws(() => claimed().changeStatus("pi", "OPEN", "volta", "errado"), /OPEN cannot have a closed reason/);
});

test("changeStatus para AWAITING mantém owner e registra a thread", () => {
  const ticket = claimed();
  ticket.changeStatus("pi", "AWAITING", "revisar", undefined, false, new Date("2026-01-02T00:00:00Z"));
  assert.equal(ticket.status, "AWAITING");
  assert.equal(ticket.owner, "pi");
  assert.equal(ticket.thread.at(-1)?.comment, "revisar");
  assert.equal(ticket.status_changed_at, "2026-01-02T00:00:00.000Z");
});

test("changeStatus devolve à fila limpando owner e fecha com motivo", () => {
  const returned = claimed();
  returned.changeStatus("pi", "OPEN", "devolver");
  assert.equal(returned.status, "OPEN");
  assert.equal(returned.owner, null);

  const closed = claimed();
  closed.changeStatus("pi", "CLOSED", "feito", "concluido");
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closed_reason, "concluido");
  assert.equal(closed.owner, "pi");
});

test("owner humano transiciona o próprio Ticket", () => {
  const ticket = claimed("human");
  ticket.changeStatus("human", "CLOSED", "encerrado", "concluido");
  assert.equal(ticket.status, "CLOSED");
  assert.equal(ticket.owner, "human");
});

test("decide humano só age em AWAITING e valida comment/reason", () => {
  const awaiting = () => {
    const ticket = claimed();
    ticket.changeStatus("pi", "AWAITING", "pronto");
    return ticket;
  };
  assert.throws(() => claimed().decide("OPEN", "x"), /Expected AWAITING, got CLAIMED/);
  assert.throws(() => awaiting().decide("CLOSED", "ok"), /Closed reason is required/);
  assert.throws(() => awaiting().decide("OPEN", "corrigir", "errado"), /OPEN cannot have a closed reason/);
  assert.throws(() => awaiting().decide("OPEN", "  "), /comment is required/);

  const reopened = awaiting();
  reopened.decide("OPEN", "revisar");
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.owner, null);

  const closed = awaiting();
  closed.decide("CLOSED", "", "concluido");
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closed_reason, "concluido");
});

test("comment anexa entrada mantendo status, sem exigir dono, e exige conteúdo", () => {
  const ticket = claimed();
  ticket.comment("codex", "evidência", [], new Date("2026-05-01T00:00:00Z"));
  const entry = ticket.thread.at(-1)!;
  assert.equal(ticket.status, "CLAIMED");
  assert.equal(entry.comment, "evidência");
  assert.equal(entry.status, "CLAIMED");
  assert.deepEqual(entry.attachments, []);
  assert.throws(() => ticket.comment("pi", "  ", []), /comment or attachment is required/);
});

test("comment é bloqueado quando o Ticket está CLOSED", () => {
  const ticket = claimed();
  ticket.changeStatus("pi", "CLOSED", "feito", "concluido");
  assert.throws(() => ticket.comment("pi", "tarde"), /CLOSED aggregate is immutable/);
});

test("fromJSON e toJSON preservam o Ticket", () => {
  const ticket = claimed();
  const clone = Ticket.fromJSON(ticket.toJSON());
  assert.deepEqual(clone.toJSON(), ticket.toJSON());
  assert.notEqual(clone, ticket);
});

test("last nasce false e é serializado por toJSON", () => {
  const ticket = Ticket.create(input);
  assert.equal(ticket.last, false);
  assert.equal(ticket.toJSON().last, false);
});

test("changeStatus com last=true marca a flag; é sticky (||=) e não regride", () => {
  const marked = claimed();
  marked.changeStatus("pi", "AWAITING", "pronto", undefined, true);
  assert.equal(marked.last, true);
  // uma transição posterior sem last não apaga a marca
  marked.decide("OPEN", "revisar");
  assert.equal(marked.last, true);
});

test("last sobrevive AWAITING → decide, e decide pode marcá-la", () => {
  const ticket = claimed();
  ticket.changeStatus("pi", "AWAITING", "pronto");
  assert.equal(ticket.last, false);
  ticket.decide("CLOSED", "", "concluido", true);
  assert.equal(ticket.last, true);
});

test("Ticket legado sem last hidrata como false", () => {
  const { last, ...legacy } = Ticket.create(input).toJSON();
  const ticket = Ticket.fromJSON(legacy as never);
  assert.equal(ticket.last, false);
});

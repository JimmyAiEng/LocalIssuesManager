import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import { Issue } from "../../src/domain/issue_entity.js";

const input = {
  title: "Implementar fila",
  project: "workflowdev",
  tag: "Implement" as const,
  problem: "Não há fila",
  artifacts: "src/",
  acceptance_criteria: "FIFO funciona",
};

test("cria Issue OPEN com campos obrigatórios e presença humana", () => {
  const issue = Issue.create(input, "human", new Date("2026-01-01T00:00:00Z"));
  assert.equal(issue.status, "OPEN");
  assert.equal(issue.owner, null);
  assert.equal(issue.human_presence, true);
  assert.deepEqual(issue.thread, [{
    actor: "human", timestamp: "2026-01-01T00:00:00.000Z", comment: "Issue created",
    status: "OPEN", closed_reason: null,
  }]);
  assert.deepEqual(issue.phases, [{ status: "OPEN", timestamp: "2026-01-01T00:00:00.000Z" }]);
});

test("campos obrigatórios rejeitam whitespace com mensagem identificável", () => {
  assert.throws(
    () => Issue.create({ ...input, problem: "   " }, "pi"),
    (error: unknown) => error instanceof DomainError && error.message === "problem is required",
  );
});

test("claim não cria Thread e somente owner move para AWAITING", () => {
  const issue = Issue.create(input, "pi", new Date("2026-01-01T00:00:00Z"));
  issue.claim("codex", new Date("2026-01-01T01:00:00Z"));
  assert.equal(issue.thread.length, 1);
  assert.throws(
    () => issue.await("pi", "feito"),
    (error: unknown) => error instanceof DomainError && error.message === "Only the Owner may await",
  );
  issue.await("codex", "feito", new Date("2026-01-01T02:00:00Z"));
  assert.equal(issue.status, "AWAITING");
  assert.equal(issue.thread.at(-1)?.comment, "feito");
});

test("reset humano limpa owner e decisão humana fecha AWAITING", () => {
  const reset = Issue.create(input, "pi");
  reset.claim("pi");
  reset.reset("abandono");
  assert.equal(reset.status, "OPEN");
  assert.equal(reset.owner, null);
  assert.equal(reset.claimed_at, null);
  assert.equal(reset.human_presence, true);

  const rejected = Issue.create(input, "pi");
  rejected.claim("pi");
  rejected.await("pi", "entregue");
  rejected.decide("OPEN", "corrigir");
  assert.equal(rejected.owner, null);
  assert.equal(rejected.claimed_at, null);

  const issue = Issue.create(input, "pi");
  issue.claim("pi");
  issue.await("pi", "entregue");
  issue.decide("CLOSED", "aceito", "concluido");
  assert.equal(issue.status, "CLOSED");
  assert.equal(issue.closed_reason, "concluido");
  assert.equal(issue.owner, "pi");
  assert.equal(issue.human_presence, true);
});

test("decisão valida razão fechada e comentário sem alterar o estado", () => {
  const issue = Issue.create(input, "pi");
  issue.claim("pi");
  issue.await("pi", "pronto");
  assert.throws(() => issue.decide("CLOSED", "ok"), /Closed reason is required/);
  assert.throws(() => issue.decide("OPEN", "corrigir", "errado"), /OPEN cannot have a closed reason/);
  assert.throws(() => issue.decide("OPEN", ""), /comment is required/);
  assert.equal(issue.status, "AWAITING");
});

test("aplica proibições da matriz e valida comentário", () => {
  const claimed = Issue.create(input, "pi");
  claimed.claim("pi");
  assert.throws(
    () => claimed.closeByAgent("pi", "cancelar", "errado"),
    /Expected OPEN, got CLAIMED/,
  );
  assert.throws(() => claimed.reset(""), /comment is required/);

  const awaiting = Issue.create(input, "pi");
  awaiting.claim("pi");
  awaiting.await("pi", "feito");
  assert.throws(() => awaiting.closeByAgent("pi", "aceitar", "concluido"));
});

test("IA fecha OPEN apenas sem presença humana; CLOSED é imutável", () => {
  const machine = Issue.create(input, "pi");
  machine.closeByAgent("pi", "criada errada", "errado");
  assert.equal(machine.status, "CLOSED");
  assert.throws(() => machine.claim("pi"));

  const human = Issue.create(input, "human");
  assert.throws(() => human.closeByAgent("pi", "cancelar", "errado"), /Human presence prevents IA closure/);
  assert.throws(() => human.closeByHuman("", "errado"), /comment is required/);
  human.closeByHuman("cancelar", "errado");
  assert.equal(human.status, "CLOSED");
  assert.equal(human.human_presence, true);
});

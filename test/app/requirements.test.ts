import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { claimIssue, createIssue } from "../../src/app/issue_use_cases.js";
import { getRequirements, setRequirements } from "../../src/app/requirements_use_cases.js";
import { claimTicket, createTicket, statusTicket } from "../../src/app/ticket_use_cases.js";
import { DomainError, NotFoundError } from "../../src/domain/domain_error.js";

// Issue classificada: a criação de Ticket exige risk+complexity para derivar a autonomia.
const body = { project: "app", type: "Feat" as const, problem: "p", actor: "human" as const,
  complexity: "BAIXA", risk: "BAIXO" };
const root = () => mkdtempSync(join(tmpdir(), "issues-req-"));

const VALID = JSON.stringify({
  features: ["Feature: Login\n  Como um usuário\n  Eu quero poder entrar\n  Para que eu acesse\n\n  Scenario: ok\n    Given a tela\n    When entro\n    Then vejo o painel"],
});
const INVALID = JSON.stringify({ features: ["Feature: Login\n  Scenario: sem user story\n    Given a"] });

const reqFile = (dir: string, content: string): string => {
  const path = join(dir, "req.json");
  writeFileSync(path, content, "utf8");
  return path;
};

// Cria uma Issue com um Ticket Planning CLAIMED por pi, pronto para transitar.
const planningClaimed = (dir: string): { issueId: string; ticketId: string } => {
  const issue = createIssue({ ...body, title: "t" }, dir);
  claimIssue({ id: issue.id }, dir);
  const ticketId = createTicket(
    { issueId: issue.id, type: "Planning", objective: "o", task: "t", acceptance_criteria: "c", actor: "pi" },
    dir,
  ).tickets.at(-1)!.id;
  claimTicket({ issueId: issue.id, ticketId, actor: "pi" }, dir);
  return { issueId: issue.id, ticketId };
};

test("setRequirements persiste JSON Gherkin válido e getRequirements devolve", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  const saved = setRequirements({ issueId: issue.id, file: reqFile(dir, VALID) }, dir);
  assert.equal(saved.features.length, 1);
  assert.deepEqual(getRequirements({ issueId: issue.id }, dir), saved);
});

test("setRequirements rejeita JSON inválido e nada é persistido", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  assert.throws(() => setRequirements({ issueId: issue.id, file: reqFile(dir, INVALID) }, dir),
    (e: unknown) => e instanceof DomainError);
  assert.throws(() => getRequirements({ issueId: issue.id }, dir),
    (e: unknown) => e instanceof NotFoundError);
});

test("getRequirements erro claro quando inexistente", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  assert.throws(() => getRequirements({ issueId: issue.id }, dir),
    (e: unknown) => e instanceof NotFoundError && /não encontrado/.test(e.message));
});

test("gate: Planning não vai a AWAITING sem requisitos válidos", async () => {
  const dir = root();
  const { issueId, ticketId } = planningClaimed(dir);
  await assert.rejects(
    statusTicket({ issueId, ticketId, actor: "pi", status: "AWAITING", comment: "fim" }, dir),
    (e: unknown) => e instanceof NotFoundError && /sem requisitos/.test(e.message),
  );
});

test("gate: Planning vai a AWAITING com requisitos válidos persistidos", async () => {
  const dir = root();
  const { issueId, ticketId } = planningClaimed(dir);
  setRequirements({ issueId, file: reqFile(dir, VALID) }, dir);
  const issue = await statusTicket({ issueId, ticketId, actor: "pi", status: "AWAITING", comment: "fim" }, dir);
  assert.equal(issue.tickets.find((t) => t.id === ticketId)!.status, "AWAITING");
});

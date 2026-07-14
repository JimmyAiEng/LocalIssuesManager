import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ClaimTicketUseCase } from "../../src/app/claim_ticket_use_case.js";
import { CreateIssueUseCase } from "../../src/app/create_issue_use_case.js";
import { CreateTicketUseCase } from "../../src/app/create_ticket_use_case.js";
import { DecideIssueUseCase } from "../../src/app/decide_issue_use_case.js";
import { DecideTicketUseCase } from "../../src/app/decide_ticket_use_case.js";
import { GetIssueUseCase } from "../../src/app/get_issue_use_case.js";
import { GetTicketUseCase } from "../../src/app/get_ticket_use_case.js";
import { ListIssuesUseCase } from "../../src/app/list_issues_use_case.js";
import { ListTicketsUseCase } from "../../src/app/list_tickets_use_case.js";
import { NextIssueUseCase } from "../../src/app/next_issue_use_case.js";
import { ResetClaimUseCase } from "../../src/app/reset_claim_use_case.js";
import { StatusIssueUseCase } from "../../src/app/status_issue_use_case.js";
import { StatusTicketUseCase } from "../../src/app/status_ticket_use_case.js";

const body = { project: "app", type: "Feat" as const, problem: "p", actor: "human" as const };
const ticketBody = { type: "Implement", objective: "o", task: "t", acceptance_criteria: "c" };
const root = () => mkdtempSync(join(tmpdir(), "issues-test-"));

const addTicket = (dir: string, issueId: string, actor = "pi") =>
  new CreateTicketUseCase(dir).execute({ ...ticketBody, issueId, actor }).tickets.at(-1)!.id;

const closeConfirmation = (dir: string, issueId: string, actor = "pi") => {
  const conf = new GetIssueUseCase(dir).execute(issueId).tickets.find((t) => t.type === "Confirmation")!;
  new ClaimTicketUseCase(dir).execute({ issueId, ticketId: conf.id, actor });
  new StatusTicketUseCase(dir).execute({ issueId, ticketId: conf.id, actor,
    status: "CLOSED", comment: "verificado", closed_reason: "concluido" });
};

test("next prioriza Ticket de Issue ON-GOING antes de abrir nova Issue", () => {
  const dir = root();
  const create = new CreateIssueUseCase(dir);
  const first = create.execute({ ...body, title: "first", now: new Date("2026-01-01") });
  create.execute({ ...body, title: "second", now: new Date("2026-01-02") });
  const claimedIssue = new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  assert.equal(claimedIssue?.issue.id, first.id);
  assert.equal(claimedIssue?.ticket, null);
  const ticketId = addTicket(dir, first.id);
  const claimedTicket = new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  assert.equal(claimedTicket?.issue.id, first.id);
  assert.equal(claimedTicket?.ticket?.id, ticketId);
  assert.equal(claimedTicket?.ticket?.status, "CLAIMED");
});

test("next cai para a Issue OPEN mais antiga quando não há Ticket pendente", () => {
  const dir = root();
  const create = new CreateIssueUseCase(dir);
  const older = create.execute({ ...body, title: "older", now: new Date("2026-01-01") });
  const newer = create.execute({ ...body, title: "newer", now: new Date("2026-01-02") });
  assert.equal(new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" })?.issue.id, older.id);
  assert.equal(new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" })?.issue.id, newer.id);
  assert.equal(new NextIssueUseCase(dir).execute({ agent: "pi", project: "missing" }), null);
});

test("ciclo completo Issue+Ticket até CLOSED via decisão humana", () => {
  const dir = root();
  const issue = new CreateIssueUseCase(dir).execute({ ...body, title: "life" });
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  const ticketId = addTicket(dir, issue.id);
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  new StatusTicketUseCase(dir).execute({ issueId: issue.id, ticketId, actor: "pi",
    status: "CLOSED", comment: "feito", closed_reason: "concluido" });
  closeConfirmation(dir, issue.id);
  new StatusIssueUseCase(dir).execute({ id: issue.id, agent: "pi", status: "AWAITING", comment: "pronto" });
  new DecideIssueUseCase(dir).execute({ id: issue.id, human: true, status: "CLOSED", comment: "ok", closed_reason: "concluido" });
  const full = new GetIssueUseCase(dir).execute(issue.id);
  assert.equal(full.status, "CLOSED");
  assert.equal(full.tickets[0].status, "CLOSED");
});

test("await da Issue é recusado enquanto houver Ticket não CLOSED", () => {
  const dir = root();
  const issue = new CreateIssueUseCase(dir).execute({ ...body, title: "gate" });
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  addTicket(dir, issue.id);
  assert.throws(
    () => new StatusIssueUseCase(dir).execute({ id: issue.id, agent: "pi", status: "AWAITING", comment: "x" }),
    /All Tickets must be CLOSED/,
  );
  assert.equal(new GetIssueUseCase(dir).execute(issue.id).status, "ON-GOING");
});

test("CreateTicket recusa o tipo Confirmation (gerado pelo sistema)", () => {
  const dir = root();
  const issue = new CreateIssueUseCase(dir).execute({ ...body, title: "guard" });
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  assert.throws(
    () => new CreateTicketUseCase(dir).execute({ ...ticketBody, type: "Confirmation", issueId: issue.id, actor: "pi" }),
    /Confirmation Tickets são gerados pelo sistema/,
  );
});

test("ClaimTicket humano, decisão humana e get/list de Tickets", () => {
  const dir = root();
  const issue = new CreateIssueUseCase(dir).execute({ ...body, title: "tickets" });
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  const ticketId = addTicket(dir, issue.id);
  new ClaimTicketUseCase(dir).execute({ issueId: issue.id, ticketId, actor: "human" });
  new StatusTicketUseCase(dir).execute({ issueId: issue.id, ticketId, actor: "human",
    status: "AWAITING", comment: "revisar" });
  const reopened = new DecideTicketUseCase(dir).execute({ issueId: issue.id, ticketId, human: true,
    status: "OPEN", comment: "corrigir" });
  assert.equal(reopened.tickets[0].status, "OPEN");
  assert.equal(reopened.tickets[0].owner, null);
  const fetched = new GetTicketUseCase(dir).execute({ issueId: issue.id, ticketId });
  assert.equal(fetched.id, ticketId);
  const listed = new ListTicketsUseCase(dir).execute({ issueId: issue.id, type: "Implement", status: "OPEN" });
  assert.equal(listed.length, 1);
  assert.equal(new ListTicketsUseCase(dir).execute({ issueId: issue.id, status: "CLOSED" }).length, 0);
});

test("CreateTicket humano propaga actor, artifacts, references e now", () => {
  const dir = root();
  const issue = new CreateIssueUseCase(dir).execute({ ...body, title: "props" });
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  const created = new CreateTicketUseCase(dir).execute({ ...ticketBody, issueId: issue.id,
    actor: "human", artifacts: "src/x.ts", references: "T-1", now: new Date("2026-05-05") });
  const ticket = created.tickets.at(-1)!;
  assert.equal(ticket.thread[0].actor, "human");
  assert.equal(ticket.artifacts, "src/x.ts");
  assert.equal(ticket.references, "T-1");
  assert.equal(ticket.created_at, "2026-05-05T00:00:00.000Z");
});

test("Ticket decide exige --human e get de Ticket inexistente falha", () => {
  const dir = root();
  const issue = new CreateIssueUseCase(dir).execute({ ...body, title: "auth" });
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  const ticketId = addTicket(dir, issue.id);
  assert.throws(
    () => new DecideTicketUseCase(dir).execute({ issueId: issue.id, ticketId, human: false, status: "OPEN", comment: "x" }),
    /Decide requires --human/,
  );
  assert.throws(
    () => new GetTicketUseCase(dir).execute({ issueId: issue.id, ticketId: "nope" }),
    /Ticket not found: nope/,
  );
});

test("reset humano limpa o claim da Issue CLAIMED", () => {
  const dir = root();
  const issue = new CreateIssueUseCase(dir).execute({ ...body, actor: "pi", title: "reset" });
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  const reopened = new ResetClaimUseCase(dir).execute({ id: issue.id, human: true, comment: "liberar" });
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.owner, null);
  assert.throws(
    () => new ResetClaimUseCase(dir).execute({ id: issue.id, human: false, comment: "x" }),
    /Reset requires --human/,
  );
});

test("list combina filtros por tipo e paginação", () => {
  const dir = root();
  const create = new CreateIssueUseCase(dir);
  create.execute({ ...body, type: "Fix", title: "Needle old", now: new Date("2026-01-01") });
  create.execute({ ...body, type: "Fix", title: "Needle new", now: new Date("2026-01-03") });
  create.execute({ ...body, type: "Feat", title: "Needle feat" });
  const list = new ListIssuesUseCase(dir);
  const filtered = list.execute({ project: "app", status: "OPEN", title: "needle", type: "Fix" });
  assert.deepEqual(filtered.map((issue) => issue.title).sort(), ["Needle new", "Needle old"]);
  assert.equal(filtered[0].type, "Fix");
  assert.deepEqual(
    list.execute({ project: "app", status: "OPEN", type: "Fix", offset: 1, limit: 1 }).map((issue) => issue.id),
    [filtered[1].id],
  );
});

test("erros não persistem mutação parcial", () => {
  const dir = root();
  const issue = new CreateIssueUseCase(dir).execute({ ...body, title: "safe" });
  assert.throws(() => new StatusIssueUseCase(dir).execute({ id: issue.id, agent: "pi", status: "AWAITING", comment: "x" }));
  assert.equal(new GetIssueUseCase(dir).execute(issue.id).status, "OPEN");
});

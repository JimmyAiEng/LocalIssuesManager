import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { Ticket, type CreateTicket } from "../../src/domain/ticket_entity.js";
import type { HumanNeed, TicketType } from "../../src/domain/value_objects.js";

const issueBody = { title: "t", project: "app", type: "Feat" as const, problem: "p" };
const ticketBody = { objective: "o", task: "t", acceptance_criteria: "c", actor: "pi" as const };

// Issue CLAIMED com (ou sem) tag de autonomia, pronta para receber Tickets.
const issueWith = (humanNeed?: HumanNeed) => {
  const issue = Issue.create(issueBody, "human");
  issue.claim("pi");
  if (humanNeed) issue.tag({ human_need: humanNeed });
  return issue;
};

const ticket = (issueId: string, type: TicketType, humanNeed?: HumanNeed): Ticket =>
  Ticket.create({ ...ticketBody, issue_id: issueId, type, human_need: humanNeed } as CreateTicket);

test("Issue HITL: Planning como AFK é rejeitado, HITL é aceito", () => {
  const issue = issueWith("HITL");
  assert.throws(
    () => issue.addTicket(ticket(issue.id, "Planning", "AFK")),
    (e: unknown) => e instanceof DomainError && /Planning deve ser HITL/.test(e.message),
  );
  issue.addTicket(ticket(issue.id, "Planning", "HITL"));
  assert.equal(issue.tickets.at(-1)!.tags.human_need, "HITL");
});

test("Issue HITL: Design como AFK é rejeitado", () => {
  const issue = issueWith("HITL");
  assert.throws(() => issue.addTicket(ticket(issue.id, "Design", "AFK")), /Design deve ser HITL/);
});

test("Issue HITL: Implement como AFK é aceito", () => {
  const issue = issueWith("HITL");
  issue.addTicket(ticket(issue.id, "Implement", "AFK"));
  assert.equal(issue.tickets.at(-1)!.tags.human_need, "AFK");
});

test("Issue HITL: Ticket sem tag de autonomia é rejeitado", () => {
  const issue = issueWith("HITL");
  assert.throws(() => issue.addTicket(ticket(issue.id, "Implement")), /precisa da tag de autonomia/);
});

test("Issue HITL: re-taguear Planning para AFK também é rejeitado", () => {
  const issue = issueWith("HITL");
  issue.addTicket(ticket(issue.id, "Planning", "HITL"));
  const planningId = issue.tickets.at(-1)!.id;
  assert.throws(() => issue.tagTicket(planningId, { human_need: "AFK" }), /Planning deve ser HITL/);
});

test("Issue AFK ou sem tag: sem restrição de autonomia", () => {
  const afk = issueWith("AFK");
  afk.addTicket(ticket(afk.id, "Planning")); // Planning sem tag numa Issue AFK: aceito
  assert.ok(afk.tickets.at(-1));

  const untagged = issueWith();
  untagged.addTicket(ticket(untagged.id, "Design")); // Design sem tag numa Issue sem autonomia: aceito
  assert.ok(untagged.tickets.at(-1));
});

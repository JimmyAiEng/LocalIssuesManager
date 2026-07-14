import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import {
  AGENT_IDS, CLOSED_REASONS, ISSUE_STATUSES, ISSUE_TYPES, TICKET_STATUSES, TICKET_TYPES,
  parseAgentId, parseClosedReason, parseIssueStatus, parseIssueType, parseTicketStatus, parseTicketType,
} from "../../src/domain/value_objects.js";

const cases = [
  [ISSUE_TYPES, parseIssueType], [TICKET_TYPES, parseTicketType],
  [ISSUE_STATUSES, parseIssueStatus], [TICKET_STATUSES, parseTicketStatus],
  [AGENT_IDS, parseAgentId], [CLOSED_REASONS, parseClosedReason],
] as const;

test("VOs aceitam somente os enums exatos", () => {
  for (const [values, parse] of cases) {
    for (const value of values) assert.equal(parse(value), value);
    assert.throws(() => parse("invalid" as never));
    assert.throws(() => parse("" as never));
  }
});

test("enums novos carregam exatamente os valores esperados", () => {
  assert.deepEqual([...ISSUE_TYPES], ["Fix", "Feat", "Research", "Refactor"]);
  assert.deepEqual([...TICKET_TYPES], ["Planning", "Design", "Implement", "QA", "Deploy", "Confirmation"]);
  assert.deepEqual([...ISSUE_STATUSES], ["OPEN", "CLAIMED", "ON-GOING", "AWAITING", "CLOSED"]);
  assert.deepEqual([...TICKET_STATUSES], ["OPEN", "CLAIMED", "AWAITING", "CLOSED"]);
  assert.throws(() => parseTicketStatus("ON-GOING"), /Invalid ticket status: ON-GOING/);
});

test("VOs identificam o enum inválido nas mensagens de domínio", () => {
  const invalid = (parse: (value: string) => unknown, message: string) => {
    assert.throws(
      () => parse("bad"),
      (error: unknown) => error instanceof DomainError
        && error.name === "DomainError"
        && error.message === message,
    );
  };
  invalid(parseAgentId, "Invalid IA: bad");
  invalid(parseClosedReason, "Invalid closed reason: bad");
  invalid(parseIssueStatus, "Invalid status: bad");
  invalid(parseTicketStatus, "Invalid ticket status: bad");
  invalid(parseIssueType, "Invalid type: bad");
  invalid(parseTicketType, "Invalid ticket type: bad");
});

import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import {
  ACTION_TYPES, AGENT_IDS, CLOSED_REASONS, ISSUE_STATUSES, ISSUE_TYPES, MAX_DOC_WORDS, ROLES,
  assertBrief, parseActionType, parseAgentId, parseClosedReason, parseIssueStatus, parseIssueType, parseRole, wordCount,
} from "../../src/domain/value_objects.js";

const cases = [
  [ISSUE_TYPES, parseIssueType], [ACTION_TYPES, parseActionType],
  [ISSUE_STATUSES, parseIssueStatus],
  [AGENT_IDS, parseAgentId], [CLOSED_REASONS, parseClosedReason], [ROLES, parseRole],
] as const;

test("VOs aceitam somente os enums exatos", () => {
  for (const [values, parse] of cases) {
    for (const value of values) assert.equal(parse(value), value);
    assert.throws(() => parse("invalid" as never));
    assert.throws(() => parse("" as never));
  }
});

test("enums carregam exatamente os valores esperados (sem Ticket, sem ON-GOING)", () => {
  assert.deepEqual([...ISSUE_TYPES], ["Fix", "Feat", "Research", "Refactor"]);
  assert.deepEqual([...ACTION_TYPES], ["Planning", "Design", "Implement", "QA", "Deploy"]);
  assert.deepEqual([...ISSUE_STATUSES], ["OPEN", "CLAIMED", "AWAITING", "CLOSED"]);
  assert.throws(() => parseIssueStatus("ON-GOING"), /Invalid status: ON-GOING/);
  // Role (papel do workflow) é ortogonal ao AgentId (harness): rastreia QUEM fez o trabalho.
  assert.deepEqual([...ROLES], ["requirement", "breaking-issues", "architect", "test-coding", "coding", "quality-review", "pr-analysis"]);
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
  invalid(parseIssueType, "Invalid type: bad");
  invalid(parseActionType, "Invalid action: bad");
  invalid(parseRole, "Invalid role: bad");
});

test("wordCount conta palavras separadas por whitespace", () => {
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount("   "), 0);
  assert.equal(wordCount("uma  duas\n três"), 3);
});

test("assertBrief aceita até 300 palavras e rejeita acima com orientação de decomposição", () => {
  assert.equal(MAX_DOC_WORDS, 300);
  assert.doesNotThrow(() => assertBrief(Array(300).fill("x").join(" "), "artifact"));
  assert.throws(() => assertBrief(Array(301).fill("x").join(" "), "artifact"), (error: unknown) =>
    error instanceof DomainError
    && /artifact tem 301 palavras \(limite 300\)/.test(error.message)
    && /Issues menores relacionadas/.test(error.message));
});

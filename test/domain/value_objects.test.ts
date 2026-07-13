import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import {
  AGENT_IDS, CLOSED_REASONS, STATUSES, TAGS,
  parseAgentId, parseClosedReason, parseStatus, parseTag,
} from "../../src/domain/value_objects.js";

const cases = [
  [TAGS, parseTag], [STATUSES, parseStatus], [AGENT_IDS, parseAgentId],
  [CLOSED_REASONS, parseClosedReason],
] as const;

test("VOs aceitam somente os enums exatos", () => {
  for (const [values, parse] of cases) {
    for (const value of values) assert.equal(parse(value), value);
    assert.throws(() => parse("invalid" as never));
    assert.throws(() => parse("" as never));
  }
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
  invalid(parseStatus, "Invalid status: bad");
  invalid(parseTag, "Invalid TAG: bad");
});

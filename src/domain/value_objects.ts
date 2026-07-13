import { DomainError } from "./domain_error.js";

export const AGENT_IDS = ["cursor", "claude-code", "codex", "pi"] as const;
export const CLOSED_REASONS = ["obsoleto", "duplicado", "concluido", "errado"] as const;
export const STATUSES = ["OPEN", "CLAIMED", "AWAITING", "CLOSED"] as const;
export const TAGS = ["Planning", "Design", "Implement", "QA", "Deployment", "Maintenance"] as const;

export type AgentId = (typeof AGENT_IDS)[number];
export type ClosedReason = (typeof CLOSED_REASONS)[number];
export type Status = (typeof STATUSES)[number];
export type Tag = (typeof TAGS)[number];
export type Actor = "human" | AgentId;

export type Thread = {
  actor: Actor;
  timestamp: string;
  comment: string;
  status: Status;
  closed_reason: ClosedReason | null;
};

export function parseAgentId(value: string): AgentId {
  return parseEnum(AGENT_IDS, value, "IA");
}

export function parseClosedReason(value: string): ClosedReason {
  return parseEnum(CLOSED_REASONS, value, "closed reason");
}

export function parseStatus(value: string): Status {
  return parseEnum(STATUSES, value, "status");
}

export function parseTag(value: string): Tag {
  return parseEnum(TAGS, value, "TAG");
}

function parseEnum<const Values extends readonly string[]>(
  values: Values, value: string, label: string,
): Values[number] {
  if (!values.includes(value)) throw new DomainError(`Invalid ${label}: ${value}`);
  return value as Values[number];
}

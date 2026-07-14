import type { AttachmentData } from "./attachment_entity.js";
import { DomainError } from "./domain_error.js";

export const AGENT_IDS = ["cursor", "claude-code", "codex", "pi"] as const;
export const CLOSED_REASONS = ["obsoleto", "duplicado", "concluido", "errado"] as const;
export const ISSUE_TYPES = ["Fix", "Feat", "Research", "Refactor"] as const;
export const TICKET_TYPES = ["Planning", "Design", "Implement", "QA", "Deploy"] as const;
export const ISSUE_STATUSES = ["OPEN", "CLAIMED", "ON-GOING", "AWAITING", "CLOSED"] as const;
export const TICKET_STATUSES = ["OPEN", "CLAIMED", "AWAITING", "CLOSED"] as const;

export type AgentId = (typeof AGENT_IDS)[number];
export type ClosedReason = (typeof CLOSED_REASONS)[number];
export type IssueType = (typeof ISSUE_TYPES)[number];
export type TicketType = (typeof TICKET_TYPES)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type Actor = "human" | AgentId;

export const TAG_VALUES = {
  complexity: ["BAIXA", "MEDIA", "ALTA"],
  human_need: ["HITL", "AFK"],
  risk: ["BAIXO", "MEDIO", "ALTO"],
} as const satisfies Record<string, readonly string[]>;

export type TagCategory = keyof typeof TAG_VALUES;
export type Tags = { [K in TagCategory]?: (typeof TAG_VALUES)[K][number] };
export type TagUpdates = Partial<Record<TagCategory, string>>;

export function applyTags(current: Tags, updates: TagUpdates): Tags {
  const result: Tags = { ...current };
  let changed = false;
  for (const category of Object.keys(TAG_VALUES) as TagCategory[]) {
    const value = updates[category];
    if (value === undefined) continue;
    if (!TAG_VALUES[category].includes(value as never)) throw new DomainError(`Invalid ${category}: ${value}`);
    result[category] = value as never;
    changed = true;
  }
  if (!changed) throw new DomainError("At least one tag is required");
  return result;
}

export type Thread = {
  actor: Actor;
  timestamp: string;
  comment: string;
  status: IssueStatus;
  closed_reason: ClosedReason | null;
  attachments?: AttachmentData[]; // ausente em threads antigas e em transições sem anexo
};

export function parseAgentId(value: string): AgentId {
  return parseEnum(AGENT_IDS, value, "IA");
}

export function parseClosedReason(value: string): ClosedReason {
  return parseEnum(CLOSED_REASONS, value, "closed reason");
}

export function parseIssueType(value: string): IssueType {
  return parseEnum(ISSUE_TYPES, value, "type");
}

export function parseTicketType(value: string): TicketType {
  return parseEnum(TICKET_TYPES, value, "ticket type");
}

export function parseIssueStatus(value: string): IssueStatus {
  return parseEnum(ISSUE_STATUSES, value, "status");
}

export function parseTicketStatus(value: string): TicketStatus {
  return parseEnum(TICKET_STATUSES, value, "ticket status");
}

function parseEnum<const Values extends readonly string[]>(
  values: Values, value: string, label: string,
): Values[number] {
  if (!values.includes(value)) throw new DomainError(`Invalid ${label}: ${value}`);
  return value as Values[number];
}

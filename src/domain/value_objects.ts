import type { AttachmentData } from "./attachment_entity.js";
import { DomainError } from "./domain_error.js";

export const AGENT_IDS = ["cursor", "claude-code", "codex", "pi"] as const;
export const CLOSED_REASONS = ["obsoleto", "duplicado", "concluido", "errado"] as const;
export const ISSUE_TYPES = ["Fix", "Feat", "Research", "Refactor"] as const;
export const TICKET_TYPES = ["Planning", "Design", "Implement", "QA", "Deploy", "Confirmation"] as const;
export const ISSUE_STATUSES = ["OPEN", "CLAIMED", "ON-GOING", "AWAITING", "CLOSED"] as const;
export const TICKET_STATUSES = ["OPEN", "CLAIMED", "AWAITING", "CLOSED"] as const;

export type AgentId = (typeof AGENT_IDS)[number];
export type ClosedReason = (typeof CLOSED_REASONS)[number];
export type IssueType = (typeof ISSUE_TYPES)[number];
export type TicketType = (typeof TICKET_TYPES)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type Actor = "human" | AgentId;
export type Decision = "OPEN" | "CLOSED";

export const TAG_VALUES = {
  complexity: ["BAIXA", "MEDIA", "ALTA"],
  human_need: ["HITL", "AFK"],
  risk: ["BAIXO", "MEDIO", "ALTO"],
} as const satisfies Record<string, readonly string[]>;

export type TagCategory = keyof typeof TAG_VALUES;
export type Tags = { [K in TagCategory]?: (typeof TAG_VALUES)[K][number] };
export type TagUpdates = Partial<Record<TagCategory, string>>;
export type HumanNeed = (typeof TAG_VALUES)["human_need"][number];

// Severidade = quanta supervisão humana o valor exige, do menor para o maior. NÃO é a ordem de
// TAG_VALUES: lá human_need é ["HITL","AFK"], e HITL exige MAIS supervisão que AFK. Comparar índice
// de TAG_VALUES inverteria a regra justo no eixo que governa a autonomia do agente — o buraco que
// este guard existe para fechar. Ordem explícita, não derivada.
const SEVERITY = {
  complexity: ["BAIXA", "MEDIA", "ALTA"],
  human_need: ["AFK", "HITL"],
  risk: ["BAIXO", "MEDIO", "ALTO"],
} as const satisfies { [K in TagCategory]: readonly (typeof TAG_VALUES)[K][number][] };

// Escalar (pedir mais supervisão) nunca é ataque, e manter o valor é no-op: ambos livres para a IA.
// Rebaixar é a IA mexendo na própria coleira — só o humano. Tag ausente nos dois lados não compara.
export function assertNoDowngrade(current: Tags, next: Tags): void {
  for (const category of Object.keys(SEVERITY) as TagCategory[]) {
    const before = current[category];
    const after = next[category];
    if (before === undefined || after === undefined) continue;
    if (severity(category, after) < severity(category, before)) {
      throw new DomainError(`IA não pode rebaixar ${category} (${before} → ${after}): rebaixar supervisão exige --human`);
    }
  }
}

function severity(category: TagCategory, value: string): number {
  return (SEVERITY[category] as readonly string[]).indexOf(value);
}

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

// Worktree git isolada por Issue: path absoluto do worktree e branch criada.
export type Worktree = { path: string; branch: string };

export type Thread = {
  actor: Actor;
  timestamp: string;
  comment: string;
  status: IssueStatus;
  closed_reason: ClosedReason | null;
  attachments?: AttachmentData[]; // ausente em threads antigas e em transições sem anexo
};

export function threadEntry(actor: Actor, timestamp: string, comment: string,
  status: IssueStatus, closed_reason: ClosedReason | null): Thread {
  return { actor, timestamp, comment, status, closed_reason };
}

// Guard de campo obrigatório, compartilhado pelos agregados.
export function required(value: string, name: string): void {
  if (!value.trim()) throw new DomainError(`${name} is required`);
}

// Regras comuns de uma decisão humana OPEN|CLOSED (Issue e Ticket).
export function assertDecision(status: Decision, comment: string, reason: ClosedReason | undefined): void {
  if (status === "OPEN") required(comment, "comment");
  if (status === "CLOSED" && !reason) throw new DomainError("Closed reason is required");
  if (status === "OPEN" && reason) throw new DomainError("OPEN cannot have a closed reason");
}

export function parseAgentId(value: string): AgentId {
  return parseEnum(AGENT_IDS, value, "IA");
}

// Actor a partir de string livre (CLI/API): "human" ou uma IA válida.
export function parseActor(value: string): Actor {
  return value === "human" ? "human" : parseAgentId(value);
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

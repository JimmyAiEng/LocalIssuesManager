import type { MediaArtifactData } from "./artifacts/media_artifact.js";
import { DomainError } from "./domain_error.js";

export const AGENT_IDS = ["cursor", "claude-code", "codex", "pi"] as const;
export const CLOSED_REASONS = ["obsoleto", "duplicado", "concluido", "errado"] as const;
export const ISSUE_TYPES = ["Fix", "Feat", "Research", "Refactor"] as const;
export const ACTION_TYPES = ["Planning", "Design", "ConflictReview", "Implement", "Review", "Deploy"] as const;
export const ISSUE_STATUSES = ["OPEN", "CLAIMED", "AWAITING", "APPROVED", "CLOSED"] as const;
// Linhagem direcionada entre Issues: parent/child expressam o fan-out Planning→Design→Implement
// (ancestral↔descendente); see-also é a relação simétrica sem direção (o default retrocompatível).
export const RELATION_KINDS = ["parent", "child", "see-also"] as const;
// Papel especializado do workflow que uma entrada da thread representa. Ortogonal ao AgentId
// (que identifica o harness): rastreia QUEM fez o trabalho, para auditar e rotear retrabalho.
export const ROLES = ["requirement", "breaking-issues", "architect", "test-coding", "coding", "review", "pr-analysis"] as const;

export type AgentId = (typeof AGENT_IDS)[number];
export type ClosedReason = (typeof CLOSED_REASONS)[number];
export type IssueType = (typeof ISSUE_TYPES)[number];
export type ActionType = (typeof ACTION_TYPES)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type RelationKind = (typeof RELATION_KINDS)[number];
export type Role = (typeof ROLES)[number];
export type Relation = { id: string; kind: RelationKind };
export type Actor = "human" | AgentId;
export type Decision = "OPEN" | "APPROVED" | "CLOSED";

export const TAG_VALUES = {
  complexity: ["BAIXA", "MEDIA", "ALTA"],
  human_need: ["HITL", "AFK"],
  risk: ["BAIXO", "MEDIO", "ALTO"],
} as const satisfies Record<string, readonly string[]>;

export type TagCategory = keyof typeof TAG_VALUES;
export type Tags = { [K in TagCategory]?: (typeof TAG_VALUES)[K][number] };
export type TagUpdates = Partial<Record<TagCategory, string>>;

// Todo texto escrito (problema, artefato, comentário, evidência) é limitado: conteúdo
// grande denuncia Issue grande demais — o remédio é decompor, não escrever mais.
export const MAX_DOC_WORDS = 300;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function assertBrief(text: string, label: string): void {
  const words = wordCount(text);
  if (words > MAX_DOC_WORDS) {
    throw new DomainError(`${label} tem ${words} palavras (limite ${MAX_DOC_WORDS}): conteúdo grande indica Issue grande demais — resuma, ou feche esta Issue e crie Issues menores relacionadas (--relates)`);
  }
}

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
    if (!TAG_VALUES[category].includes(value as never)) throw new DomainError(`Invalid ${category}: ${value} (use ${TAG_VALUES[category].join("|")})`);
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
  decided_by?: Actor; // presente só na decisão humana (decide): audita quem aprovou o Code Review final
  attachments?: MediaArtifactData[]; // ausente em threads antigas e em transições sem anexo
  role?: Role; // papel especializado do workflow (auditoria); ausente em threads sem papel declarado
};

export function threadEntry(actor: Actor, timestamp: string, comment: string,
  status: IssueStatus, closed_reason: ClosedReason | null): Thread {
  return { actor, timestamp, comment, status, closed_reason };
}

// Guard de campo obrigatório, compartilhado pelo agregado e use cases.
export function required(value: string, name: string): void {
  if (!value.trim()) throw new DomainError(`${name} is required`);
}

// Decisão humana da Issue AWAITING, três-vias. OPEN rejeita e APPROVED aprova — ambas reentram na
// fila, exigem comentário e proíbem reason. CLOSED é só abandono administrativo (errado/duplicado/
// obsoleto): exige motivo e recusa `concluido` — aprovar é decidir APPROVED, não fechar concluído.
export function assertDecision(status: Decision, comment: string, reason: ClosedReason | undefined): void {
  if (status === "CLOSED") {
    if (!reason) throw new DomainError("Closed reason is required");
    if (reason === "concluido") throw new DomainError("Fechar como concluído não aprova: para aprovar decida APPROVED (Aprovar); CLOSED no decide é só abandono administrativo (errado/duplicado/obsoleto)");
    return;
  }
  required(comment, "comment");
  if (reason) throw new DomainError(`${status} cannot have a closed reason`);
}

// Passou por APPROVED em algum momento do ciclo? Governa o bypass da trava humana no fechamento
// pós-aprovação (fatia App). Lê phases estruturalmente para não acoplar ao agregado Issue.
export function wasApproved(phases: readonly { status: IssueStatus }[]): boolean {
  return phases.some((phase) => phase.status === "APPROVED");
}

// Issue "viva" = ainda pode receber trabalho (OPEN na fila, CLAIMED por um agente). AWAITING e
// APPROVED estão paradas na decisão humana e CLOSED acabou: nenhuma delas abre sequência, então
// nenhuma satisfaz os gates que exigem a próxima etapa existindo de fato.
export function isLive(status: IssueStatus): boolean {
  return status === "OPEN" || status === "CLAIMED";
}

// Abandono administrativo: fechada por motivo que não seja "concluido" (errado/obsoleto/duplicado) —
// a Issue não entregou nada. Issue viva (reason null) não conta como abandonada.
export function isAbandoned(reason: ClosedReason | null): boolean {
  return reason !== null && reason !== "concluido";
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

export function parseActionType(value: string): ActionType {
  return parseEnum(ACTION_TYPES, value, "action");
}

export function parseIssueStatus(value: string): IssueStatus {
  return parseEnum(ISSUE_STATUSES, value, "status");
}

export function parseRelationKind(value: string): RelationKind {
  return parseEnum(RELATION_KINDS, value, "kind");
}

export function parseRole(value: string): Role {
  return parseEnum(ROLES, value, "role");
}

// Inversa da relação direcionada: o par recíproco gravado na Issue alvo. see-also é simétrica.
export function inverseKind(kind: RelationKind): RelationKind {
  return kind === "parent" ? "child" : kind === "child" ? "parent" : "see-also";
}

// Normaliza relates persistidos: entradas antigas (string[]) viram see-also; o shape novo passa direto.
export function normalizeRelations(relates: readonly (string | Relation)[] | undefined): Relation[] {
  const seen = new Set<string>();
  const result: Relation[] = [];
  for (const entry of relates ?? []) {
    const relation = typeof entry === "string" ? { id: entry, kind: "see-also" as RelationKind } : entry;
    if (seen.has(relation.id)) continue; // dedup por id (linhagem é um id ↔ um kind)
    seen.add(relation.id);
    result.push(relation);
  }
  return result;
}

function parseEnum<const Values extends readonly string[]>(
  values: Values, value: string, label: string,
): Values[number] {
  // O remédio vai na própria mensagem: quem erra o enum não deve precisar ler o fonte para acertar.
  if (!values.includes(value)) throw new DomainError(`Invalid ${label}: ${value} (use ${values.join("|")})`);
  return value as Values[number];
}

import { randomUUID } from "node:crypto";
import type { MediaArtifactData } from "./artifacts/media_artifact.js";
import { DomainError } from "./domain_error.js";
import { applyTags, assertBrief, assertDecision, assertNoDowngrade, normalizeRelations, required, threadEntry, type ActionType, type Actor, type AgentId, type ClosedReason, type Decision, type IssueStatus, type IssueType, type Relation, type Role, type Tags, type TagUpdates, type Thread } from "./value_objects.js";

export type Phase = { status: IssueStatus; timestamp: string };
export type CreateIssue = {
  title: string; project: string; type: IssueType; action: ActionType; problem: string;
  acceptance_criteria?: string; relates?: string[]; attachments?: MediaArtifactData[];
};
export type IssueData = {
  id: string; title: string; project: string; type: IssueType; action: ActionType;
  problem: string; acceptance_criteria: string; status: IssueStatus; owner: Actor | null;
  closed_reason: ClosedReason | null; claimed_at: string | null; created_at: string;
  status_changed_at: string; thread: Thread[]; phases: Phase[]; relates: Relation[];
  revision: number; tags: Tags; architecture_changed: boolean | null;
};

// Uma Issue é a unidade de trabalho: type diz o problema (Fix/Feat/Research/Refactor) e
// action diz a entrega esperada (Planning/Design/Implement/Review/Deploy). Não há Tickets:
// trabalho maior vira novas Issues relacionadas (relates), formando a linhagem.
export class Issue implements IssueData {
  id!: string; title!: string; project!: string; type!: IssueType; action!: ActionType;
  problem!: string; acceptance_criteria!: string; status!: IssueStatus; owner!: Actor | null;
  closed_reason!: ClosedReason | null; claimed_at!: string | null; created_at!: string;
  status_changed_at!: string; thread!: Thread[]; phases!: Phase[]; relates!: Relation[];
  revision!: number; tags!: Tags; architecture_changed!: boolean | null; baseRevision!: number;

  private constructor(data: IssueData) {
    Object.assign(this, data);
    this.tags = data.tags ?? {};
    this.relates = normalizeRelations(data.relates); // JSON antigo (string[]) carrega como see-also
    this.architecture_changed = data.architecture_changed ?? null; // null = decisão de arquitetura ainda não tomada
    this.baseRevision = data.revision;
  }

  static create(input: CreateIssue, actor: Actor, now = new Date()): Issue {
    for (const key of ["title", "project", "type", "action", "problem"] as const) required(input[key], key);
    // Refactor começa no Design: o workflow de Refactor não tem fase de Requisitos (diagrama).
    if (input.type === "Refactor" && input.action === "Planning") {
      throw new DomainError("Refactor não passa por Planning: o workflow de Refactor começa no Design — crie a Issue com --action Design");
    }
    assertBrief(input.problem, "problem");
    if (input.acceptance_criteria) assertBrief(input.acceptance_criteria, "acceptance_criteria");
    const timestamp = now.toISOString();
    return new Issue(Issue.#initialData(input, actor, timestamp));
  }

  static #initialData(input: CreateIssue, actor: Actor, timestamp: string): IssueData {
    const { attachments, relates, ...fields } = input;
    const base = threadEntry(actor, timestamp, "Issue created", "OPEN", null);
    const entry = attachments?.length ? { ...base, attachments } : base;
    return { ...fields, acceptance_criteria: input.acceptance_criteria ?? "",
      id: randomUUID(), status: "OPEN", owner: null, closed_reason: null, claimed_at: null,
      created_at: timestamp, status_changed_at: timestamp, thread: [entry],
      phases: [{ status: "OPEN", timestamp }], relates: normalizeRelations(relates), revision: 0, tags: {}, architecture_changed: null };
  }

  static fromJSON(data: IssueData): Issue {
    return new Issue(structuredClone(data));
  }

  claim(actor: Actor, now = new Date()): void {
    this.#expectClaimable();
    this.owner = actor;
    this.claimed_at = now.toISOString();
    this.#changeStatus("CLAIMED", now);
  }

  comment(actor: Actor, comment: string, attachments: MediaArtifactData[] = [], now = new Date(), role?: Role): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    if (!comment.trim() && attachments.length === 0) throw new DomainError("comment or attachment is required");
    assertBrief(comment, "comment");
    const entry = threadEntry(actor, now.toISOString(), comment, this.status, null);
    this.thread.push({ ...entry, attachments, ...(role ? { role } : {}) });
    this.#bumpRevision();
  }

  // A tag da Issue governa a autonomia (requiresHuman): rebaixá-la é o agente recuperando a
  // caneta sobre a própria supervisão. Por isso a mutação tem dono: IA só escala, humano
  // faz nos dois sentidos.
  tag(updates: TagUpdates, actor: Actor): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    const next = applyTags(this.tags, updates); // valida enums antes de julgar severidade
    if (actor !== "human") assertNoDowngrade(this.tags, next);
    this.tags = next;
    this.#bumpRevision();
  }

  // Liga esta Issue a outras (linhagem direcionada): quem reivindica uma Issue enxerga os
  // artefatos das relacionadas. A existência dos ids e o par recíproco (parent↔child na Issue
  // alvo) são responsabilidade da camada de aplicação. O kind de um id já ligado é monotônico:
  // see-also é o piso e sobe para parent/child; kind igual é no-op; rebaixar ou inverter é erro.
  // Sem guarda de CLOSED (diferente de comment/tag): a linhagem continua gravável
  // após o fechamento — adotar um filho num pai já CLOSED grava o par recíproco. Conteúdo segue
  // imutável; relate só acrescenta relações, nunca altera o que foi entregue.
  // Devolve se algo mudou, para a aplicação salvar só o lado alterado (salvar sem mudança é save stale).
  relate(relations: Relation[]): boolean {
    const wanted = normalizeRelations(relations).filter((r) => r.id !== this.id);
    if (!wanted.length) throw new DomainError("Nenhuma relação nova: informe ids de outras Issues");
    let changed = false;
    for (const next of wanted) {
      const current = this.relates.find((r) => r.id === next.id);
      if (!current) { this.relates.push(next); changed = true; continue; }
      if (current.kind === next.kind) continue; // no-op: re-executar o mesmo relate não é erro
      if (current.kind !== "see-also") {
        throw new DomainError(`Relação com ${next.id} já é ${current.kind}: relate promove see-also para parent/child, mas não rebaixa nem inverte. Não há como apagar uma aresta pelo CLI: crie a Issue de novo com a linhagem certa e abandone esta (issues status --reason errado)`);
      }
      current.kind = next.kind; // promoção monotônica
      changed = true;
    }
    if (changed) this.#bumpRevision();
    return changed;
  }

  // Entrega para decisão humana com a evidência obrigatória: relatório curto do que foi
  // feito, passos e decisões tomadas.
  submit(agent: AgentId, evidence: string, now = new Date(), attachments: MediaArtifactData[] = [], role?: Role): void {
    this.#expectOwner(agent);
    required(evidence, "comment");
    this.#transition("AWAITING", agent, evidence, null, now, attachments, undefined, role);
  }

  closeByAgent(agent: AgentId, evidence: string, reason: ClosedReason, now = new Date(), attachments: MediaArtifactData[] = [], role?: Role): void {
    this.#expectOwner(agent);
    required(evidence, "comment");
    this.#transition("CLOSED", agent, evidence, reason, now, attachments, undefined, role);
  }

  // Override humano: fecha sem gate e sem evidência obrigatória (o motivo basta).
  closeByHuman(comment: string, reason: ClosedReason, now = new Date(), attachments: MediaArtifactData[] = []): void {
    if (this.status !== "OPEN" && this.status !== "CLAIMED") {
      throw new DomainError(`Expected OPEN or CLAIMED, got ${this.status}`);
    }
    this.#transition("CLOSED", "human", comment, reason, now, attachments);
  }

  // Decisão humana da Issue AWAITING: registra decided_by="human" na entrada para auditar
  // quem aprovou/reprovou (o Code Review final do fluxo Deploy passa por aqui).
  decide(status: Decision, comment: string, reason?: ClosedReason, now = new Date(), attachments: MediaArtifactData[] = []): void {
    this.#expect("AWAITING");
    assertDecision(status, comment, reason);
    if (status === "OPEN" || status === "APPROVED") this.#clearClaim(); // ambas reentram na fila sem dono
    this.#transition(status, "human", comment, reason ?? null, now, attachments, "human");
  }

  reset(comment: string, now = new Date(), attachments: MediaArtifactData[] = []): void {
    this.#expect("CLAIMED");
    required(comment, "comment");
    this.#clearClaim();
    this.#transition("OPEN", "human", comment, null, now, attachments);
  }

  // Decisão de arquitetura da Issue Design: se a arquitetura muda, o gate exige os 4 níveis
  // de diagramas e aceite humano; se não, dispensa diagramas (atalho ao plano). O guard de
  // action=Design fica na camada de aplicação (como setPlan).
  setArchitectureChanged(value: boolean): void {
    if (this.status === "CLOSED") throw new DomainError("CLOSED aggregate is immutable");
    this.architecture_changed = value;
    this.#bumpRevision();
  }

  #transition(status: IssueStatus, actor: Actor, comment: string, reason: ClosedReason | null, now: Date,
    attachments: MediaArtifactData[] = [], decidedBy?: Actor, role?: Role): void {
    assertBrief(comment, "comment");
    let entry: Thread = threadEntry(actor, now.toISOString(), comment, status, reason);
    if (decidedBy) entry = { ...entry, decided_by: decidedBy };
    if (attachments.length) entry = { ...entry, attachments };
    if (role) entry = { ...entry, role };
    this.thread.push(entry);
    this.closed_reason = reason;
    this.#changeStatus(status, now);
  }

  #changeStatus(status: IssueStatus, now: Date): void {
    const timestamp = now.toISOString();
    this.status = status;
    this.status_changed_at = timestamp;
    this.phases.push({ status, timestamp });
    this.#bumpRevision();
  }

  #bumpRevision(): void {
    this.revision++;
  }

  #clearClaim(): void {
    this.owner = null;
    this.claimed_at = null;
  }

  #expect(status: IssueStatus): void {
    if (this.status !== status) throw new DomainError(`Expected ${status}, got ${this.status}`);
  }

  // Reivindicável = OPEN (nova) ou APPROVED (aprovada reentra na fila para o handoff seguir).
  #expectClaimable(): void {
    if (this.status !== "OPEN" && this.status !== "APPROVED") {
      throw new DomainError(`Expected OPEN or APPROVED, got ${this.status}`);
    }
  }

  #expectOwner(agent: AgentId): void {
    this.#expect("CLAIMED");
    if (this.owner !== agent) throw new DomainError("Only the Owner may change status");
  }

  toJSON(): IssueData {
    const { baseRevision, ...rest } = this;
    return structuredClone({ ...rest });
  }
}

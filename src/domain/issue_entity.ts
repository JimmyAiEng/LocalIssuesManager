import { randomUUID } from "node:crypto";
import { DomainError } from "./domain_error.js";
import type { Actor, AgentId, ClosedReason, Status, Tag, Thread } from "./value_objects.js";

export type Phase = { status: Status; timestamp: string };
export type CreateIssue = {
  title: string; project: string; tag: Tag; problem: string;
  artifacts: string; acceptance_criteria: string;
};
export type IssueData = CreateIssue & {
  id: string; status: Status; owner: AgentId | null;
  closed_reason: ClosedReason | null; claimed_at: string | null;
  created_at: string; status_changed_at: string; human_presence: boolean;
  thread: Thread[]; phases: Phase[];
};

const required = (value: string, name: string) => {
  if (!value.trim()) throw new DomainError(`${name} is required`);
};

export class Issue implements IssueData {
  id!: string; title!: string; project!: string; tag!: Tag;
  problem!: string; artifacts!: string; acceptance_criteria!: string;
  status!: Status; owner!: AgentId | null; closed_reason!: ClosedReason | null;
  claimed_at!: string | null; created_at!: string; status_changed_at!: string;
  human_presence!: boolean; thread!: Thread[]; phases!: Phase[];

  private constructor(data: IssueData) {
    Object.assign(this, data);
  }

  static create(input: CreateIssue, actor: Actor, now = new Date()): Issue {
    for (const key of Object.keys(input) as (keyof CreateIssue)[]) required(input[key], key);
    const timestamp = now.toISOString();
    const data = Issue.#initialData(input, actor, timestamp);
    return new Issue(data);
  }

  static #initialData(input: CreateIssue, actor: Actor, timestamp: string): IssueData {
    const entry = Issue.#entry(actor, timestamp, "Issue created", "OPEN", null);
    return { ...input, id: randomUUID(), status: "OPEN", owner: null,
      closed_reason: null, claimed_at: null, created_at: timestamp,
      status_changed_at: timestamp, human_presence: actor === "human",
      thread: [entry], phases: [{ status: "OPEN", timestamp }] };
  }

  static fromJSON(data: IssueData): Issue {
    return new Issue(structuredClone(data));
  }

  claim(agent: AgentId, now = new Date()): void {
    this.#expect("OPEN");
    this.owner = agent;
    this.claimed_at = now.toISOString();
    this.#changeStatus("CLAIMED", now);
  }

  await(agent: AgentId, comment: string, now = new Date()): void {
    this.#expect("CLAIMED");
    if (this.owner !== agent) throw new DomainError("Only the Owner may await");
    this.#transition("AWAITING", agent, comment, null, now);
  }

  reset(comment: string, now = new Date()): void {
    this.#expect("CLAIMED");
    required(comment, "comment");
    this.#clearClaim();
    this.human_presence = true;
    this.#transition("OPEN", "human", comment, null, now);
  }

  decide(status: "OPEN" | "CLOSED", comment: string, reason?: ClosedReason, now = new Date()): void {
    this.#expect("AWAITING");
    required(comment, "comment");
    if (status === "CLOSED" && !reason) throw new DomainError("Closed reason is required");
    if (status === "OPEN" && reason) throw new DomainError("OPEN cannot have a closed reason");
    if (status === "OPEN") this.#clearClaim();
    this.human_presence = true;
    this.#transition(status, "human", comment, reason ?? null, now);
  }

  closeByAgent(agent: AgentId, comment: string, reason: ClosedReason, now = new Date()): void {
    this.#expect("OPEN");
    if (this.human_presence) throw new DomainError("Human presence prevents IA closure");
    this.#transition("CLOSED", agent, comment, reason, now);
  }

  closeByHuman(comment: string, reason: ClosedReason, now = new Date()): void {
    this.#expect("OPEN");
    required(comment, "comment");
    this.human_presence = true;
    this.#transition("CLOSED", "human", comment, reason, now);
  }

  #transition(status: Status, actor: Actor, comment: string, reason: ClosedReason | null, now: Date): void {
    required(comment, "comment");
    const timestamp = now.toISOString();
    this.thread.push(Issue.#entry(actor, timestamp, comment, status, reason));
    this.closed_reason = reason;
    this.#changeStatus(status, now);
  }

  #changeStatus(status: Status, now: Date): void {
    const timestamp = now.toISOString();
    this.status = status;
    this.status_changed_at = timestamp;
    this.phases.push({ status, timestamp });
  }

  #clearClaim(): void {
    this.owner = null;
    this.claimed_at = null;
  }

  #expect(status: Status): void {
    if (this.status !== status) throw new DomainError(`Expected ${status}, got ${this.status}`);
  }

  static #entry(actor: Actor, timestamp: string, comment: string, status: Status, closed_reason: ClosedReason | null): Thread {
    return { actor, timestamp, comment, status, closed_reason };
  }

  toJSON(): IssueData {
    return structuredClone({ ...this });
  }
}

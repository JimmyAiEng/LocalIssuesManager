import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { parseAgentId, parseClosedReason } from "../domain/value_objects.js";
import { loadRequiredIssue } from "./required_issue.js";

export type StatusInput = {
  id: string; agent?: string; human?: boolean; status: string; comment: string;
  closed_reason?: string; now?: Date;
};

export class StatusIssueUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: StatusInput): Issue {
    const issue = loadRequiredIssue(this.queue, input.id);
    if (input.human && input.agent) throw new DomainError("Choose --human or --agent");
    if (input.human) closeByHuman(issue, input);
    else transitionByAgent(issue, input);
    this.queue.save(issue);
    return issue;
  }
}

function transitionByAgent(issue: Issue, input: StatusInput): void {
  const agent = parseAgentId(input.agent ?? "");
  if (input.status === "AWAITING") issue.await(agent, input.comment, input.now);
  else if (input.status === "CLOSED" && input.closed_reason) {
    issue.closeByAgent(agent, input.comment, parseClosedReason(input.closed_reason), input.now);
  } else throw new DomainError("IA status supports AWAITING or CLOSED with reason");
}

function closeByHuman(issue: Issue, input: StatusInput): void {
  if (input.status !== "CLOSED" || !input.closed_reason) {
    throw new DomainError("Human status supports CLOSED with reason");
  }
  issue.closeByHuman(input.comment, parseClosedReason(input.closed_reason), input.now);
}


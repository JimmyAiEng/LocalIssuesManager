import type { Issue } from "../domain/issue_entity.js";
import { Queue, type TicketTarget } from "../domain/queue_repository.js";
import type { Ticket } from "../domain/ticket_entity.js";
import { parseAgentId, type AgentId } from "../domain/value_objects.js";

export type NextResult = { issue: Issue; ticket: Ticket | null };

export class NextIssueUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: { agent: string; project?: string; now?: Date }): NextResult | null {
    const agent = parseAgentId(input.agent);
    const target = this.queue.oldestOpenTicket(input.project);
    if (target) return this.#claimTicket(target, agent, input.now);
    const issue = this.queue.oldestOpen(input.project);
    if (!issue) return null;
    issue.claim(agent, input.now);
    this.queue.save(issue);
    return { issue, ticket: null };
  }

  #claimTicket(target: TicketTarget, agent: AgentId, now?: Date): NextResult {
    target.issue.claimTicket(target.ticket.id, agent, now);
    this.queue.save(target.issue);
    const ticket = target.issue.tickets.find((candidate) => candidate.id === target.ticket.id) ?? null;
    return { issue: target.issue, ticket };
  }
}

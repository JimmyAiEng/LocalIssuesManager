import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { loadRequiredIssue } from "./required_issue.js";

export type ClaimIssueInput = { id: string; now?: Date };

// Humano assume uma Issue OPEN pela web (OPEN->CLAIMED) para poder criar Tickets.
// Espelha o claim de Ticket por humano; o claim por IA continua via NextIssueUseCase.
export class ClaimIssueUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: ClaimIssueInput): Issue {
    const issue = loadRequiredIssue(this.queue, input.id);
    issue.claim("human", input.now);
    this.queue.save(issue);
    return issue;
  }
}

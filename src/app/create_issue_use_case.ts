import { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { parseAgentId, parseIssueType, type Actor } from "../domain/value_objects.js";

export type CreateInput = {
  title: string; project: string; type: string; problem: string;
  artifacts?: string; acceptance_criteria?: string; actor: string; now?: Date;
};

export class CreateIssueUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: CreateInput): Issue {
    const actor: Actor = input.actor === "human" ? "human" : parseAgentId(input.actor);
    const issue = Issue.create({ title: input.title, project: input.project,
      type: parseIssueType(input.type), problem: input.problem, artifacts: input.artifacts,
      acceptance_criteria: input.acceptance_criteria }, actor, input.now);
    this.queue.save(issue);
    return issue;
  }
}

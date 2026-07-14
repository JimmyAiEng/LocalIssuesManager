import { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { parseActor, parseIssueType, type TagUpdates } from "../domain/value_objects.js";

export type CreateInput = {
  title: string; project: string; type: string; problem: string;
  artifacts?: string; acceptance_criteria?: string; actor: string; now?: Date;
  complexity?: string; human_need?: string; risk?: string;
};

export class CreateIssueUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: CreateInput): Issue {
    const actor = parseActor(input.actor);
    const issue = Issue.create({ title: input.title, project: input.project,
      type: parseIssueType(input.type), problem: input.problem, artifacts: input.artifacts,
      acceptance_criteria: input.acceptance_criteria }, actor, input.now);
    const tags: TagUpdates = { complexity: input.complexity, human_need: input.human_need, risk: input.risk };
    if (Object.values(tags).some((value) => value !== undefined)) issue.tag(tags); // reusa applyTags (valida enums)
    this.queue.save(issue);
    return issue;
  }
}

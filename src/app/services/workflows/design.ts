import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { requireDesignGate } from "../../design_use_cases.js";

export async function validateDesign(queue: Queue, issue: Issue): Promise<void> {
  await requireDesignGate(queue, issue, "AWAITING");
}

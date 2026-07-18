import type { Issue } from "../../../domain/issue_entity.js";
import type { Queue } from "../../../domain/queue_repository.js";
import { requirePlanningGate } from "../../requirements_use_cases.js";

export function validatePlanning(queue: Queue, issue: Issue): void { requirePlanningGate(queue, issue); }

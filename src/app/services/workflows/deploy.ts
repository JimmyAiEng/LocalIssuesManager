import { validateDeployEvidence } from "../../../domain/gates/deploy_gate.js";
import type { Issue } from "../../../domain/issue_entity.js";

export function validateDeploy(issue: Issue, comment: string): void {
  validateDeployEvidence([...issue.thread.map((entry) => entry.comment), comment]);
}

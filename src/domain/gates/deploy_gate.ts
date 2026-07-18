import { DomainError } from "../domain_error.js";
import type { GateDefinition } from "./gate.js";

export const DEPLOY_GATE: GateDefinition = {
  action: "Deploy",
  name: "Merge/PR Analysis",
  artifacts: { mode: "none", types: [] },
  codeExecution: { mode: "required", description: "análise externa do PR" },
  humanApproval: { mode: "required" },
};

export function validateDeployEvidence(comments: string[]): void {
  const text = comments.join("\n");
  if (/https?:\/\/\S+/i.test(text) && /(sonar|pr analysis|an[aá]lise)/i.test(text)) return;
  throw new DomainError("Issue Deploy exige evidência de PR: inclua na thread (comentário ou na evidência do AWAITING) um link http(s) do PR e o resultado da análise (SonarQube/PR Analysis)");
}

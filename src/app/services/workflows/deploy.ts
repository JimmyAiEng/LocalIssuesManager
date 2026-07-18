import { DomainError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";

export function validateDeploy(issue: Issue, comment: string): void {
  const text = [...issue.thread.map((entry) => entry.comment), comment].join("\n");
  if (/https?:\/\/\S+/i.test(text) && /(sonar|pr analysis|an[aá]lise)/i.test(text)) return;
  throw new DomainError("Issue Deploy exige evidência de PR: inclua na thread (comentário ou na evidência do AWAITING) um link http(s) do PR e o resultado da análise (SonarQube/PR Analysis)");
}

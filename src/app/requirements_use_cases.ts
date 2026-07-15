import { readFileSync } from "node:fs";
import { NotFoundError } from "../domain/domain_error.js";
import { Queue } from "../domain/queue_repository.js";
import { parseAndValidateRequirements, type Requirements } from "../domain/requirements.js";

// Entrega o artefato de requisitos — SÓ arquivo JSON. Valida (sintaxe/estrutura Gherkin) antes de
// persistir; inválido → DomainError e nada é gravado.
export function setRequirements(input: { issueId: string; file: string }, root?: string): Requirements {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const requirements = parseAndValidateRequirements(readFileSync(input.file, "utf8"));
  queue.writeRequirements(issue.project, issue.id, JSON.stringify(requirements));
  return requirements;
}

// Lê os requisitos persistidos da Issue; inexistente ou corrompido → erro claro.
export function getRequirements(input: { issueId: string }, root?: string): Requirements {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const raw = queue.readRequirements(issue.project, issue.id);
  if (raw === null) throw new NotFoundError(`Requirements não encontrado para a Issue: ${issue.id}`);
  return parseAndValidateRequirements(raw);
}

// Gate: um Ticket Planning só vai a AWAITING com requisitos válidos persistidos na Issue.
export function requireValidRequirements(queue: Queue, project: string, issueId: string): void {
  const raw = queue.readRequirements(project, issueId);
  if (raw === null) {
    throw new NotFoundError(
      "Planning não pode ir para AWAITING sem requisitos: use 'issues requirements set --id <id> --file <req.json>'",
    );
  }
  parseAndValidateRequirements(raw); // revalida; lança DomainError se inválido
}

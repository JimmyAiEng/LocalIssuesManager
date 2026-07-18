import { readFileSync } from "node:fs";
import { validateArtifactContent } from "../domain/artifact.js";
import { DomainError, NotFoundError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import {
  clusterFeatures, clusterForTitle, parseAndValidatePrd, type Prd,
} from "../domain/prd.js";
import { Queue } from "../domain/queue_repository.js";
import { parseAndValidateRequirements, type Requirements } from "../domain/requirements.js";
import type { ActionType } from "../domain/value_objects.js";

// Entrega o artefato de requisitos de uma Issue Planning — SÓ arquivo JSON. Valida
// (sintaxe/estrutura Gherkin, no máximo 5 Features breves) antes de persistir;
// inválido → DomainError e nada é gravado.
export function setRequirements(input: { issueId: string; file: string }, root?: string): Requirements {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  if (issue.action !== "Planning") {
    throw new DomainError(`Issue ${issue.id} não é de Planning (action=${issue.action}): requisitos pertencem a Issues Planning`);
  }
  const content = readFileSync(input.file, "utf8");
  validateArtifactContent("requirements", content);
  const requirements = parseAndValidateRequirements(content);
  queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "requirements" }, JSON.stringify(requirements));
  return requirements;
}

// Lê os requisitos persistidos da Issue; inexistente ou corrompido → erro claro.
export function getRequirements(input: { issueId: string }, root?: string): Requirements {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const raw = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "requirements" });
  if (raw === null) throw new NotFoundError(`Requirements não encontrado para a Issue: ${issue.id}`);
  return parseAndValidateRequirements(raw);
}

// Entrega o PRD (Full PRD com clusters) de uma Issue Planning — SÓ arquivo JSON, cross-validado
// contra os requisitos já persistidos (os clusters agrupam as Features Gherkin). Sem requisitos
// válidos ou PRD inválido → DomainError e nada é gravado.
export function setPrd(input: { issueId: string; file: string }, root?: string): Prd {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  if (issue.action !== "Planning") {
    throw new DomainError(`Issue ${issue.id} não é de Planning (action=${issue.action}): o PRD pertence a Issues Planning`);
  }
  const requirements = requireRequirements(queue, issue.project, issue.id);
  const content = readFileSync(input.file, "utf8");
  validateArtifactContent("prd", content, { requirements });
  const prd = parseAndValidatePrd(content, requirements);
  queue.artifacts.writeText(issue.project, { issueId: issue.id, type: "prd" }, JSON.stringify(prd));
  return prd;
}

// Lê o PRD persistido da Issue; inexistente ou corrompido → erro claro.
export function getPrd(input: { issueId: string }, root?: string): Prd {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const raw = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "prd" });
  if (raw === null) throw new NotFoundError(`PRD não encontrado para a Issue: ${issue.id}`);
  return parseAndValidatePrd(raw, requireRequirements(queue, issue.project, issue.id));
}

// Gate: uma Issue Planning só é concluída (AWAITING/CLOSED) com requisitos Gherkin válidos E
// PRD válido (clusters amarrados às Features) E o fan-out decomposto (uma filha Design por cluster).
// Requisitos vêm primeiro (mensagem própria); a trava de decomposição vem por último.
export function requirePlanningGate(queue: Queue, issue: Issue): void {
  const requirements = requireValidRequirements(queue, issue.project, issue.id);
  const raw = queue.artifacts.readText(issue.project, { issueId: issue.id, type: "prd" });
  if (raw === null) {
    throw new NotFoundError(
      "Issue Planning não pode ser concluída sem PRD: use 'issues prd set --id <id> --file <prd.json>'",
    );
  }
  requireDesignChildPerCluster(queue, issue, parseAndValidatePrd(raw, requirements));
}

// Trava de decomposição: cada cluster do PRD precisa de ≥1 filha Design (linhagem child) cujo
// título casa o cluster. Sem a filha, o fan-out 1→N quebra — aponta o primeiro cluster descoberto.
function requireDesignChildPerCluster(queue: Queue, issue: Issue, prd: Prd): void {
  const children = childIssues(queue, issue, "Design");
  for (const cluster of prd.clusters) {
    if (!children.some((child) => child.title.includes(cluster.name))) {
      throw new DomainError(`Issue Planning não fecha sem decompor o cluster "${cluster.name}": crie a filha Design com 'issues decompose --id ${issue.id} --into <arquivo.json>'`);
    }
  }
}

// Filhas de um dado action pela linhagem child da própria Issue (relacionadas purgadas são omitidas).
function childIssues(queue: Queue, issue: Issue, action: ActionType): Issue[] {
  return issue.relates.filter((relation) => relation.kind === "child")
    .map((relation) => queue.load(relation.id))
    .filter((child): child is Issue => child !== null && child.action === action);
}

// Requisitos válidos persistidos (revalida; devolve-os para a cross-validação do PRD).
export function requireValidRequirements(queue: Queue, project: string, issueId: string): Requirements {
  const raw = queue.artifacts.readText(project, { issueId, type: "requirements" });
  if (raw === null) {
    throw new NotFoundError(
      "Issue Planning não pode ser concluída sem requisitos: use 'issues requirements set --id <id> --file <req.json>'",
    );
  }
  return parseAndValidateRequirements(raw); // revalida; lança DomainError se inválido
}

// A Issue Design filha recebe no prompt só as Features do seu cluster: sobe ao Planning pai,
// casa o cluster pelo título da filha e resolve as Features Gherkin. Tolerante (view): dados
// ausentes/inválidos → null (o gate do Planning é quem cobra). Reusável pelo fan-out.
export function clusterForDesignChild(queue: Queue, issue: Issue): string[] | null {
  if (issue.action !== "Design") return null;
  const parentId = issue.relates.find((relation) => relation.kind === "parent")?.id;
  const parent = parentId ? queue.load(parentId) : null;
  if (!parent) return null;
  if (parent.action !== "Planning") return null;
  const rawPrd = queue.artifacts.readText(parent.project, { issueId: parent.id, type: "prd" });
  const rawReq = queue.artifacts.readText(parent.project, { issueId: parent.id, type: "requirements" });
  if (rawPrd === null || rawReq === null) return null;
  try {
    const requirements = parseAndValidateRequirements(rawReq);
    const cluster = clusterForTitle(parseAndValidatePrd(rawPrd, requirements), issue.title);
    return cluster ? clusterFeatures(cluster, requirements) : null;
  } catch {
    return null;
  }
}

function requireRequirements(queue: Queue, project: string, issueId: string): Requirements {
  const raw = queue.artifacts.readText(project, { issueId, type: "requirements" });
  if (raw === null) {
    throw new DomainError("PRD exige requisitos Gherkin antes: use 'issues requirements set --id <id> --file <req.json>'");
  }
  return parseAndValidateRequirements(raw);
}

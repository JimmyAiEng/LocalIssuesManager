import { readFileSync } from "node:fs";
import {
  DESIGN_KINDS, DesignGateError, evaluateGate, kindAccepts, parseDesignKind, plantumlError,
  requireNonEmptyDoc, type DesignError, type SyntaxCheck,
} from "../domain/design_gate.js";
import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import type { Ticket } from "../domain/ticket_entity.js";
import { checkSyntax } from "./plantuml_check.js";

export type DesignPackage = {
  issueId: string;
  tickets: {
    ticketId: string;
    design_md: string | null;
    diagrams: Record<string, string | null>;
    validation: { ready_for_awaiting: boolean; errors: DesignError[] };
  }[];
};

// Entrega o design.md do Ticket de Design — vazio/whitespace é rejeitado e nada é gravado.
export function setDesignDoc(input: { issueId: string; ticketId: string; file: string }, root?: string): object {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  requireOpenDesignTicket(issue, input.ticketId);
  const content = readFileSync(input.file, "utf8");
  requireNonEmptyDoc(content);
  queue.writeDesign(issue.project, input.ticketId, "design.md", content);
  return { ok: true, ticket: input.ticketId, path: "design.md" };
}

// Entrega um diagrama .puml do Ticket de Design — valida sintaxe (fail-fast) e a
// compatibilidade kind↔diagramType (D3) antes de gravar; regravar substitui.
export async function addDesignDiagram(
  input: { issueId: string; ticketId: string; kind: string; file: string }, root?: string,
): Promise<object> {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  requireOpenDesignTicket(issue, input.ticketId);
  const kind = parseDesignKind(input.kind);
  const source = readFileSync(input.file, "utf8");
  const path = `${kind}.puml`;
  const check = await checkSyntax(source);
  if (!check.valid) throw new DesignGateError([plantumlError(path, check)]);
  if (!kindAccepts(kind, check.diagramType)) {
    throw new DesignGateError([{ code: "kind_mismatch", path,
      message: `kind "${kind}" não corresponde ao diagrama detectado "${check.diagramType}"` }]);
  }
  queue.writeDesign(issue.project, input.ticketId, path, source);
  return { ok: true, ticket: input.ticketId, path };
}

// Pacote agregado de design da Issue (somente leitura, qualquer status): por Ticket
// type=Design, o design.md, os diagramas por kind e o veredito do gate (re-valida cada .puml).
export async function getDesignPackage(input: { issueId: string }, root?: string): Promise<DesignPackage> {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  const tickets: DesignPackage["tickets"] = [];
  for (const ticket of issue.tickets.filter((candidate) => candidate.type === "Design")) {
    tickets.push(await packageFor(queue, issue.project, ticket.id));
  }
  return { issueId: issue.id, tickets };
}

// Gate Design→AWAITING: relê o pacote do Ticket (re-checa a sintaxe de cada .puml presente)
// e lança DesignGateError com TODAS as falhas acumuladas quando não estiver pronto.
export async function requireDesignGate(queue: Queue, project: string, ticketId: string): Promise<void> {
  const { validation } = await packageFor(queue, project, ticketId);
  if (validation.errors.length > 0) throw new DesignGateError(validation.errors);
}

async function packageFor(queue: Queue, project: string, ticketId: string): Promise<DesignPackage["tickets"][number]> {
  const design_md = queue.readDesign(project, ticketId, "design.md");
  const diagrams: Record<string, string | null> = {};
  const checks: { path: string; check: SyntaxCheck }[] = [];
  for (const kind of DESIGN_KINDS) {
    const source = queue.readDesign(project, ticketId, `${kind}.puml`);
    diagrams[kind] = source;
    if (source !== null) checks.push({ path: `${kind}.puml`, check: await checkSyntax(source) });
  }
  const errors = evaluateGate(design_md, checks);
  return { ticketId, design_md, diagrams, validation: { ready_for_awaiting: errors.length === 0, errors } };
}

function requireOpenDesignTicket(issue: Issue, ticketId: string): Ticket {
  const ticket = issue.ticket(ticketId); // inexistente → DomainError "Ticket not found"
  if (ticket.type !== "Design") {
    throw new DomainError(`Ticket ${ticketId} não é de Design (type=${ticket.type})`);
  }
  if (ticket.status === "CLOSED") {
    throw new DomainError(`Ticket de Design ${ticketId} está CLOSED — pacote imutável`);
  }
  return ticket;
}

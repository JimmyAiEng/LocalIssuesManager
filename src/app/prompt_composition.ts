import { extForMediaType } from "../domain/attachment_entity.js";
import type { IssueData } from "../domain/issue_entity.js";
import { projectSegment } from "../domain/queue_repository.js";
import type { TicketData } from "../domain/ticket_entity.js";
import type { Tags, Thread } from "../domain/value_objects.js";

// Prompt mínimo: os padrões de workflow vivem nas skills (sdlc-workflow + skill de fase).
// Aqui entra só o que guia a busca de skills: o que foi reivindicado e os dados da Issue/Ticket.
export function composePrompt(issue: IssueData, ticket?: TicketData | null): string {
  const header = ticket
    ? `Você reivindicou um Ticket \`${ticket.type}\` da Issue abaixo.`
    : "Você reivindicou uma Issue sem Tickets (decomposição).";
  const sections = [
    `${header} Leia a skill \`sdlc-workflow\` antes de agir: ela explica o workflow e roteia a skill da fase pelos dados abaixo.`,
    `## Issue\n${issueInfo(issue)}`,
  ];
  if (ticket) sections.push(`## Ticket\n${ticketInfo(ticket, issue.project)}`);
  sections.push("Ao encerrar esta unidade, reivindique a próxima: `issues next --prompt --project <projeto> --agent <agente>`.");
  return sections.join("\n\n");
}

function issueInfo(issue: IssueData): string {
  return [
    `- Id: ${issue.id}`,
    `- Título: ${issue.title}`,
    `- Tipo: ${issue.type}`,
    `- Status: ${issue.status}`,
    `- Problema: ${issue.problem}`,
    `- Critérios de aceitação: ${issue.acceptance_criteria}`,
    `- Tags: ${formatTags(issue.tags)}`,
    ...attachmentLines(issue.thread, issue.project),
  ].join("\n");
}

function ticketInfo(ticket: TicketData, project: string): string {
  const lines = [
    `- Id: ${ticket.id}`,
    `- Tipo: ${ticket.type}`,
    `- Objetivo: ${ticket.objective}`,
    `- Tarefa: ${ticket.task}`,
    `- Critérios de aceitação: ${ticket.acceptance_criteria}`,
    `- Status: ${ticket.status}`,
  ];
  if (ticket.references) lines.push(`- Referências: ${ticket.references}`);
  if (ticket.artifacts) lines.push(`- Artefatos: ${ticket.artifacts}`);
  lines.push(...attachmentLines(ticket.thread, project));
  return lines.join("\n");
}

// Torna as imagens/vídeos anexados (na criação, comentários ou devoluções) localizáveis pelo agente
// que reivindica: caminho em disco (relativo à raiz de dados do issues) e URL do servidor web.
function attachmentLines(thread: Thread[], project: string): string[] {
  const attachments = thread.flatMap((entry) => entry.attachments ?? []);
  if (!attachments.length) return [];
  const seg = projectSegment(project);
  const items = attachments.map((a) =>
    `  - ${a.filename}: projects/${seg}/attachments/${a.id}.${extForMediaType(a.mediaType)} · /api/attachments/${a.id}`);
  return [`- Anexos (imagens/vídeos):\n${items.join("\n")}`];
}

function formatTags(tags: Tags): string {
  const parts = Object.entries(tags).map(([key, val]) => `${key}=${val}`);
  return parts.length ? parts.join(", ") : "—";
}

import { extForMediaType } from "../../../domain/artifacts/media_artifact.js";
import type { ImplementationPlan } from "../../../domain/artifacts/implementation_plan_artifact.js";
import { type Feature, toGherkin } from "../../../domain/artifacts/requirement_artifact.js";
import { projectSegment } from "../../../domain/queue_repository.js";
import { type Tags, type Thread, wasApproved } from "../../../domain/value_objects.js";
import { actionContract, executionContract } from "./action_contracts.js";
import type { IssueView, RelatedView } from "./issue_use_cases.js";

// Prompt do claim: a Issue reivindicada, a linhagem relacionada e o contrato mecânico da action
// (comandos + formatos, por último — modelo pequeno segue melhor a instrução mais recente). Os
// padrões de workflow continuam nas skills; o contrato garante a jornada em harness sem elas.
export function composePrompt(issue: IssueView): string {
  const sections = [
    `Você reivindicou uma Issue com action \`${issue.action}\`. Leia a skill \`sdlc-workflow\` antes de agir: ela explica o workflow e roteia a skill da action pelos dados abaixo.`,
    `## Issue\n${issueInfo(issue)}`,
  ];
  if (issue.artifact) sections.push(`## Artefato da Issue\n${issue.artifact}`);
  if (issue.plan) sections.push(`## Small Plan desta Issue\n${planBody(issue.plan)}`);
  if (issue.features?.length) sections.push(featureSection(issue.features));
  if (issue.ancestors.length) sections.push(ancestorSection(issue.ancestors));
  if (issue.related.length) sections.push(relatedSection(issue.related));
  const lineageThreads = issue.action === "Review" ? reviewLineageThreads(issue.ancestors) : null;
  if (lineageThreads) sections.push(lineageThreads);
  // Issue que passou por APPROVED reentrou na fila: troca o contrato da action pelo de execução do handoff.
  sections.push(wasApproved(issue.phases) ? executionContract(issue) : actionContract(issue));
  return sections.join("\n\n");
}

function issueInfo(issue: IssueView): string {
  const lines = [
    `- Id: ${issue.id}`,
    `- Título: ${issue.title}`,
    `- Tipo: ${issue.type}`,
    `- Action: ${issue.action}`,
    `- Status: ${issue.status}`,
    `- Problema: ${issue.problem}`,
    `- Critérios de aceitação: ${issue.acceptance_criteria}`,
    `- Tags: ${formatTags(issue.tags)}`,
  ];
  lines.push(...attachmentLines(issue.thread, issue.project));
  return lines.join("\n");
}

// A Issue Design recebe o grupo de Features que ela cobre (o seu RequirementArtifact). O artefato é
// JSONL, mas quem lê o prompt é um agente: renderiza em Gherkin para desenhar o seu recorte.
function featureSection(features: Feature[]): string {
  return `## Features desta Issue\n${features.map(toGherkin).join("\n\n")}`;
}

// A cadeia de ancestrais (do mais próximo ao mais distante): a Issue atual é a ponta de uma
// linhagem Planning→Design→Implement, e o prompt mostra de onde ela veio para dar contexto.
function ancestorSection(ancestors: RelatedView[]): string {
  const chain = ancestors.map((item) => `${item.title} (${item.action}, id ${item.id})`).join(" ← ");
  return `## Linhagem (ancestrais)\nEsta Issue descende de: ${chain}`;
}

// Só o claim de Review recebe as threads das Issues Planning/Design ancestrais: o Understand Intent
// se apoia nelas porque o agente não vê o histórico das sessões de chat, e é lá que ficam os
// comentários e as decisões. Thread longa é cortada por entrada, com o corte marcado (o agente
// sabe que há mais contexto do que está lendo), nunca omitida em silêncio.
const MAX_THREAD_ENTRY_WORDS = 60; // ponytail: corte por entrada; suba se decisões vierem truncadas demais

function reviewLineageThreads(ancestors: RelatedView[]): string | null {
  const lineage = ancestors.filter((item) => item.action === "Planning" || item.action === "Design");
  if (!lineage.length) return null;
  const blocks = lineage.map((item) => {
    const head = `### ${item.title} (${item.action}, id ${item.id})`;
    const entries = item.thread?.length ? item.thread.map(threadLine).join("\n") : "(sem thread)";
    return `${head}\n${entries}`;
  });
  return `## Threads da linhagem (intenção original)\n${blocks.join("\n\n")}`;
}

function threadLine(entry: Thread): string {
  return `- ${entry.actor} [${entry.status}]: ${truncateWords(entry.comment, MAX_THREAD_ENTRY_WORDS)}`;
}

function truncateWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return text;
  return `${words.slice(0, max).join(" ")} […corte: +${words.length - max} palavras]`;
}

// A linhagem: artefatos das Issues relacionadas viajam no prompt para a nova sessão
// herdar contexto (ex.: o design congelado alimenta a Issue de implementação).
function relatedSection(related: RelatedView[]): string {
  const blocks = related.map((item) => {
    const head = `### ${item.title} (${item.action}, ${item.status}, id ${item.id})`;
    const body = item.artifact ?? "(sem artefato)";
    return item.plan ? `${head}\n${body}\n\n${formatPlan(item.plan)}` : `${head}\n${body}`;
  });
  return `## Issues relacionadas\n${blocks.join("\n\n")}`;
}

// O plano de implementação do Design pai viaja no prompt da Issue Implement filha: ela
// recebe objetivo, passos, arquivos e critério de pronto sem reabrir o pacote de Design. O
// Small Plan da própria filha (issue.plan) usa o mesmo corpo e prevalece: é a fatia dela.
function formatPlan(plan: ImplementationPlan): string {
  return `#### Plano de implementação\n${planBody(plan)}`;
}

function planBody(plan: ImplementationPlan): string {
  const passos = plan.passos.map((step, index) => `  ${index + 1}. ${step}`).join("\n");
  const arquivos = plan.arquivos.map((file) => `  - ${file}`).join("\n");
  return `- Objetivo: ${plan.objetivo}\n- Passos:\n${passos}\n- Arquivos afetados:\n${arquivos}\n- Critério de pronto: ${plan.criterio_pronto}`;
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

import { extForMediaType } from "../../../domain/artifacts/media_artifact.js";
import type { ImplementationPlan } from "../../../domain/artifacts/implementation_plan_artifact.js";
import { projectSegment } from "../../../domain/queue_repository.js";
import type { Tags, Thread } from "../../../domain/value_objects.js";
import type { IssueView, RelatedView } from "./issue_use_cases.js";

// Prompt mínimo: os padrões de workflow vivem nas skills (sdlc-workflow + skill da action).
// Aqui entra só o que guia a busca de skills: a Issue reivindicada e a linhagem relacionada.
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
  if (issue.worktree) lines.push(`- Worktree: ${issue.worktree.path} (branch ${issue.worktree.branch})`);
  lines.push(...attachmentLines(issue.thread, issue.project));
  return lines.join("\n");
}

// A Issue Design filha recebe a Feature correspondente do RequirementArtifact.
// O Gherkin viaja no prompt para a filha desenhar exatamente o seu recorte.
function featureSection(features: string[]): string {
  return `## Feature desta Issue Design\n${features.join("\n\n")}`;
}

// A cadeia de ancestrais (do mais próximo ao mais distante): a Issue atual é a ponta de uma
// linhagem Planning→Design→Implement, e o prompt mostra de onde ela veio para dar contexto.
function ancestorSection(ancestors: RelatedView[]): string {
  const chain = ancestors.map((item) => `${item.title} (${item.action}, id ${item.id})`).join(" ← ");
  return `## Linhagem (ancestrais)\nEsta Issue descende de: ${chain}`;
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

import { extForMediaType } from "../domain/attachment_entity.js";
import type { IssueData } from "../domain/issue_entity.js";
import { projectSegment } from "../domain/queue_repository.js";
import type { TicketData } from "../domain/ticket_entity.js";
import type { IssueType, Tags, Thread, TicketType } from "../domain/value_objects.js";

// SDLC agente-only: só os passos que o AGENTE executa (caixas vermelhas do drawio).
// Gates humanos (G1–G4, merge/PR) e checks de código são pontos de parada/artefatos, não passos do agente.
export const SDLC_PROMPT = `Você é o agente de um AI development workflow iterativo. A cada rodada rode \`issues next --prompt\` para reivindicar a próxima unidade de trabalho (uma Issue a qualificar ou um Ticket de uma fase), execute SÓ o passo do agente descrito abaixo, encerre o Ticket e repita — até a Issue ser concluída.

Cada Issue é um problema/ideia, resolvida por um ou mais Tickets, e só conclui quando todos os Tickets fecham e um humano confirma. Nem todo passo é necessário; uma fase pode ter Tickets em paralelo ou em sequência.

Passos do agente (cada um é um Ticket):
1. Qualificar Issue → criar o 1º Ticket (quando next devolve Issue sem Ticket)
2. Planning → alinhar problema e requisitos (RF/RNF) — pare no gate humano G1
3. Design → congelar a spec e fatiar Tickets independentes — pare no gate humano G2
4. Implement → entregar a fatia com testes e review interno (checks de código: lint, unit, e2e, arch fitness, mutation)
5. QA → validar o conjunto entregue contra requisitos (≠ review da fatia)
6. Deploy → preparar o PR e pedir go/no-go para fazer o PR com o código da branch \`dev\`
7. Confirmation → confrontar o entregue com a Issue; resolvido, feche; faltou algo, crie os Tickets restantes

Gates G1-G2 e aceite de Pull Request são decisões humanas: pare e peça, não avance sozinho. Encerre cada fase movendo o Ticket para AWAITING (use --last no último; dispara o ticket Confirmation para outro agente confirmar conclusão).`;

// Catálogo único de comandos injetado no prompt (substitui skills; a "consulta" é este bloco).
export const COMMANDS_CATALOG = [
  "- issues next --prompt --project <p> --agent <ia>  # reivindica a próxima unidade e injeta este prompt (o loop)",
  "- issues get --id <id> | issues list [--status --project --type --title]",
  "- issues comment --id <id> --comment <t> [--attach <arquivo>]  # registra progresso/decisões/anexos",
  "- issues tag --id <id> [--complexity BAIXA|MEDIA|ALTA] [--risk BAIXO|MEDIO|ALTO] [--human-need HITL|AFK]",
  "- issues artifact --id <id> --file <a.md>  # grava/substitui o Artefato .md da Issue",
  "- issues ticket create --issue <id> --type <Planning|Design|Implement|QA|Deploy> --objective <o> --task <t> --acceptance-criteria <c> [--depends-on a,b] [--references <r>] [--human-need HITL|AFK] [--artifact-file <a.md>]",
  "- issues ticket claim --issue <id> --id <tid> --agent <ia>",
  "- issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment <t> [--last]  # encerra a fase; --last dispara o Confirmation",
  "- issues ticket get|list|comment|tag|artifact --issue <id> [--id <tid>] ...",
  "- issues worktree add|remove --id <id>  # worktree git isolada da Issue (execução autônoma)",
  "HITL Significa Human in the loop - Humano necessário para concluir.",
  "AFK Significa Away from keyboard - Humano não será necessário para concluir (você pode fechar se entender que o trabalho foi concluído)",
].join("\n");

// Texto genérico por tipo de Issue (não há skill por tipo hoje).
export const ISSUE_TYPE_PROMPTS: Record<IssueType, string> = {
  Fix: "Fix: corrigir um comportamento defeituoso. Reproduza o bug, encontre a causa raiz e proteja com teste antes de corrigir. A conclusão da Issue depende de fotos ou vídeos do bug reproduzido, e do teste final que comprova que o bug foi corrigido.",
  Feat: "Feat: entregar uma capacidade nova. Alinhe intenção e requisitos, fatie em Tickets integráveis e mantenha o escopo no que foi pedido (YAGNI).",
  Research: "Research: reduzir incerteza. Formule as perguntas, investigue e registre achados/decisões para embasar o trabalho seguinte.",
  Refactor: "Refactor: melhorar a estrutura sem mudar o comportamento. Preserve a semântica observável e apoie-se em testes para garantir a equivalência.",
};

// Seed condensado de cada .claude/skills/*-phase/SKILL.md.
export const TICKET_TYPE_PROMPTS: Record<TicketType, string> = {
  Planning:
    "Planning: alinhar problema, requisitos (RF/RNF) e domínio; peça o gate G1. Escopo grande → crie Tickets de continuação. Encerre movendo o Ticket para AWAITING, e aguarde confirmação do humano (quando HITL) para gerar o próximo(s) Ticket(s) (Design).",
  Design:
    "Design: congelar a spec e fatiar o trabalho em Tickets independentes; peça o gate G2. Explorar desenho/prototipar são opcionais e descartáveis. Encerre em AWAITING, e aguarde confirmação do humano (quando HITL) para gerar o próximo(s) Ticket(s) (Implement). Faça o artefato do design no arquivo .md da Issue, usando o comando issues artifact --issue <id> --file <a.md>. Além disso, divida o trabalho de implementação obrigatoriamente em tickets pequenos, para que seja possível entregar uma fatia funcional/integrável com testes e review interno (review ≠ QA).",
  Implement:
    "Implement: entregar fatia funcional/integrável com testes e review interno (review ≠ QA). Fatia grande → feche criando continuações. Encerre movendo o Ticket para AWAITING, e aguarde confirmação do humano (quando HITL) para gerar o próximo(s) Ticket(s) (QA ou outros Implementations).",

  QA: "QA: validar o conjunto entregue contra requisitos e spec (não é o review da fatia); Seu objetivo é identificar erros e inconsistências na implementação feita, comparando-a com o que foi solicitado na Issue; Encerre em AWAITING, e aguarde confirmação do humano (quando HITL) para gerar o próximo(s) Ticket(s) (Deploy). Faça o artefato do QA no arquivo .md da Issue, usando o comando issues artifact --issue <id> --file <a.md>.",
  Deploy:
    "Deploy: preparar PR/entrega e pedir o gate G4 (go/no-go); não faça merge. Encerre em AWAITING com --last (sticky; dispara o Confirmation ao fechar), e aguarde confirmação do humano (quando HITL) para fechar a Issue.",
  Confirmation:
    "Confirmation: gerado pelo sistema ao fechar o último Ticket. Confronte o problema/critérios da Issue com o entregue, e confirme se a Issue foi concluída. Ela só é considerada concluída quando todos os Tickets estão fechados (exceto o Confirmation) e as entregas satisfazem os critérios de aceitação da Issue. Se estiver Resolvido → feche este Ticket (a Issue vai a AWAITING); faltou algo → crie os Tickets restantes.",
};

// Função pura: monta o prompt Markdown determinístico. Sem ticket, omite as seções 4 e 5.
export function composePrompt(issue: IssueData, ticket?: TicketData | null): string {
  const sections = [
    `## SDLC\n${SDLC_PROMPT}`,
    `## Tipo da Issue\n${ISSUE_TYPE_PROMPTS[issue.type]}`,
    `## Issue\n${issueInfo(issue)}`,
  ];
  if (ticket) {
    sections.push(`## Tipo do Ticket\n${TICKET_TYPE_PROMPTS[ticket.type]}`);
    sections.push(`## Ticket\n${ticketInfo(ticket, issue.project)}`);
  }
  sections.push(`## Comandos\n${COMMANDS_CATALOG}`);
  return sections.join("\n\n");
}

function issueInfo(issue: IssueData): string {
  return [
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

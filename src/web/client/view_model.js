export const ISSUE_STATUSES = ["OPEN", "CLAIMED", "ON-GOING", "AWAITING", "CLOSED"];
export const ISSUE_TYPES = ["Fix", "Feat", "Research", "Refactor"];
export const TICKET_TYPES = ["Planning", "Design", "Implement", "QA", "Deploy"];
export const CLOSED_REASONS = ["obsoleto", "duplicado", "concluido", "errado"];
export const TAG_VALUES = { complexity: ["BAIXA", "MEDIA", "ALTA"], human_need: ["HITL", "AFK"], risk: ["BAIXO", "MEDIO", "ALTO"] };
const PHASE_SHORT = { Planning: "P", Design: "D", Implement: "I", QA: "Q", Deploy: "D" };

export function tagRoute(issueId, scope, ticketId) {
  return scope === "ticket" ? `/api/issues/${issueId}/tickets/${ticketId}/tags` : `/api/issues/${issueId}/tags`;
}

const CREATE_FIELDS = ["title", "project", "type", "problem"];
const TICKET_FIELDS = ["objective", "task", "acceptance_criteria", "type"];

/** @typedef {{ id: string, title: string, project: string, type: string, status: string, created_at: string, status_changed_at?: string, phases?: { timestamp: string }[] }} IssueCard */
/** @typedef {{ ok: boolean, errors: Record<string, string> }} ValidationResult */

/**
 * @param {IssueCard[]} issues
 * @param {{ title: string, project: string, type: string, owner?: string }} filters
 */
export function filterIssues(issues, filters) {
  const title = filters.title.trim().toLowerCase();
  return issues.filter((issue) => (!title || issue.title.toLowerCase().includes(title))
    && (!filters.project || issue.project === filters.project)
    && (!filters.type || issue.type === filters.type)
    && (!filters.owner || issue.owner === filters.owner));
}

/**
 * Dentro de cada coluna: decisões pendentes primeiro, depois created_at ascendente.
 * @param {IssueCard[]} issues
 * @returns {Record<string, IssueCard[]>}
 */
export function groupIssues(issues) {
  return Object.fromEntries(ISSUE_STATUSES.map((status) => [status, issues
    .filter((issue) => issue.status === status)
    .sort(compareCards)]));
}

function compareCards(left, right) {
  const byDecision = Number(hasPendingDecision(right)) - Number(hasPendingDecision(left));
  return byDecision || left.created_at.localeCompare(right.created_at);
}

// Uma Issue é o "inbox" do humano quando ela mesma está AWAITING ou tem um Ticket AWAITING.
export function hasPendingDecision(issue) {
  return issue.status === "AWAITING" || (issue.tickets ?? []).some((ticket) => ticket.status === "AWAITING");
}

// Decisões pendentes (Issues AWAITING + Tickets AWAITING de Issues não-CLOSED), do mais antigo ao mais novo.
/** @returns {{ issueId: string, issueTitle: string, project: string, kind: "issue" | "ticket", ticketType?: string, since: string }[]} */
export function pendingDecisions(issues) {
  const out = [];
  for (const issue of issues ?? []) {
    if (issue.status === "CLOSED") continue;
    const since = issue.status_changed_at ?? issue.created_at;
    const base = { issueId: issue.id, issueTitle: issue.title, project: issue.project, since };
    if (issue.status === "AWAITING") out.push({ ...base, kind: "issue" });
    for (const ticket of issue.tickets ?? []) {
      if (ticket.status === "AWAITING") out.push({ ...base, kind: "ticket", ticketType: ticket.type });
    }
  }
  return out.sort((a, b) => String(a.since).localeCompare(String(b.since)));
}

// Fase concluída (só Tickets CLOSED), ativa (algum Ticket aberto) ou pendente (sem Ticket). Confirmation fica fora.
export function phaseSteps(issue) {
  const tickets = issue.tickets ?? [];
  return TICKET_TYPES.map((type) => {
    const ofType = tickets.filter((ticket) => ticket.type === type);
    const state = ofType.some((ticket) => ticket.status !== "CLOSED") ? "active" : ofType.length ? "done" : "pending";
    return { type, short: PHASE_SHORT[type], state };
  });
}

// Próximo tipo sugerido: a fase mais antiga ainda não concluída (primeiro step não "done").
// "" quando todas as fases já estão concluídas.
export function suggestNextTicketType(tickets) {
  const step = phaseSteps({ tickets }).find((candidate) => candidate.state !== "done");
  return step ? step.type : "";
}

// Espelha Issue.phaseBlocker: Ticket não-CLOSED de uma fase anterior na ordem TICKET_TYPES.
// Tipos fora da ordem do client (ex.: Confirmation) nunca bloqueiam.
export function phaseBlockerOf(tickets, type) {
  const rank = TICKET_TYPES.indexOf(type);
  if (rank < 0) return null;
  return (tickets ?? []).find((ticket) => {
    const r = TICKET_TYPES.indexOf(ticket.type);
    return ticket.status !== "CLOSED" && r >= 0 && r < rank;
  }) ?? null;
}

// Heurística de criação de Ticket: sem Tickets + não classificada = bloqueado (qualifique antes do 1º);
// com Tickets + não classificada = aviso não-bloqueante; caso contrário, ok.
export function ticketCreationGate(issue) {
  if (!isUnclassified(issue)) return "ok";
  return (issue.tickets ?? []).length ? "warn" : "blocked";
}

// Divide a thread em entradas antigas (escondidas) e as `visible` mais recentes.
export function splitThread(entries, visible = 5) {
  const list = entries ?? [];
  const cut = Math.max(0, list.length - visible);
  return { older: list.slice(0, cut), recent: list.slice(cut) };
}

// Issue não-CLOSED com qualquer tag ausente (complexity/human_need/risk) está "não classificada".
export function isUnclassified(issue) {
  if (issue.status === "CLOSED") return false;
  const tags = issue.tags ?? {};
  return !tags.complexity || !tags.human_need || !tags.risk;
}

// Agente possivelmente travado: Issue CLAIMED/ON-GOING sem mudança de Status há mais de 24h.
export function isStale(issue, now = new Date()) {
  if (issue.status !== "CLAIMED" && issue.status !== "ON-GOING") return false;
  const changed = issue.status_changed_at ?? issue.created_at;
  return now.getTime() - new Date(changed).getTime() > 24 * 3_600_000;
}

export function statusAge(issue, now = new Date()) {
  return statusAgeFrom(issue.status_changed_at ?? issue.phases?.at(-1)?.timestamp ?? issue.created_at, now);
}

export function statusAgeFrom(changed, now = new Date()) {
  const hours = Math.max(0, Math.floor((now.getTime() - new Date(changed).getTime()) / 3_600_000));
  if (hours < 1) return "há menos de 1 hora";
  if (hours < 24) return `há ${hours} hora${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

export function parseChecklist(text) {
  const items = [];
  for (const line of String(text ?? "").split("\n")) {
    const match = line.match(/^\s*\[([ xX])\]\s?(.*)$/);
    if (match) items.push({ done: match[1].toLowerCase() === "x", label: match[2].trim() });
  }
  return items;
}

export function options(issues, property) {
  return [...new Set(issues.map((issue) => issue[property]))].sort();
}

export function humanActions(status) {
  if (status === "OPEN") return ["close"];
  if (status === "CLAIMED") return ["reset"];
  if (status === "AWAITING") return ["decide-open", "decide-close"];
  return [];
}

export function ticketHumanActions(ticket) {
  if (ticket.status === "AWAITING") return ["ticket-decide-open", "ticket-decide-close"];
  if (ticket.status === "CLAIMED" && ticket.owner === "human") return ["ticket-await", "ticket-reopen", "ticket-close"];
  return [];
}

export function canCreateTicket(status) {
  return status === "CLAIMED" || status === "ON-GOING";
}

// Humano assume um Ticket OPEN para depois mudar seu status (owner). Espelha `issues ticket claim --human`.
export function canClaimTicket(ticket) {
  return ticket.status === "OPEN";
}

/** @returns {ValidationResult} */
export function validateCreate(values) {
  const errors = {};
  for (const field of CREATE_FIELDS) {
    if (!String(values[field] ?? "").trim()) errors[field] = "Campo obrigatório";
  }
  if (values.type?.trim() && !ISSUE_TYPES.includes(values.type)) errors.type = "Tipo inválido";
  return { ok: Object.keys(errors).length === 0, errors };
}

/** @returns {ValidationResult} */
export function validateCreateTicket(values) {
  const errors = {};
  for (const field of TICKET_FIELDS) {
    if (!String(values[field] ?? "").trim()) errors[field] = "Campo obrigatório";
  }
  if (values.type?.trim() && !TICKET_TYPES.includes(values.type)) errors.type = "Tipo inválido";
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateClose(values) {
  return validateCommentAndReason(values, { requireComment: false, requireReason: true });
}

export function validateReset(values) {
  return validateCommentAndReason(values, { requireComment: true, requireReason: false });
}

export function validateDecide(values) {
  if (values.status === "OPEN") return validateCommentAndReason(values, { requireComment: true, requireReason: false });
  return validateCommentAndReason(values, { requireComment: false, requireReason: true });
}

export function validateTicketStatus(values) {
  return validateCommentAndReason(values, { requireComment: true, requireReason: values.status === "CLOSED" });
}

export function attachmentsMarkup(attachments) {
  if (!attachments?.length) return "";
  const tags = attachments.map((att) => {
    const src = `/api/attachments/${encodeURIComponent(att.id)}`;
    if (att.kind === "video") return `<video class="attachment" controls src="${src}"></video>`;
    return `<a class="attachment" href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${escapeHtml(att.filename)}" loading="lazy"></a>`;
  }).join("");
  return `<div class="attachments">${tags}</div>`;
}

export function classifyMutationError(status, message) {
  if (status === 409) {
    return { kind: "conflict", message: "Esta Issue mudou desde a última atualização." };
  }
  return { kind: "error", message };
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

/** @returns {ValidationResult} */
function validateCommentAndReason(values, { requireComment, requireReason }) {
  const errors = {};
  if (requireComment && !String(values.comment ?? "").trim()) errors.comment = "Campo obrigatório";
  if (requireReason) {
    if (!String(values.closed_reason ?? "").trim()) errors.closed_reason = "Motivo obrigatório";
    else if (!CLOSED_REASONS.includes(values.closed_reason)) errors.closed_reason = "Motivo inválido";
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

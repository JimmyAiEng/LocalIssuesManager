export const ISSUE_STATUSES = ["OPEN", "CLAIMED", "ON-GOING", "AWAITING", "CLOSED"];
export const ISSUE_TYPES = ["Fix", "Feat", "Research", "Refactor"];
export const TICKET_TYPES = ["Planning", "Design", "Implement", "QA", "Deploy"];
export const CLOSED_REASONS = ["obsoleto", "duplicado", "concluido", "errado"];
export const TAG_VALUES = { complexity: ["BAIXA", "MEDIA", "ALTA"], human_need: ["HITL", "AFK"], risk: ["BAIXO", "MEDIO", "ALTO"] };

export function tagRoute(issueId, scope, ticketId) {
  return scope === "ticket" ? `/api/issues/${issueId}/tickets/${ticketId}/tags` : `/api/issues/${issueId}/tags`;
}

const CREATE_FIELDS = ["title", "project", "type", "problem"];
const TICKET_FIELDS = ["objective", "task", "acceptance_criteria", "type"];

export function filterIssues(issues, filters) {
  const title = filters.title.trim().toLowerCase();
  return issues.filter((issue) => (!title || issue.title.toLowerCase().includes(title))
    && (!filters.project || issue.project === filters.project)
    && (!filters.type || issue.type === filters.type));
}

export function groupIssues(issues) {
  return Object.fromEntries(ISSUE_STATUSES.map((status) => [status, issues
    .filter((issue) => issue.status === status)
    .sort((left, right) => left.created_at.localeCompare(right.created_at))]));
}

export function statusAge(issue, now = new Date()) {
  const changed = issue.status_changed_at ?? issue.phases?.at(-1)?.timestamp ?? issue.created_at;
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

export function validateCreate(values) {
  const errors = {};
  for (const field of CREATE_FIELDS) {
    if (!String(values[field] ?? "").trim()) errors[field] = "Campo obrigatório";
  }
  if (values.type?.trim() && !ISSUE_TYPES.includes(values.type)) errors.type = "Tipo inválido";
  return { ok: Object.keys(errors).length === 0, values, errors };
}

export function validateCreateTicket(values) {
  const errors = {};
  for (const field of TICKET_FIELDS) {
    if (!String(values[field] ?? "").trim()) errors[field] = "Campo obrigatório";
  }
  if (values.type?.trim() && !TICKET_TYPES.includes(values.type)) errors.type = "Tipo inválido";
  return { ok: Object.keys(errors).length === 0, values, errors };
}

export function validateClose(values) {
  return validateCommentAndReason(values, { requireComment: false, requireReason: true });
}

export function validateReset(values) {
  return validateCommentAndReason(values, { requireComment: true, requireReason: false });
}

export function validateDecide(values) {
  if (values.status === "OPEN") {
    const result = validateCommentAndReason({ comment: values.comment }, { requireComment: true, requireReason: false });
    return { ok: result.ok, values, errors: result.errors };
  }
  return validateCommentAndReason(values, { requireComment: false, requireReason: true });
}

export function validateTicketStatus(values) {
  const requireReason = values.status === "CLOSED";
  const result = validateCommentAndReason(values, { requireComment: true, requireReason });
  return { ok: result.ok, values, errors: result.errors };
}

export function attachmentsMarkup(attachments) {
  if (!attachments?.length) return "";
  const tags = attachments.map((att) => {
    const src = `/api/attachments/${encodeURIComponent(att.id)}`;
    if (att.kind === "video") return `<video class="attachment" controls src="${src}"></video>`;
    return `<a class="attachment" href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${escapeAttr(att.filename)}" loading="lazy"></a>`;
  }).join("");
  return `<div class="attachments">${tags}</div>`;
}

export function classifyMutationError(status, message) {
  if (status === 409) {
    return { kind: "conflict", message: "Esta Issue mudou desde a última atualização." };
  }
  return { kind: "error", message };
}

function escapeAttr(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function validateCommentAndReason(values, { requireComment, requireReason }) {
  const errors = {};
  if (requireComment && !String(values.comment ?? "").trim()) errors.comment = "Campo obrigatório";
  if (requireReason) {
    if (!String(values.closed_reason ?? "").trim()) errors.closed_reason = "Motivo obrigatório";
    else if (!CLOSED_REASONS.includes(values.closed_reason)) errors.closed_reason = "Motivo inválido";
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

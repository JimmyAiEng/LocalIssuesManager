export const ISSUE_STATUSES = ["OPEN", "CLAIMED", "AWAITING", "CLOSED"];
export const ISSUE_TYPES = ["Fix", "Feat", "Research", "Refactor"];
export const ACTION_TYPES = ["Planning", "Design", "Implement", "Review", "Deploy"];
export const CLOSED_REASONS = ["obsoleto", "duplicado", "concluido", "errado"];
export const TAG_VALUES = { complexity: ["BAIXA", "MEDIA", "ALTA"], human_need: ["HITL", "AFK"], risk: ["BAIXO", "MEDIO", "ALTO"] };
export const CONCERN_LEVELS = ["LOW", "HIGH"];

const CREATE_FIELDS = ["title", "project", "type", "action", "problem"];

/** @typedef {{ id: string, title: string, project: string, type: string, action: string, status: string, created_at: string, status_changed_at?: string, phases?: { timestamp: string }[] }} IssueCard */
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

// Uma Issue é o "inbox" do humano quando está AWAITING (evidência entregue, decisão pendente).
export function hasPendingDecision(issue) {
  return issue.status === "AWAITING";
}

// Decisões pendentes (Issues AWAITING), da mais antiga à mais nova.
/** @returns {{ issueId: string, issueTitle: string, project: string, action: string, since: string }[]} */
export function pendingDecisions(issues) {
  return (issues ?? [])
    .filter((issue) => issue.status === "AWAITING")
    .map((issue) => ({ issueId: issue.id, issueTitle: issue.title, project: issue.project,
      action: issue.action, since: issue.status_changed_at ?? issue.created_at }))
    .sort((a, b) => String(a.since).localeCompare(String(b.since)));
}

// Divide a thread em entradas antigas (escondidas) e as `visible` mais recentes.
export function splitThread(entries, visible = 5) {
  const list = entries ?? [];
  const cut = Math.max(0, list.length - visible);
  return { older: list.slice(0, cut), recent: list.slice(cut) };
}

// Issue não-CLOSED sem complexity ou sem risk está "não classificada" — a classificação
// alimenta a autonomia (HITL/risco ALTO/complexidade ALTA exigem decisão humana).
export function isUnclassified(issue) {
  if (issue.status === "CLOSED") return false;
  const tags = issue.tags ?? {};
  return !tags.complexity || !tags.risk;
}

// Agente possivelmente travado: Issue CLAIMED sem mudança de Status há mais de 24h.
export function isStale(issue, now = new Date()) {
  if (issue.status !== "CLAIMED") return false;
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

/** @returns {ValidationResult} */
export function validateCreate(values) {
  const errors = {};
  for (const field of CREATE_FIELDS) {
    if (!String(values[field] ?? "").trim()) errors[field] = "Campo obrigatório";
  }
  if (values.type?.trim() && !ISSUE_TYPES.includes(values.type)) errors.type = "Tipo inválido";
  if (values.action?.trim() && !ACTION_TYPES.includes(values.action)) errors.action = "Action inválida";
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateProject(values) {
  const errors = {};
  for (const field of ["name", "repo"]) {
    if (!String(values[field] ?? "").trim()) errors[field] = "Campo obrigatório";
  }
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

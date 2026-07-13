export const STATUSES = ["OPEN", "CLAIMED", "AWAITING", "CLOSED"];
export const TAGS = ["Planning", "Design", "Implement", "QA", "Deployment", "Maintenance"];
export const CLOSED_REASONS = ["obsoleto", "duplicado", "concluido", "errado"];

const CREATE_FIELDS = ["title", "project", "tag", "problem", "artifacts", "acceptance_criteria"];

export function filterIssues(issues, filters) {
  const title = filters.title.trim().toLowerCase();
  return issues.filter((issue) => (!title || issue.title.toLowerCase().includes(title))
    && (!filters.project || issue.project === filters.project)
    && (!filters.tag || issue.tag === filters.tag));
}

export function groupIssues(issues) {
  return Object.fromEntries(STATUSES.map((status) => [status, issues
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

export function options(issues, property) {
  return [...new Set(issues.map((issue) => issue[property]))].sort();
}

export function humanActions(status) {
  if (status === "OPEN") return ["close"];
  if (status === "CLAIMED") return ["reset"];
  if (status === "AWAITING") return ["decide-open", "decide-close"];
  return [];
}

export function validateCreate(values) {
  const errors = {};
  for (const field of CREATE_FIELDS) {
    if (!String(values[field] ?? "").trim()) errors[field] = "Campo obrigatório";
  }
  if (values.tag?.trim() && !TAGS.includes(values.tag)) errors.tag = "TAG inválida";
  return { ok: Object.keys(errors).length === 0, values, errors };
}

export function validateClose(values) {
  return validateCommentAndReason(values, true);
}

export function validateReset(values) {
  return validateCommentAndReason(values, false);
}

export function validateDecide(values) {
  if (values.status === "OPEN") {
    const result = validateCommentAndReason({ comment: values.comment }, false);
    return { ok: result.ok, values, errors: result.errors };
  }
  return validateCommentAndReason(values, true);
}

export function classifyMutationError(status, message) {
  if (status === 409) {
    return { kind: "conflict", message: "Esta Issue mudou desde a última atualização." };
  }
  return { kind: "error", message };
}

function validateCommentAndReason(values, requireReason) {
  const errors = {};
  if (!String(values.comment ?? "").trim()) errors.comment = "Campo obrigatório";
  if (requireReason) {
    if (!String(values.closed_reason ?? "").trim()) errors.closed_reason = "Motivo obrigatório";
    else if (!CLOSED_REASONS.includes(values.closed_reason)) errors.closed_reason = "Motivo inválido";
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

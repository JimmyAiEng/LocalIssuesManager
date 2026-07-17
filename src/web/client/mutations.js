import {
  classifyMutationError, humanActions, tagRoute, ticketHumanActions,
  validateClose, validateCreate, validateCreateTicket, validateDecide, validateReset, validateTicketStatus,
} from "./view_model.js";
import { clearActionState, emptyDraft, emptyTicketDraft, state } from "./state.js";
import { api } from "./http.js";
import { renderError, renderNewIssue } from "./view.js";
import { renderDetail } from "./detail_view.js";

export function readForm(form, target) {
  // Só campos de texto: o FormData também traz o <input type=file> dos anexos, que readAttachments
  // lê à parte. Copiá-lo gravaria "[object File]" no draft — e submitCreateTicket serializa o draft
  // inteiro no POST, o que a API rejeita com "Invalid attachments". Mesma exclusão do handler de input.
  for (const [key, value] of new FormData(form).entries()) if (typeof value === "string") target[key] = value;
}

export async function submitCreate(form) {
  const result = validateCreate(state.draft);
  state.errors = result.errors;
  if (!result.ok) return renderNewIssue();
  const attachments = await readAttachments(form); // lê antes do re-render, que destrói o <input> e perde a seleção
  state.busy = true;
  renderNewIssue();
  try {
    const created = await api("/api/issues", { method: "POST", body: createPayload(state.draft, attachments) });
    const fresh = await api(`/api/issues/${created.id}`);
    await reloadIssues();
    state.draft = emptyDraft();
    state.errors = {};
    state.feedback = { kind: "success", message: "Issue criada" };
    state.busy = false;
    history.pushState({}, "", `/issues/${fresh.id}`);
    state.issue = fresh;
    renderDetail();
  } catch (error) {
    state.busy = false;
    state.feedback = classifyMutationError(error.status ?? 500, error.message);
    renderNewIssue();
  }
}

export async function submitCreateTicket(form) {
  const result = validateCreateTicket(state.ticketDraft);
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
  const attachments = await readAttachments(form); // lê antes do re-render, que destrói o <input>
  state.busy = true;
  renderDetail();
  const body = { ...state.ticketDraft };
  if (attachments.length) body.attachments = attachments;
  try {
    await api(`/api/issues/${state.issue.id}/tickets`, { method: "POST", body });
    state.ticketDraft = emptyTicketDraft();
    await finishMutation("Ticket criado");
  } catch (error) { failMutation(error); }
}

export async function submitTags(form) {
  const body = {};
  for (const [key, value] of new FormData(form).entries()) if (value) body[key] = String(value);
  if (!Object.keys(body).length) {
    state.feedback = { kind: "error", message: "Selecione ao menos uma classificação" };
    return renderDetail();
  }
  state.errors = {};
  state.busy = true;
  renderDetail();
  const path = tagRoute(state.issue.id, form.dataset.tagScope, form.dataset.ticketId);
  await mutate(path, body, "Classificação atualizada");
}

export async function submitComment(form) {
  const ticketId = form.dataset.ticketId;
  const comment = String(state.commentDraft.comment ?? "").trim();
  // lê os arquivos antes do re-render, que destrói o <input> e perde a seleção
  const attachments = await readAttachments(form);
  if (!comment && !attachments.length) {
    state.errors = { comment: "Escreva um comentário ou anexe um arquivo" };
    return renderDetail();
  }
  state.errors = {};
  state.busy = true;
  renderDetail();
  const base = `/api/issues/${state.issue.id}`;
  const path = ticketId ? `${base}/tickets/${ticketId}/comment` : `${base}/comment`;
  await mutate(path, { comment, attachments }, "Comentário adicionado");
}

// Lê os <input type=file> de um form como anexos base64 (formato aceito pela API). Reutilizado por
// comentário, criação de Issue/Ticket e devolução para OPEN. Chame antes de qualquer re-render.
async function readAttachments(form) {
  const input = form?.querySelector("input[type=file]");
  const files = input ? [...input.files] : [];
  return Promise.all(files.map(async (file) => ({
    filename: file.name, mediaType: file.type, data: await fileToBase64(file),
  })));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function submitAction(form) {
  if (state.panel === "reset") return submitReset(form);
  if (state.panel === "decide-open") return submitDecide("OPEN", form);
  if (state.panel === "decide-close" || state.panel === "close") return submitClose();
}

// Submit válido do form de fechamento não muta: entra em confirmação (UX.md §6).
async function submitClose() {
  const values = { comment: state.draft.comment, closed_reason: state.draft.closed_reason };
  const result = state.panel === "close" ? validateClose(values) : validateDecide({ ...values, status: "CLOSED" });
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
  state.confirmClose = true;
  renderDetail();
}

// Só "Fechar definitivamente" chama a API.
export async function performClose() {
  state.confirmClose = false;
  state.busy = true;
  renderDetail();
  const path = state.panel === "close"
    ? `/api/issues/${state.issue.id}/close`
    : `/api/issues/${state.issue.id}/decision`;
  const body = state.panel === "close"
    ? { comment: state.draft.comment, closed_reason: state.draft.closed_reason }
    : { status: "CLOSED", comment: state.draft.comment, closed_reason: state.draft.closed_reason };
  await mutate(path, body, "Issue fechada");
}

async function submitReset(form) {
  const result = validateReset({ comment: state.draft.comment });
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
  const attachments = await readAttachments(form); // lê antes do re-render, que destrói o <input>
  state.busy = true;
  renderDetail();
  const body = { comment: state.draft.comment };
  if (attachments.length) body.attachments = attachments;
  await mutate(`/api/issues/${state.issue.id}/reset`, body, "Issue devolvida para OPEN");
}

async function submitDecide(status, form) {
  const result = validateDecide({ status, comment: state.draft.comment });
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
  const attachments = await readAttachments(form); // lê antes do re-render, que destrói o <input>
  state.busy = true;
  renderDetail();
  const body = { status, comment: state.draft.comment };
  if (attachments.length) body.attachments = attachments;
  await mutate(`/api/issues/${state.issue.id}/decision`, body, "Issue devolvida para OPEN");
}

export async function claimIssue() {
  state.errors = {};
  state.busy = true;
  renderDetail();
  await mutate(`/api/issues/${state.issue.id}/claim`, {}, "Issue assumida");
}

export async function claimTicket(ticketId) {
  state.errors = {};
  state.busy = true;
  renderDetail();
  await mutate(`/api/issues/${state.issue.id}/tickets/${ticketId}/claim`, {}, "Ticket assumido");
}

export async function submitTicketAction(form) {
  const { ticketId, action } = state.ticketPanel;
  const plan = ticketActionPlan(action);
  const result = plan.validate({ status: plan.status, comment: state.draft.comment, closed_reason: state.draft.closed_reason });
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
  const attachments = await readAttachments(form); // lê antes do re-render, que destrói o <input>
  state.busy = true;
  renderDetail();
  const base = `/api/issues/${state.issue.id}/tickets/${ticketId}`;
  const body = { status: plan.status, comment: state.draft.comment, closed_reason: state.draft.closed_reason || undefined };
  if (attachments.length) body.attachments = attachments;
  await mutate(`${base}/${plan.route}`, body, plan.message);
}

function ticketActionPlan(action) {
  const plans = {
    "ticket-decide-open": { route: "decision", status: "OPEN", validate: validateDecide, message: "Ticket devolvido para OPEN" },
    "ticket-decide-close": { route: "decision", status: "CLOSED", validate: validateDecide, message: "Ticket fechado" },
    "ticket-await": { route: "status", status: "AWAITING", validate: validateTicketStatus, message: "Ticket enviado para decisão" },
    "ticket-reopen": { route: "status", status: "OPEN", validate: validateTicketStatus, message: "Ticket devolvido para OPEN" },
    "ticket-close": { route: "status", status: "CLOSED", validate: validateTicketStatus, message: "Ticket concluído" },
  };
  return plans[action];
}

async function mutate(path, body, successMessage) {
  try {
    await api(path, { method: "POST", body });
    await finishMutation(successMessage);
  } catch (error) { failMutation(error); }
}

async function finishMutation(successMessage) {
  const fresh = await api(`/api/issues/${state.issue.id}`);
  await reloadIssues();
  state.issue = fresh;
  clearActionState();
  state.draft = emptyDraft();
  state.feedback = { kind: "success", message: successMessage };
  renderDetail();
}

function failMutation(error) {
  state.busy = false;
  state.feedback = classifyMutationError(error.status ?? 500, error.message);
  renderDetail();
}

export async function reloadIssues() {
  state.issues = await api("/api/issues");
  state.refreshedAt = new Date();
}

// Requisitos Gherkin da Issue: 404 (não persistidos) ou erro de rede → null, sem ruído na tela.
export async function fetchRequirements(id) {
  try { return await api(`/api/issues/${id}/requirements`); } catch { return null; }
}

export async function refreshIssue() {
  const draft = { ...state.draft };
  const panel = state.panel;
  const ticketPanel = state.ticketPanel;
  const commentPanel = state.commentPanel;
  const commentDraft = { ...state.commentDraft };
  try {
    const id = state.issue.id;
    const [issue, requirements] = await Promise.all([api(`/api/issues/${id}`), fetchRequirements(id)]);
    // Só re-renderiza se o JSON mudou (mesmo contrato de pollBoard): re-render reescreve o
    // innerHTML e levaria junto seleção de texto e rolagem de quem só está lendo.
    if (JSON.stringify(issue) === JSON.stringify(state.issue)
      && JSON.stringify(requirements) === JSON.stringify(state.requirements)) return;
    state.issue = issue;
    state.requirements = requirements;
    state.draft = draft;
    state.commentDraft = commentDraft;
    state.commentPanel = commentStillValid(commentPanel) ? commentPanel : null;
    state.panel = humanActions(state.issue.status).includes(panel) ? panel : null;
    state.ticketPanel = ticketStillOpen(ticketPanel) ? ticketPanel : null;
    state.feedback = state.feedback?.kind === "conflict" ? null : state.feedback;
    renderDetail();
  } catch (error) { renderError(error); }
}

function commentStillValid(commentPanel) {
  if (!commentPanel) return false;
  if (commentPanel.scope === "issue") return state.issue.status !== "CLOSED";
  const ticket = state.issue.tickets?.find((candidate) => candidate.id === commentPanel.ticketId);
  return Boolean(ticket && ticket.status !== "CLOSED");
}

function ticketStillOpen(ticketPanel) {
  if (!ticketPanel) return false;
  const ticket = state.issue.tickets?.find((candidate) => candidate.id === ticketPanel.ticketId);
  return Boolean(ticket && ticketHumanActions(ticket).includes(ticketPanel.action));
}

function createPayload(draft, attachments = []) {
  const payload = {
    title: draft.title, project: draft.project, type: draft.type, problem: draft.problem,
    artifacts: draft.artifacts, acceptance_criteria: draft.acceptance_criteria,
  };
  for (const tag of ["complexity", "human_need", "risk"]) if (draft[tag]) payload[tag] = draft[tag]; // só envia tags escolhidas
  if (attachments.length) payload.attachments = attachments;
  return payload;
}

import {
  classifyMutationError, humanActions,
  validateClose, validateCreate, validateDecide, validateProject, validateReset,
} from "./view_model.js";
import { clearActionState, emptyDraft, emptyProjectDraft, state } from "./state.js";
import { api } from "./http.js";
import { renderBoard, renderError, renderNewIssue, renderNewProject } from "./view.js";
import { renderDetail } from "./detail_view.js";

export function readForm(form, target) {
  // Só campos de texto: o FormData também traz o <input type=file> dos anexos, que readAttachments
  // lê à parte. Copiá-lo gravaria "[object File]" no draft — e o POST serializa o draft inteiro,
  // o que a API rejeita com "Invalid attachments". Mesma exclusão do handler de input.
  for (const [key, value] of new FormData(form).entries()) if (typeof value === "string") target[key] = value;
}

export async function submitCreateProject(form) {
  readForm(form, state.projectDraft);
  const result = validateProject(state.projectDraft);
  state.errors = result.errors;
  if (!result.ok) return renderNewProject();
  state.busy = true;
  renderNewProject();
  try {
    const draft = state.projectDraft;
    const payload = { name: draft.name, repo: draft.repo };
    if (draft.concern) payload.concern = draft.concern; // só envia se escolhido; ausente → API default LOW
    await api("/api/projects", { method: "POST", body: payload });
    state.projects = await api("/api/projects");
    state.projectDraft = emptyProjectDraft();
    state.errors = {};
    state.busy = false;
    state.feedback = { kind: "success", message: `Projeto ${payload.name} registrado` };
    history.pushState({}, "", "/issues/new"); // o próximo passo é criar a Issue no projeto novo
    renderNewIssue();
  } catch (error) {
    state.busy = false;
    state.feedback = { kind: "error", message: error.message };
    renderNewProject();
  }
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
  await mutate(`/api/issues/${state.issue.id}/tags`, body, "Classificação atualizada");
}

export async function submitComment(form) {
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
  await mutate(`/api/issues/${state.issue.id}/comment`, { comment, attachments }, "Comentário adicionado");
}

// Lê os <input type=file> de um form como anexos base64 (formato aceito pela API). Reutilizado por
// comentário, criação de Issue e devolução para OPEN. Chame antes de qualquer re-render.
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

// Só "Remover definitivamente" chama a API. No sucesso não dá para usar o finishMutation padrão:
// ele refaria o GET da Issue que acabou de ser apagada — fecha o detalhe e volta ao quadro.
export async function performDelete() {
  state.confirmDelete = false;
  state.busy = true;
  renderDetail();
  try {
    await api(`/api/issues/${state.issue.id}/delete`, { method: "POST", body: {} });
    await reloadIssues();
    clearActionState();
    state.issue = null;
    state.draft = emptyDraft();
    // ponytail: sem mensagem de sucesso — o quadro não renderiza feedback, e a Issue sumir do quadro já é o retorno.
    history.pushState({}, "", "/");
    renderBoard();
  } catch (error) { failMutation(error); }
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

async function reloadIssues() {
  state.issues = await api("/api/issues");
  state.refreshedAt = new Date();
}

// Requisitos Gherkin da Issue: 404 (não persistidos) ou erro de rede → null, sem ruído na tela.
export async function fetchRequirements(id) {
  try { return await api(`/api/issues/${id}/requirements`); } catch { return null; }
}

// Pacote de Design (design.md + diagramas). Mesmo contrato de fetchRequirements: falha → null.
export async function fetchDesign(id) {
  try { return await api(`/api/issues/${id}/design`); } catch { return null; }
}

// Documentos nomeados da Issue (intent.md, evidence-*.md). Mesmo contrato de fetchDesign: falha → null.
export async function fetchDocuments(id) {
  try { return await api(`/api/issues/${id}/documents`); } catch { return null; }
}

export async function refreshIssue() {
  const draft = { ...state.draft };
  const panel = state.panel;
  const commentPanel = state.commentPanel;
  const commentDraft = { ...state.commentDraft };
  try {
    const id = state.issue.id;
    const [issue, requirements, design, documents] = await Promise.all([api(`/api/issues/${id}`), fetchRequirements(id), fetchDesign(id), fetchDocuments(id)]);
    // Só re-renderiza se o JSON mudou (mesmo contrato de pollBoard): re-render reescreve o
    // innerHTML e levaria junto seleção de texto e rolagem de quem só está lendo.
    if (JSON.stringify(issue) === JSON.stringify(state.issue)
      && JSON.stringify(requirements) === JSON.stringify(state.requirements)
      && JSON.stringify(design) === JSON.stringify(state.design)
      && JSON.stringify(documents) === JSON.stringify(state.documents)) return;
    state.issue = issue;
    state.requirements = requirements;
    state.design = design;
    state.documents = documents;
    state.draft = draft;
    state.commentDraft = commentDraft;
    state.commentPanel = commentPanel && state.issue.status !== "CLOSED" ? commentPanel : null;
    state.panel = humanActions(state.issue.status).includes(panel) ? panel : null;
    state.feedback = state.feedback?.kind === "conflict" ? null : state.feedback;
    renderDetail();
  } catch (error) { renderError(error); }
}

function createPayload(draft, attachments = []) {
  const payload = {
    title: draft.title, project: draft.project, type: draft.type, action: draft.action,
    problem: draft.problem, acceptance_criteria: draft.acceptance_criteria,
  };
  for (const tag of ["complexity", "human_need", "risk"]) if (draft[tag]) payload[tag] = draft[tag]; // só envia tags escolhidas
  if (attachments.length) payload.attachments = attachments;
  return payload;
}

import {
  CLOSED_REASONS, ISSUE_STATUSES, ISSUE_TYPES, TICKET_TYPES, attachmentsMarkup, canCreateTicket, classifyMutationError,
  filterIssues, groupIssues, humanActions, options, parseChecklist, statusAge, ticketHumanActions,
  validateClose, validateCreate, validateCreateTicket, validateDecide, validateReset, validateTicketStatus,
} from "./view_model.js";

const state = {
  issues: [], filters: loadFilters(), refreshedAt: null,
  issue: null, draft: emptyDraft(), panel: null,
  ticketPanel: null, ticketDraft: emptyTicketDraft(), showTicketForm: false,
  commentPanel: null, commentDraft: emptyCommentDraft(),
  feedback: null, errors: {}, busy: false,
};

window.addEventListener("popstate", () => { clearActionState(); renderRoute(); });
document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleInput);
document.addEventListener("submit", handleSubmit);
refresh();

async function refresh() {
  renderLoading();
  try {
    state.issues = await api("/api/issues");
    state.refreshedAt = new Date();
    renderRoute();
  } catch (error) { renderError(error); }
}

function renderRoute() {
  const path = location.pathname;
  if (path === "/issues/new") return renderNewIssue();
  if (path.startsWith("/issues/")) return loadDetail(decodeURIComponent(path.slice(8)));
  renderBoard();
}

function renderBoard() {
  const filtered = filterIssues(state.issues, state.filters);
  const columns = groupIssues(filtered);
  document.title = "Issues locais";
  root().innerHTML = `${boardControls()}<section class="board">${ISSUE_STATUSES.map((status) => column(status, columns[status])).join("")}</section>`;
  restoreScroll();
}

function boardControls() {
  const projects = selectOptions(options(state.issues, "project"), state.filters.project, "Todos os Projetos");
  const types = selectOptions(options(state.issues, "type"), state.filters.type, "Todos os Tipos");
  const updated = state.refreshedAt ? state.refreshedAt.toLocaleTimeString() : "ainda não atualizado";
  return `<header class="toolbar"><h1>Issues</h1><a class="button" href="/issues/new">+ Nova Issue</a><label>Buscar título <input id="title" value="${escape(state.filters.title)}"></label><label>Projeto <select id="project">${projects}</select></label><label>Tipo <select id="type">${types}</select></label><button type="button" id="clear" ${hasFilters() ? "" : "disabled"}>Limpar filtros</button><button type="button" id="refresh">Atualizar quadro</button><output aria-live="polite">Atualizado às ${updated}</output></header>`;
}

function column(status, issues) {
  const cards = issues.length ? issues.map(card).join("") : `<p class="empty">Nenhuma Issue ${status}</p>`;
  return `<section class="column status-${status}" aria-labelledby="${status}"><h2 id="${status}">${status} <small>${issues.length}</small></h2><p>${labels[status]}</p>${cards}</section>`;
}

function card(issue) {
  const owner = issue.owner ? `<span class="owner">${escape(issue.owner)}</span>` : "";
  const tickets = issue.tickets?.length ? `<span class="pill-count">${issue.tickets.length} Ticket${issue.tickets.length === 1 ? "" : "s"}</span>` : "";
  return `<a class="card status-${issue.status}" href="/issues/${issue.id}" data-issue-id="${issue.id}"><strong>${escape(issue.title)}</strong><span>${escape(issue.project)} · ${escape(issue.type)}</span>${owner}${tickets}<time title="${escape(issue.phases?.at(-1)?.timestamp ?? issue.created_at)}">${statusAge(issue)}</time></a>`;
}

async function loadDetail(id) {
  if (state.issue?.id !== id) {
    clearActionState();
    state.draft = emptyDraft();
    state.ticketDraft = emptyTicketDraft();
  }
  root().innerHTML = `<p class="loading" aria-live="polite">Carregando Issue…</p>`;
  try {
    state.issue = await api(`/api/issues/${id}`);
    renderDetail();
  } catch (error) { renderError(error); }
}

function renderDetail() {
  const issue = state.issue;
  document.title = `${issue.title} · Issues`;
  const owner = issue.owner ? `Owner: ${escape(issue.owner)}` : "Sem Owner";
  const closed = issue.closed_reason ? `<section class="box"><h2>Motivo de fechamento</h2><p class="preserve">${escape(issue.closed_reason)}</p></section>` : "";
  const actions = humanActions(issue.status).length ? `<section class="actionbar"><h2>Ações</h2>${actionsPanel(issue)}</section>` : "";
  root().innerHTML = `<header class="toolbar"><a class="button" href="/" data-back>← Voltar ao quadro</a><button type="button" id="refresh-issue">Atualizar Issue</button></header>${feedback()}<main class="detail"><header><span class="badge status-${issue.status}">${issue.status}</span><h1>${escape(issue.title)}</h1><p class="meta">Projeto: ${escape(issue.project)} · Tipo: ${escape(issue.type)} · ${owner}</p><p class="meta">ID: <code>${escape(issue.id)}</code> · No Status ${statusAge(issue)}</p></header>${closed}${field("Problema", issue.problem)}${field("Artefatos", issue.artifacts)}${criteriaField(issue.acceptance_criteria)}${ticketsSection(issue)}${dates(issue)}${thread(issue.thread)}${commentSection(issue)}${actions}</main>`;
}

function commentSection(issue) {
  if (issue.status === "CLOSED") return "";
  const open = state.commentPanel?.scope === "issue";
  const body = open ? commentForm(null) : `<button type="button" class="new-comment" data-open-comment="issue">+ Comentar</button>`;
  return `<section class="box"><h2>Comentar</h2>${body}</section>`;
}

function commentForm(ticketId) {
  const idAttr = ticketId ? ` data-ticket-id="${ticketId}"` : "";
  return `<form id="comment-form" class="form"${idAttr}>${summaryError()}<label>Comentário<textarea name="comment" rows="3">${escape(state.commentDraft.comment ?? "")}</textarea></label><label>Anexos (imagem/vídeo)<input type="file" name="attachments" multiple accept="image/*,video/*"></label><div class="form-actions"><button ${state.busy ? "disabled" : ""}>Enviar comentário</button><button type="button" data-cancel-comment>Cancelar</button></div></form>`;
}

function actionsPanel(issue) {
  const available = humanActions(issue.status);
  if (!available.length) return `<p class="muted">Issue imutável</p>`;
  const buttons = available.map((action) => `<button type="button" data-open-panel="${action}">${actionLabel(action)}</button>`).join(" ");
  return `<div class="actions">${buttons}</div>${actionForm(issue)}`;
}

function actionForm(issue) {
  if (!state.panel || !humanActions(issue.status).includes(state.panel)) return "";
  if (state.panel === "reset") {
    return `<form id="action-form" class="form">${summaryError()}<p class="hint">A Issue voltará para OPEN e o Owner será removido.</p>${commentField()}<button ${state.busy ? "disabled" : ""}>Fazer Reset</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
  }
  if (state.panel === "decide-open") {
    return `<form id="action-form" class="form">${summaryError()}${commentField()}<button ${state.busy ? "disabled" : ""}>Confirmar devolução</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
  }
  return `<form id="action-form" class="form">${summaryError()}${commentField()}${reasonField()}<button ${state.busy ? "disabled" : ""}>Fechar Issue</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
}

/* ---------- Tickets (agregado da Issue) ---------- */

function ticketsSection(issue) {
  const cards = issue.tickets?.length ? issue.tickets.map(ticketCard).join("") : `<p class="empty">Nenhum Ticket ainda</p>`;
  return `<section class="box"><h2>Tickets <small>${issue.tickets?.length ?? 0}</small></h2><div class="tickets">${cards}</div>${ticketCreate(issue)}</section>`;
}

function ticketCard(ticket) {
  const owner = ticket.owner ? `<span class="owner">${escape(ticket.owner)}</span>` : "";
  const references = ticket.references?.trim() ? `<p class="ticket-refs">Referências: ${escape(ticket.references)}</p>` : "";
  return `<article class="ticket status-${ticket.status}"><header class="ticket-head"><span class="badge status-${ticket.status}">${ticket.status}</span><span class="ticket-type">${escape(ticket.type)}</span>${owner}</header><h3>${escape(ticket.objective)}</h3><p class="preserve ticket-task">${escape(ticket.task)}</p>${references}<details class="ticket-thread"><summary>Thread (${ticket.thread.length})</summary><ol class="thread">${ticket.thread.map(message).join("")}</ol></details>${ticketCommentSection(ticket)}${ticketActionsPanel(ticket)}</article>`;
}

function ticketCommentSection(ticket) {
  if (ticket.status === "CLOSED") return "";
  const open = state.commentPanel?.scope === "ticket" && state.commentPanel.ticketId === ticket.id;
  if (open) return commentForm(ticket.id);
  return `<button type="button" class="new-comment" data-open-comment="ticket" data-ticket-id="${ticket.id}">+ Comentar</button>`;
}

function ticketActionsPanel(ticket) {
  const available = ticketHumanActions(ticket);
  if (!available.length) return "";
  const buttons = available.map((action) => `<button type="button" data-open-ticket-panel="${action}" data-ticket-id="${ticket.id}">${ticketActionLabel(action)}</button>`).join(" ");
  return `<div class="actions">${buttons}</div>${ticketActionForm(ticket)}`;
}

function ticketActionForm(ticket) {
  if (state.ticketPanel?.ticketId !== ticket.id) return "";
  const action = state.ticketPanel.action;
  const reason = action.endsWith("-close") ? reasonField() : "";
  return `<form id="ticket-action-form" class="form" data-ticket-id="${ticket.id}">${summaryError()}${commentField()}${reason}<button ${state.busy ? "disabled" : ""}>${ticketActionLabel(action)}</button><button type="button" data-cancel-ticket-panel>Cancelar</button></form>`;
}

function ticketCreate(issue) {
  if (!canCreateTicket(issue.status)) return "";
  if (!state.showTicketForm) return `<button type="button" id="toggle-ticket-form" class="new-ticket">+ Novo Ticket</button>`;
  const draft = state.ticketDraft;
  return `<form id="ticket-create-form" class="form" novalidate>${summaryError()}
    ${selectInput("type", "Tipo", TICKET_TYPES, draft.type)}
    ${areaInput("objective", "Objetivo", draft.objective)}
    ${areaInput("task", "Tarefa", draft.task)}
    ${areaInput("acceptance_criteria", "Critérios de aceite", draft.acceptance_criteria)}
    ${areaInput("artifacts", "Artefatos (opcional)", draft.artifacts)}
    ${areaInput("references", "Referências (opcional)", draft.references)}
    <div class="form-actions"><button ${state.busy ? "disabled" : ""}>Criar Ticket</button><button type="button" id="toggle-ticket-form">Cancelar</button></div>
  </form>`;
}

function renderNewIssue() {
  document.title = "Nova Issue · Issues";
  const draft = state.draft;
  const projects = options(state.issues, "project");
  root().innerHTML = `<main class="form-page"><a class="button" href="/" data-back>← Voltar ao quadro</a><h1>Nova Issue</h1>${feedback()}<form id="create-form" class="form" novalidate>${summaryError()}
    ${textInput("title", "Título", draft.title)}
    ${textInput("project", "Projeto", draft.project, projects)}
    ${selectInput("type", "Tipo", ISSUE_TYPES, draft.type)}
    ${areaInput("problem", "Problema", draft.problem)}
    ${areaInput("artifacts", "Artefatos (opcional)", draft.artifacts)}
    ${areaInput("acceptance_criteria", "Critérios de aceite (opcional)", draft.acceptance_criteria)}
    <div class="form-actions"><button ${state.busy ? "disabled" : ""}>Salvar Issue</button><a class="button" href="/" data-back>Cancelar</a></div>
  </form></main>`;
}

function textInput(name, label, value, suggestions = []) {
  const list = suggestions.length ? ` list="${name}-list"` : "";
  const datalist = suggestions.length ? `<datalist id="${name}-list">${suggestions.map((item) => `<option value="${escape(item)}">`).join("")}</datalist>` : "";
  return `<label>${label}<input name="${name}" value="${escape(value)}"${list} aria-invalid="${Boolean(state.errors[name])}">${fieldError(name)}</label>${datalist}`;
}

function selectInput(name, label, values, selected) {
  const optionsHtml = `<option value="">Selecione</option>${values.map((value) => `<option ${value === selected ? "selected" : ""}>${escape(value)}</option>`).join("")}`;
  return `<label>${label}<select name="${name}" aria-invalid="${Boolean(state.errors[name])}">${optionsHtml}</select>${fieldError(name)}</label>`;
}

function areaInput(name, label, value) {
  return `<label>${label}<textarea name="${name}" rows="4" aria-invalid="${Boolean(state.errors[name])}">${escape(value)}</textarea>${fieldError(name)}</label>`;
}

function commentField() {
  return `<label>Comentário<textarea name="comment" rows="3" aria-invalid="${Boolean(state.errors.comment)}">${escape(state.draft.comment ?? "")}</textarea>${fieldError("comment")}</label>`;
}

function reasonField() {
  return selectInput("closed_reason", "Motivo de fechamento", CLOSED_REASONS, state.draft.closed_reason ?? "");
}

function fieldError(name) {
  return state.errors[name] ? `<span class="field-error">${escape(state.errors[name])}</span>` : "";
}

function summaryError() {
  const messages = Object.values(state.errors);
  return messages.length ? `<p class="error-summary" role="alert">Corrija os campos: ${escape(messages.join("; "))}</p>` : "";
}

function feedback() {
  if (!state.feedback) return "";
  const refresh = state.feedback.kind === "conflict"
    ? `<button type="button" id="refresh-issue">Atualizar Issue</button>` : "";
  return `<p class="feedback feedback-${state.feedback.kind}" role="status" aria-live="polite">${escape(state.feedback.message)} ${refresh}</p>`;
}

function field(title, value) {
  return `<section class="box"><h2>${title}</h2><p class="preserve">${escape(value)}</p></section>`;
}

function criteriaField(value) {
  const items = parseChecklist(value);
  const body = items.length
    ? `<ul class="checklist">${items.map((item) => `<li class="${item.done ? "done" : ""}">${escape(item.label)}</li>`).join("")}</ul>`
    : `<p class="preserve">${escape(value)}</p>`;
  return `<section class="box"><h2>Critérios de aceite</h2>${body}</section>`;
}

function thread(entries) {
  return `<section class="box"><h2>Thread</h2><ol class="thread">${entries.map(message).join("")}</ol></section>`;
}

function message(entry) {
  const kind = entry.actor === "human" ? "human" : "agent";
  const reason = entry.closed_reason ? ` · ${escape(entry.closed_reason)}` : "";
  return `<li class="msg msg--${kind}"><div class="msg-head"><span class="msg-who">${escape(entry.actor)}</span><time>${date(entry.timestamp)}</time></div><p class="msg-status">${entry.status}${reason}</p><p class="preserve">${escape(entry.comment)}</p>${attachmentsMarkup(entry.attachments)}</li>`;
}

function dates(issue) {
  const claimed = issue.claimed_at ? `<p>Claim: ${date(issue.claimed_at)}</p>` : "";
  return `<section class="box"><h2>Datas</h2><p>Criada: ${date(issue.created_at)}</p>${claimed}<p>Última mudança: ${date(issue.status_changed_at)}</p></section>`;
}

function renderLoading() { root().innerHTML = `<p class="loading" aria-live="polite">Carregando quadro…</p>`; }
function renderError(error) { root().innerHTML = `<main class="error" role="alert"><h1>Não foi possível ler as Issues</h1><p>${escape(error.message)}</p><button type="button" id="refresh">Tentar novamente</button></main>`; }
function root() { return document.querySelector("#app"); }

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "Falha na requisição");
    error.status = response.status;
    throw error;
  }
  return body;
}

function date(value) { return new Date(value).toLocaleString(); }
function escape(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character]); }
function hasFilters() { return Object.values(state.filters).some(Boolean); }
function selectOptions(values, selected, empty) { return `<option value="">${empty}</option>${values.map((value) => `<option ${value === selected ? "selected" : ""}>${escape(value)}</option>`).join("")}`; }
function loadFilters() { return JSON.parse(sessionStorage.getItem("issues.filters") ?? '{"title":"","project":"","type":""}'); }
function saveFilters() { sessionStorage.setItem("issues.filters", JSON.stringify(state.filters)); }
function restoreScroll() { setTimeout(() => window.scrollTo(0, Number(sessionStorage.getItem("issues.scroll") ?? 0))); }
function emptyDraft() { return { title: "", project: "", type: "", problem: "", artifacts: "", acceptance_criteria: "", comment: "", closed_reason: "" }; }
function emptyTicketDraft() { return { type: "", objective: "", task: "", acceptance_criteria: "", artifacts: "", references: "" }; }
function emptyCommentDraft() { return { comment: "" }; }
function clearActionState() { state.panel = null; state.ticketPanel = null; state.showTicketForm = false; state.commentPanel = null; state.commentDraft = emptyCommentDraft(); state.errors = {}; state.feedback = null; state.busy = false; }
function actionLabel(action) {
  return { close: "Fechar Issue", reset: "Fazer Reset", "decide-open": "Devolver para OPEN", "decide-close": "Fechar Issue" }[action];
}
function ticketActionLabel(action) {
  return {
    "ticket-decide-open": "Devolver para OPEN", "ticket-decide-close": "Fechar Ticket",
    "ticket-await": "Enviar para decisão", "ticket-reopen": "Devolver para OPEN", "ticket-close": "Concluir Ticket",
  }[action];
}

const labels = {
  OPEN: "Disponível na Fila", CLAIMED: "Em decomposição", "ON-GOING": "Tickets em andamento",
  AWAITING: "Requer sua Decisão", CLOSED: "Histórico encerrado",
};

function handleClick(event) {
  const target = event.target.closest("a,button");
  if (!target) return;
  if (target.id === "refresh") return refresh();
  if (target.id === "refresh-issue") return refreshIssue();
  if (target.id === "toggle-ticket-form") { state.showTicketForm = !state.showTicketForm; state.errors = {}; return renderDetail(); }
  if (target.id === "clear") { state.filters = { title: "", project: "", type: "" }; saveFilters(); return renderBoard(); }
  if (target.dataset.openPanel) {
    state.panel = target.dataset.openPanel;
    state.ticketPanel = null;
    state.errors = {};
    state.draft = { ...state.draft, comment: "", closed_reason: "" };
    return renderDetail();
  }
  if (target.dataset.openTicketPanel) {
    state.ticketPanel = { ticketId: target.dataset.ticketId, action: target.dataset.openTicketPanel };
    state.panel = null;
    state.errors = {};
    state.draft = { ...state.draft, comment: "", closed_reason: "" };
    return renderDetail();
  }
  if (target.dataset.cancelPanel) { state.panel = null; state.errors = {}; return renderDetail(); }
  if (target.dataset.cancelTicketPanel) { state.ticketPanel = null; state.errors = {}; return renderDetail(); }
  if (target.dataset.openComment) {
    state.commentPanel = { scope: target.dataset.openComment, ticketId: target.dataset.ticketId };
    state.panel = null;
    state.ticketPanel = null;
    state.errors = {};
    state.commentDraft = emptyCommentDraft();
    return renderDetail();
  }
  if (target.dataset.cancelComment) { state.commentPanel = null; state.errors = {}; return renderDetail(); }
  if (target.dataset.issueId || target.dataset.back || target.getAttribute("href") === "/issues/new") {
    if (target.dataset.back || target.getAttribute("href") === "/") {
      state.draft = emptyDraft();
      clearActionState();
    }
    navigate(event, target.getAttribute("href"));
  }
}

function handleInput(event) {
  if (Object.hasOwn(state.filters, event.target.id) && location.pathname === "/") {
    state.filters[event.target.id] = event.target.value;
    saveFilters();
    return renderBoard();
  }
  if (!event.target.name || event.target.type === "file") return;
  const form = event.target.closest("form");
  const target = form?.id === "ticket-create-form" ? state.ticketDraft
    : form?.id === "comment-form" ? state.commentDraft
      : state.draft;
  target[event.target.name] = event.target.value;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.id === "comment-form") return submitComment(form);
  readForm(form, form.id === "ticket-create-form" ? state.ticketDraft : state.draft);
  if (form.id === "create-form") return submitCreate();
  if (form.id === "action-form") return submitAction();
  if (form.id === "ticket-create-form") return submitCreateTicket();
  if (form.id === "ticket-action-form") return submitTicketAction();
}

function readForm(form, target) {
  for (const [key, value] of new FormData(form).entries()) target[key] = String(value);
}

async function submitCreate() {
  const result = validateCreate(state.draft);
  state.errors = result.errors;
  if (!result.ok) return renderNewIssue();
  state.busy = true;
  renderNewIssue();
  try {
    const created = await api("/api/issues", { method: "POST", body: createPayload(state.draft) });
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

async function submitCreateTicket() {
  const result = validateCreateTicket(state.ticketDraft);
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
  state.busy = true;
  renderDetail();
  const body = { ...state.ticketDraft };
  try {
    await api(`/api/issues/${state.issue.id}/tickets`, { method: "POST", body });
    state.ticketDraft = emptyTicketDraft();
    await finishMutation("Ticket criado");
  } catch (error) { failMutation(error); }
}

async function submitComment(form) {
  const ticketId = form.dataset.ticketId;
  const comment = String(state.commentDraft.comment ?? "").trim();
  const files = [...form.querySelector("input[type=file]").files];
  if (!comment && !files.length) {
    state.errors = { comment: "Escreva um comentário ou anexe um arquivo" };
    return renderDetail();
  }
  // lê os arquivos antes do re-render, que destrói o <input> e perde a seleção
  const attachments = await Promise.all(files.map(async (file) => ({
    filename: file.name, mediaType: file.type, data: await fileToBase64(file),
  })));
  state.errors = {};
  state.busy = true;
  renderDetail();
  const base = `/api/issues/${state.issue.id}`;
  const path = ticketId ? `${base}/tickets/${ticketId}/comment` : `${base}/comment`;
  await mutate(path, { comment, attachments }, "Comentário adicionado");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function submitAction() {
  if (state.panel === "reset") return submitReset();
  if (state.panel === "decide-open") return submitDecide("OPEN");
  if (state.panel === "decide-close" || state.panel === "close") return submitClose();
}

async function submitClose() {
  const values = { comment: state.draft.comment, closed_reason: state.draft.closed_reason };
  const result = state.panel === "close" ? validateClose(values) : validateDecide({ ...values, status: "CLOSED" });
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
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

async function submitReset() {
  const result = validateReset({ comment: state.draft.comment });
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
  state.busy = true;
  renderDetail();
  await mutate(`/api/issues/${state.issue.id}/reset`, { comment: state.draft.comment }, "Issue devolvida para OPEN");
}

async function submitDecide(status) {
  const result = validateDecide({ status, comment: state.draft.comment });
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
  state.busy = true;
  renderDetail();
  await mutate(`/api/issues/${state.issue.id}/decision`, { status, comment: state.draft.comment }, "Issue devolvida para OPEN");
}

async function submitTicketAction() {
  const { ticketId, action } = state.ticketPanel;
  const plan = ticketActionPlan(action);
  const result = plan.validate({ status: plan.status, comment: state.draft.comment, closed_reason: state.draft.closed_reason });
  state.errors = result.errors;
  if (!result.ok) return renderDetail();
  state.busy = true;
  renderDetail();
  const base = `/api/issues/${state.issue.id}/tickets/${ticketId}`;
  const body = { status: plan.status, comment: state.draft.comment, closed_reason: state.draft.closed_reason || undefined };
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

async function reloadIssues() {
  state.issues = await api("/api/issues");
  state.refreshedAt = new Date();
}

async function refreshIssue() {
  const draft = { ...state.draft };
  const panel = state.panel;
  const ticketPanel = state.ticketPanel;
  const commentPanel = state.commentPanel;
  const commentDraft = { ...state.commentDraft };
  try {
    state.issue = await api(`/api/issues/${state.issue.id}`);
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

function createPayload(draft) {
  return {
    title: draft.title, project: draft.project, type: draft.type, problem: draft.problem,
    artifacts: draft.artifacts, acceptance_criteria: draft.acceptance_criteria,
  };
}

function navigate(event, path) {
  event.preventDefault();
  if (path.startsWith("/issues/")) sessionStorage.setItem("issues.scroll", String(window.scrollY));
  history.pushState({}, "", path);
  renderRoute();
}

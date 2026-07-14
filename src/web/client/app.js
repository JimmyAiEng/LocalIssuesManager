import {
  CLOSED_REASONS, STATUSES, TAGS, classifyMutationError, filterIssues, groupIssues,
  humanActions, options, parseChecklist, statusAge, validateClose, validateCreate, validateDecide, validateReset,
} from "./view_model.js";

const state = {
  issues: [], filters: loadFilters(), refreshedAt: null,
  issue: null, draft: emptyDraft(), panel: null,
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
  root().innerHTML = `${boardControls()}<section class="board">${STATUSES.map((status) => column(status, columns[status])).join("")}</section>`;
  restoreScroll();
}

function boardControls() {
  const projects = selectOptions(options(state.issues, "project"), state.filters.project, "Todos os Projetos");
  const tags = selectOptions(options(state.issues, "tag"), state.filters.tag, "Todas as TAGs");
  const updated = state.refreshedAt ? state.refreshedAt.toLocaleTimeString() : "ainda não atualizado";
  return `<header class="toolbar"><h1>Issues</h1><a class="button" href="/issues/new">+ Nova Issue</a><label>Buscar título <input id="title" value="${escape(state.filters.title)}"></label><label>Projeto <select id="project">${projects}</select></label><label>TAG <select id="tag">${tags}</select></label><button type="button" id="clear" ${hasFilters() ? "" : "disabled"}>Limpar filtros</button><button type="button" id="refresh">Atualizar quadro</button><output aria-live="polite">Atualizado às ${updated}</output></header>`;
}

function column(status, issues) {
  const cards = issues.length ? issues.map(card).join("") : `<p class="empty">Nenhuma Issue ${status}</p>`;
  return `<section class="column status-${status}" aria-labelledby="${status}"><h2 id="${status}">${status} <small>${issues.length}</small></h2><p>${labels[status]}</p>${cards}</section>`;
}

function card(issue) {
  const owner = issue.owner ? `<span class="owner">${escape(issue.owner)}</span>` : "";
  return `<a class="card status-${issue.status}" href="/issues/${issue.id}" data-issue-id="${issue.id}"><strong>${escape(issue.title)}</strong><span>${escape(issue.project)} · ${escape(issue.tag)}</span>${owner}<time title="${escape(issue.phases?.at(-1)?.timestamp ?? issue.created_at)}">${statusAge(issue)}</time></a>`;
}

async function loadDetail(id) {
  if (state.issue?.id !== id) {
    clearActionState();
    state.draft = emptyDraft();
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
  root().innerHTML = `<header class="toolbar"><a class="button" href="/" data-back>← Voltar ao quadro</a><button type="button" id="refresh-issue">Atualizar Issue</button></header>${feedback()}<main class="detail"><header><span class="badge status-${issue.status}">${issue.status}</span><h1>${escape(issue.title)}</h1><p class="meta">Projeto: ${escape(issue.project)} · TAG: ${escape(issue.tag)} · ${owner}</p><p class="meta">ID: <code>${escape(issue.id)}</code> · No Status ${statusAge(issue)}</p></header>${closed}${field("Problema", issue.problem)}${field("Artefatos", issue.artifacts)}${criteriaField(issue.acceptance_criteria)}${dates(issue)}${thread(issue.thread)}${actions}</main>`;
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

function renderNewIssue() {
  document.title = "Nova Issue · Issues";
  const draft = state.draft;
  const projects = options(state.issues, "project");
  root().innerHTML = `<main class="form-page"><a class="button" href="/" data-back>← Voltar ao quadro</a><h1>Nova Issue</h1>${feedback()}<form id="create-form" class="form" novalidate>${summaryError()}
    ${textInput("title", "Título", draft.title)}
    ${textInput("project", "Projeto", draft.project, projects)}
    ${selectInput("tag", "TAG", TAGS, draft.tag)}
    ${areaInput("problem", "Problema", draft.problem)}
    ${areaInput("artifacts", "Artefatos", draft.artifacts)}
    ${areaInput("acceptance_criteria", "Critérios de aceite", draft.acceptance_criteria)}
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
  return `<li class="msg msg--${kind}"><div class="msg-head"><span class="msg-who">${escape(entry.actor)}</span><time>${date(entry.timestamp)}</time></div><p class="msg-status">${entry.status}${reason}</p><p class="preserve">${escape(entry.comment)}</p></li>`;
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
function loadFilters() { return JSON.parse(sessionStorage.getItem("issues.filters") ?? '{"title":"","project":"","tag":""}'); }
function saveFilters() { sessionStorage.setItem("issues.filters", JSON.stringify(state.filters)); }
function restoreScroll() { setTimeout(() => window.scrollTo(0, Number(sessionStorage.getItem("issues.scroll") ?? 0))); }
function emptyDraft() { return { title: "", project: "", tag: "", problem: "", artifacts: "", acceptance_criteria: "", comment: "", closed_reason: "" }; }
function clearActionState() { state.panel = null; state.errors = {}; state.feedback = null; state.busy = false; }
function actionLabel(action) {
  return { close: "Fechar Issue", reset: "Fazer Reset", "decide-open": "Devolver para OPEN", "decide-close": "Fechar Issue" }[action];
}

const labels = { OPEN: "Disponível na Fila", CLAIMED: "Em trabalho", AWAITING: "Requer sua Decisão", CLOSED: "Histórico encerrado" };

function handleClick(event) {
  const target = event.target.closest("a,button");
  if (!target) return;
  if (target.id === "refresh") return refresh();
  if (target.id === "refresh-issue") return refreshIssue();
  if (target.id === "clear") { state.filters = { title: "", project: "", tag: "" }; saveFilters(); return renderBoard(); }
  if (target.dataset.openPanel) {
    state.panel = target.dataset.openPanel;
    state.errors = {};
    state.draft = { ...state.draft, comment: state.draft.comment ?? "", closed_reason: state.draft.closed_reason ?? "" };
    return renderDetail();
  }
  if (target.dataset.cancelPanel) { state.panel = null; state.errors = {}; return renderDetail(); }
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
  if (!event.target.name) return;
  state.draft[event.target.name] = event.target.value;
}

async function handleSubmit(event) {
  event.preventDefault();
  readForm(event.target);
  if (event.target.id === "create-form") return submitCreate();
  if (event.target.id === "action-form") return submitAction();
}

function readForm(form) {
  for (const [key, value] of new FormData(form).entries()) state.draft[key] = String(value);
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

async function mutate(path, body, successMessage) {
  try {
    await api(path, { method: "POST", body });
    const fresh = await api(`/api/issues/${state.issue.id}`);
    await reloadIssues();
    state.issue = fresh;
    state.panel = null;
    state.draft = emptyDraft();
    state.errors = {};
    state.feedback = { kind: "success", message: successMessage };
    state.busy = false;
    renderDetail();
  } catch (error) {
    state.busy = false;
    state.feedback = classifyMutationError(error.status ?? 500, error.message);
    renderDetail();
  }
}

async function reloadIssues() {
  state.issues = await api("/api/issues");
  state.refreshedAt = new Date();
}

async function refreshIssue() {
  const draft = { ...state.draft };
  const panel = state.panel;
  try {
    state.issue = await api(`/api/issues/${state.issue.id}`);
    state.draft = draft;
    state.panel = humanActions(state.issue.status).includes(panel) ? panel : null;
    state.feedback = state.feedback?.kind === "conflict" ? null : state.feedback;
    renderDetail();
  } catch (error) { renderError(error); }
}

function createPayload(draft) {
  return {
    title: draft.title, project: draft.project, tag: draft.tag, problem: draft.problem,
    artifacts: draft.artifacts, acceptance_criteria: draft.acceptance_criteria,
  };
}

function navigate(event, path) {
  event.preventDefault();
  if (path.startsWith("/issues/")) sessionStorage.setItem("issues.scroll", String(window.scrollY));
  history.pushState({}, "", path);
  renderRoute();
}

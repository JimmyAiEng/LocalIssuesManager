import {
  CLOSED_REASONS, ISSUE_STATUSES, ISSUE_TYPES, TAG_VALUES, TICKET_TYPES, attachmentsMarkup, canClaimTicket, canCreateTicket,
  filterIssues, groupIssues, humanActions, options, parseChecklist, statusAge, ticketHumanActions,
} from "./view_model.js";
import { state } from "./state.js";

export function renderBoard() {
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

export function renderDetail() {
  const issue = state.issue;
  document.title = `${issue.title} · Issues`;
  const owner = issue.owner ? `Owner: ${escape(issue.owner)}` : "Sem Owner";
  const closed = issue.closed_reason ? `<section class="box"><h2>Motivo de fechamento</h2><p class="preserve">${escape(issue.closed_reason)}</p></section>` : "";
  const actions = humanActions(issue.status).length ? `<section class="actionbar"><h2>Ações</h2>${actionsPanel(issue)}</section>` : "";
  root().innerHTML = `<header class="toolbar"><a class="button" href="/" data-back>← Voltar ao quadro</a><button type="button" id="refresh-issue">Atualizar Issue</button></header>${feedback()}<main class="detail"><header><span class="badge status-${issue.status}">${issue.status}</span><h1>${escape(issue.title)}</h1><p class="meta">Projeto: ${escape(issue.project)} · Tipo: ${escape(issue.type)} · ${owner}</p><p class="meta">ID: <code>${escape(issue.id)}</code> · No Status ${statusAge(issue)}</p>${tagsMarkup(issue.tags)}${tagEditor("issue", issue.tags, null, issue.status)}</header>${closed}${field("Problema", issue.problem)}${field("Artefatos", issue.artifacts)}${criteriaField(issue.acceptance_criteria)}${ticketsSection(issue)}${dates(issue)}${thread(issue.thread)}${commentSection(issue)}${actions}</main>`;
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
  // Humano assume a Issue OPEN (OPEN->CLAIMED) para poder criar Tickets. Espelha "Assumir Ticket".
  const claim = issue.status === "OPEN"
    ? `<button type="button" id="claim-issue" ${state.busy ? "disabled" : ""}>Assumir Issue</button>` : "";
  const buttons = available.map((action) => `<button type="button" data-open-panel="${action}">${actionLabel(action)}</button>`).join(" ");
  if (!claim && !available.length) return `<p class="muted">Issue imutável</p>`;
  return `<div class="actions">${claim}${buttons}</div>${actionForm(issue)}`;
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
  return `<article class="ticket status-${ticket.status}"><header class="ticket-head"><span class="badge status-${ticket.status}">${ticket.status}</span><span class="ticket-type">${escape(ticket.type)}</span>${owner}</header>${tagsMarkup(ticket.tags)}${tagEditor("ticket", ticket.tags, ticket.id, ticket.status)}<h3>${escape(ticket.objective)}</h3><p class="preserve ticket-task">${escape(ticket.task)}</p>${references}<details class="ticket-thread"><summary>Thread (${ticket.thread.length})</summary><ol class="thread">${ticket.thread.map(message).join("")}</ol></details>${ticketCommentSection(ticket)}${ticketActionsPanel(ticket)}</article>`;
}

function tagEditor(scope, tags, ticketId, status) {
  if (status === "CLOSED") return "";
  const ticketAttr = ticketId ? ` data-ticket-id="${ticketId}"` : "";
  return `<details class="tag-editor"><summary>Classificar ${scope === "issue" ? "Issue" : "Ticket"}</summary><form class="form tag-form" data-tag-scope="${scope}"${ticketAttr}>
    ${selectInput("complexity", tagLabels.complexity, TAG_VALUES.complexity, tags?.complexity ?? "", "Não alterar")}
    ${selectInput("human_need", tagLabels.human_need, TAG_VALUES.human_need, tags?.human_need ?? "", "Não alterar")}
    ${selectInput("risk", tagLabels.risk, TAG_VALUES.risk, tags?.risk ?? "", "Não alterar")}
    <button ${state.busy ? "disabled" : ""}>Salvar classificação</button>
  </form></details>`;
}

function ticketCommentSection(ticket) {
  if (ticket.status === "CLOSED") return "";
  const open = state.commentPanel?.scope === "ticket" && state.commentPanel.ticketId === ticket.id;
  if (open) return commentForm(ticket.id);
  return `<button type="button" class="new-comment" data-open-comment="ticket" data-ticket-id="${ticket.id}">+ Comentar</button>`;
}

function ticketActionsPanel(ticket) {
  const claim = canClaimTicket(ticket)
    ? `<button type="button" data-claim-ticket="${ticket.id}" ${state.busy ? "disabled" : ""}>Assumir Ticket</button>` : "";
  const available = ticketHumanActions(ticket);
  if (!available.length) return claim ? `<div class="actions">${claim}</div>` : "";
  const buttons = available.map((action) => `<button type="button" data-open-ticket-panel="${action}" data-ticket-id="${ticket.id}">${ticketActionLabel(action)}</button>`).join(" ");
  return `<div class="actions">${claim}${buttons}</div>${ticketActionForm(ticket)}`;
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
    ${selectInput("human_need", `${tagLabels.human_need} (opcional)`, TAG_VALUES.human_need, draft.human_need)}
    <div class="form-actions"><button ${state.busy ? "disabled" : ""}>Criar Ticket</button><button type="button" id="toggle-ticket-form">Cancelar</button></div>
  </form>`;
}

export function renderNewIssue() {
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
    ${selectInput("complexity", `${tagLabels.complexity} (opcional)`, TAG_VALUES.complexity, draft.complexity)}
    ${selectInput("human_need", `${tagLabels.human_need} (opcional)`, TAG_VALUES.human_need, draft.human_need)}
    ${selectInput("risk", `${tagLabels.risk} (opcional)`, TAG_VALUES.risk, draft.risk)}
    <div class="form-actions"><button ${state.busy ? "disabled" : ""}>Salvar Issue</button><a class="button" href="/" data-back>Cancelar</a></div>
  </form></main>`;
}

function textInput(name, label, value, suggestions = []) {
  const list = suggestions.length ? ` list="${name}-list"` : "";
  const datalist = suggestions.length ? `<datalist id="${name}-list">${suggestions.map((item) => `<option value="${escape(item)}">`).join("")}</datalist>` : "";
  return `<label>${label}<input name="${name}" value="${escape(value)}"${list} aria-invalid="${Boolean(state.errors[name])}">${fieldError(name)}</label>${datalist}`;
}

function selectInput(name, label, values, selected, emptyLabel = "Selecione") {
  const optionsHtml = `<option value="">${emptyLabel}</option>${values.map((value) => `<option ${value === selected ? "selected" : ""}>${escape(value)}</option>`).join("")}`;
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

export function renderLoading() { root().innerHTML = `<p class="loading" aria-live="polite">Carregando quadro…</p>`; }
export function renderError(error) { root().innerHTML = `<main class="error" role="alert"><h1>Não foi possível ler as Issues</h1><p>${escape(error.message)}</p><button type="button" id="refresh">Tentar novamente</button></main>`; }
export function root() { return document.querySelector("#app"); }

const tagLabels = { complexity: "Complexidade", human_need: "Humano", risk: "Risco" };
function tagsMarkup(tags) {
  const entries = Object.entries(tags ?? {});
  if (!entries.length) return "";
  const chips = entries.map(([key, value]) => `<span class="tag tag-${key}">${tagLabels[key] ?? key}: ${escape(value)}</span>`).join("");
  return `<p class="tags">${chips}</p>`;
}

function date(value) { return new Date(value).toLocaleString(); }
function escape(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character]); }
function hasFilters() { return Object.values(state.filters).some(Boolean); }
function selectOptions(values, selected, empty) { return `<option value="">${empty}</option>${values.map((value) => `<option ${value === selected ? "selected" : ""}>${escape(value)}</option>`).join("")}`; }
function restoreScroll() { setTimeout(() => window.scrollTo(0, Number(sessionStorage.getItem("issues.scroll") ?? 0))); }

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

import {
  CLOSED_REASONS, ISSUE_STATUSES, ISSUE_TYPES, ACTION_TYPES, TAG_VALUES, attachmentsMarkup, escapeHtml,
  filterIssues, groupIssues, hasPendingDecision, isStale, isUnclassified, options, pendingDecisions,
  statusAge, statusAgeFrom,
} from "./view_model.js";
import { state } from "./state.js";

export function renderBoard() {
  const filtered = filterIssues(state.issues, state.filters);
  const columns = groupIssues(filtered);
  const decisions = pendingDecisions(state.issues);
  document.title = "Issues locais";
  root().innerHTML = `${boardControls(decisions)}${decisionsPanel(decisions)}<section class="board">${ISSUE_STATUSES.map((status) => column(status, columns[status])).join("")}</section>`;
  restoreScroll();
}

function boardControls(decisions) {
  const projects = selectOptions(options(state.issues, "project"), state.filters.project, "Todos os Projetos");
  const types = selectOptions(options(state.issues, "type"), state.filters.type, "Todos os Tipos");
  const owners = selectOptions(ownerValues(state.issues), state.filters.owner, "Todos os Owners");
  const updated = state.refreshedAt ? state.refreshedAt.toLocaleTimeString() : "ainda não atualizado";
  const decisionsBtn = decisions.length
    ? `<button type="button" id="toggle-decisions" class="decisions-badge" aria-expanded="${state.decisionsOpen}">⚠ ${decisions.length} ${decisions.length === 1 ? "decisão" : "decisões"}</button>` : "";
  return `<header class="toolbar"><h1>Issues</h1><a class="button" href="/issues/new">+ Nova Issue</a>${decisionsBtn}<label>Buscar título <input id="title" value="${escapeHtml(state.filters.title)}"></label><label>Projeto <select id="project">${projects}</select></label><label>Tipo <select id="type">${types}</select></label><label>Owner <select id="owner">${owners}</select></label><button type="button" id="clear" ${hasFilters() ? "" : "disabled"}>Limpar filtros</button><button type="button" id="refresh">Atualizar quadro</button><output aria-live="polite">Atualizado às ${updated}</output></header>`;
}

function decisionsPanel(decisions) {
  if (!state.decisionsOpen || !decisions.length) return "";
  const items = decisions.map((decision) =>
    `<li><a href="/issues/${decision.issueId}" data-issue-id="${decision.issueId}"><span class="badge status-AWAITING">${escapeHtml(decision.action)}</span> <strong>${escapeHtml(decision.issueTitle)}</strong> <span class="dim">${escapeHtml(decision.project)} · ${statusAgeFrom(decision.since)}</span></a></li>`).join("");
  return `<section class="decisions-inbox" aria-label="Decisões pendentes"><h2>Decisões pendentes <small>${decisions.length}</small></h2><ul>${items}</ul></section>`;
}

function column(status, issues) {
  const cards = issues.length ? issues.map(card).join("") : `<p class="empty">Nenhuma Issue ${status}</p>`;
  return `<section class="column status-${status}" aria-labelledby="${status}"><h2 id="${status}">${status} <small>${issues.length}</small></h2><p>${labels[status]}</p>${cards}</section>`;
}

function card(issue) {
  const owner = issue.owner ? `<span class="owner">${escapeHtml(issue.owner)}</span>` : "";
  const stale = isStale(issue);
  const staleAttr = stale ? ` title="Sem mudança de Status há mais de 24h — agente possivelmente travado"` : "";
  const decision = hasPendingDecision(issue) ? `<span class="card-flag">⚠ decisão</span>` : "";
  const relates = issue.relates?.length ? `<span class="pill-count">${issue.relates.length} relacionada${issue.relates.length === 1 ? "" : "s"}</span>` : "";
  return `<a class="card status-${issue.status}${stale ? " card--stale" : ""}" href="/issues/${issue.id}" data-issue-id="${issue.id}"${staleAttr}><strong>${escapeHtml(issue.title)}</strong><span>${escapeHtml(issue.project)} · ${escapeHtml(issue.type)} · ${escapeHtml(issue.action)}</span>${cardTags(issue)}<span class="card-foot">${owner}${relates}${decision}<time title="${escapeHtml(issue.status_changed_at ?? issue.created_at)}">${statusAge(issue)}</time></span></a>`;
}

function cardTags(issue) {
  const tags = issue.tags ?? {};
  const chips = [];
  if (tags.human_need) chips.push(`<span class="tag tag-human_need tag--need-${tags.human_need}">${escapeHtml(tags.human_need)}</span>`);
  if (tags.complexity) chips.push(`<span class="tag tag-complexity">${escapeHtml(tags.complexity)}</span>`);
  if (tags.risk) chips.push(`<span class="tag tag-risk">${escapeHtml(tags.risk)}</span>`);
  if (isUnclassified(issue)) chips.push(`<span class="tag tag--unclassified">não classificada</span>`);
  return chips.length ? `<span class="card-tags">${chips.join("")}</span>` : "";
}

export function renderNewIssue() {
  document.title = "Nova Issue · Issues";
  const draft = state.draft;
  const projects = options(state.issues, "project");
  root().innerHTML = `<main class="form-page"><a class="button" href="/" data-back>← Voltar ao quadro</a><h1>Nova Issue</h1>${feedback()}<form id="create-form" class="form" novalidate>${summaryError()}
    ${textInput("title", "Título", draft.title)}
    ${textInput("project", "Projeto", draft.project, projects)}
    ${selectInput("type", "Tipo", ISSUE_TYPES, draft.type)}
    ${selectInput("action", "Action (entrega esperada)", ACTION_TYPES, draft.action)}
    ${areaInput("problem", "Problema", draft.problem)}
    ${areaInput("acceptance_criteria", "Critérios de aceite (opcional)", draft.acceptance_criteria)}
    ${selectInput("complexity", `${tagLabels.complexity} (opcional)`, TAG_VALUES.complexity, draft.complexity)}
    ${selectInput("human_need", `${tagLabels.human_need} (opcional)`, TAG_VALUES.human_need, draft.human_need)}
    ${selectInput("risk", `${tagLabels.risk} (opcional)`, TAG_VALUES.risk, draft.risk)}
    ${attachmentField()}
    <div class="form-actions"><button ${state.busy ? "disabled" : ""}>Salvar Issue</button><a class="button" href="/" data-back>Cancelar</a></div>
  </form></main>`;
}

// Componente único de input de anexo (imagem/vídeo), reutilizado em comentário, criação e devolução para OPEN.
export function attachmentField() {
  return `<label>Anexos (imagem/vídeo)<input type="file" name="attachments" multiple accept="image/*,video/*"></label>`;
}

function textInput(name, label, value, suggestions = []) {
  const list = suggestions.length ? ` list="${name}-list"` : "";
  const datalist = suggestions.length ? `<datalist id="${name}-list">${suggestions.map((item) => `<option value="${escapeHtml(item)}">`).join("")}</datalist>` : "";
  return `<label>${label}<input name="${name}" value="${escapeHtml(value)}"${list} aria-invalid="${Boolean(state.errors[name])}">${fieldError(name)}</label>${datalist}`;
}

export function selectInput(name, label, values, selected, emptyLabel = "Selecione") {
  const optionsHtml = `<option value="">${emptyLabel}</option>${values.map((value) => `<option ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
  return `<label>${label}<select name="${name}" aria-invalid="${Boolean(state.errors[name])}">${optionsHtml}</select>${fieldError(name)}</label>`;
}

export function areaInput(name, label, value) {
  return `<label>${label}<textarea name="${name}" rows="4" aria-invalid="${Boolean(state.errors[name])}">${escapeHtml(value)}</textarea>${fieldError(name)}</label>`;
}

export function fieldError(name) {
  return state.errors[name] ? `<span class="field-error">${escapeHtml(state.errors[name])}</span>` : "";
}

export function summaryError() {
  const messages = Object.values(state.errors);
  return messages.length ? `<p class="error-summary" role="alert">Corrija os campos: ${escapeHtml(messages.join("; "))}</p>` : "";
}

export function feedback() {
  if (!state.feedback) return "";
  const refresh = state.feedback.kind === "conflict"
    ? `<button type="button" id="refresh-issue">Atualizar Issue</button>` : "";
  return `<p class="feedback feedback-${state.feedback.kind}" role="status" aria-live="polite">${escapeHtml(state.feedback.message)} ${refresh}</p>`;
}

export function renderLoading() { root().innerHTML = `<p class="loading" aria-live="polite">Carregando quadro…</p>`; }
export function renderError(error) { root().innerHTML = `<main class="error" role="alert"><h1>Não foi possível ler as Issues</h1><p>${escapeHtml(error.message)}</p><button type="button" id="refresh">Tentar novamente</button></main>`; }
export function root() { return document.querySelector("#app"); }

// Atributos de um <details> cuja expansão persiste no state: a chave identifica o <details>
// entre renders (handleToggle grava por ela) e `forced` deixa quem já força a abertura seguir forçando.
export function detailsAttrs(key, forced = false) {
  return ` data-details-id="${key}"${forced || state.expanded.has(key) ? " open" : ""}`;
}

export const tagLabels = { complexity: "Complexidade", human_need: "Humano", risk: "Risco" };
export function tagsMarkup(tags) {
  const entries = Object.entries(tags ?? {});
  if (!entries.length) return "";
  const chips = entries.map(([key, value]) => `<span class="tag tag-${key}">${tagLabels[key] ?? key}: ${escapeHtml(value)}</span>`).join("");
  return `<p class="tags">${chips}</p>`;
}

export function tagEditor(tags, status, open = false) {
  if (status === "CLOSED") return "";
  return `<details class="tag-editor"${detailsAttrs("tags:issue", open)}><summary>Classificar Issue</summary><form class="form tag-form" data-tag-scope="issue">
    ${selectInput("complexity", tagLabels.complexity, TAG_VALUES.complexity, tags?.complexity ?? "", "Não alterar")}
    ${selectInput("human_need", tagLabels.human_need, TAG_VALUES.human_need, tags?.human_need ?? "", "Não alterar")}
    ${selectInput("risk", tagLabels.risk, TAG_VALUES.risk, tags?.risk ?? "", "Não alterar")}
    <button ${state.busy ? "disabled" : ""}>Salvar classificação</button>
  </form></details>`;
}

export function commentForm() {
  return `<form id="comment-form" class="form">${summaryError()}<label>Comentário<textarea name="comment" rows="3">${escapeHtml(state.commentDraft.comment ?? "")}</textarea></label>${attachmentField()}<div class="form-actions"><button ${state.busy ? "disabled" : ""}>Enviar comentário</button><button type="button" data-cancel-comment>Cancelar</button></div></form>`;
}

export function commentField() {
  return `<label>Comentário<textarea name="comment" rows="3" aria-invalid="${Boolean(state.errors.comment)}">${escapeHtml(state.draft.comment ?? "")}</textarea>${fieldError("comment")}</label>`;
}

export function reasonField() {
  return selectInput("closed_reason", "Motivo de fechamento", CLOSED_REASONS, state.draft.closed_reason ?? "");
}

export function message(entry) {
  const kind = entry.actor === "human" ? "human" : "agent";
  const reason = entry.closed_reason ? ` · ${escapeHtml(entry.closed_reason)}` : "";
  const role = entry.role ? `<span class="msg-role">${escapeHtml(entry.role)}</span>` : "";
  return `<li class="msg msg--${kind}"><div class="msg-head"><span class="msg-who">${escapeHtml(entry.actor)}</span>${role}<time>${date(entry.timestamp)}</time></div><p class="msg-status">${entry.status}${reason}</p><p class="preserve">${escapeHtml(entry.comment)}</p>${attachmentsMarkup(entry.attachments)}</li>`;
}

export function date(value) { return new Date(value).toLocaleString(); }
function hasFilters() { return Object.values(state.filters).some(Boolean); }
function ownerValues(issues) { return [...new Set(issues.map((issue) => issue.owner).filter(Boolean))].sort(); }
function selectOptions(values, selected, empty) { return `<option value="">${empty}</option>${values.map((value) => `<option ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}`; }
function restoreScroll() { setTimeout(() => window.scrollTo(0, Number(sessionStorage.getItem("issues.scroll") ?? 0))); }

const labels = {
  OPEN: "Disponível na Fila", CLAIMED: "Em andamento",
  AWAITING: "Requer sua Decisão", CLOSED: "Histórico encerrado",
};

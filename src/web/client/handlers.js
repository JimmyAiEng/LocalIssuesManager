import { clearActionState, emptyCommentDraft, emptyDraft, emptyTicketDraft, saveFilters, state } from "./state.js";
import { api } from "./http.js";
import { renderBoard, renderDetail, renderError, renderLoading, renderNewIssue, root } from "./view.js";
import {
  claimIssue, claimTicket, readForm, refreshIssue,
  submitAction, submitComment, submitCreate, submitCreateTicket, submitTags, submitTicketAction,
} from "./mutations.js";

export async function refresh() {
  renderLoading();
  try {
    state.issues = await api("/api/issues");
    state.refreshedAt = new Date();
    renderRoute();
  } catch (error) { renderError(error); }
}

export function renderRoute() {
  const path = location.pathname;
  if (path === "/issues/new") return renderNewIssue();
  if (path.startsWith("/issues/")) return loadDetail(decodeURIComponent(path.slice(8)));
  renderBoard();
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

export function handleClick(event) {
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
  if (target.id === "claim-issue") return claimIssue();
  if (target.dataset.claimTicket) return claimTicket(target.dataset.claimTicket);
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

export function handleInput(event) {
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

export async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.id === "comment-form") return submitComment(form);
  if (form.dataset.tagScope) return submitTags(form);
  readForm(form, form.id === "ticket-create-form" ? state.ticketDraft : state.draft);
  if (form.id === "create-form") return submitCreate();
  if (form.id === "action-form") return submitAction();
  if (form.id === "ticket-create-form") return submitCreateTicket();
  if (form.id === "ticket-action-form") return submitTicketAction();
}

function navigate(event, path) {
  event.preventDefault();
  if (path.startsWith("/issues/")) sessionStorage.setItem("issues.scroll", String(window.scrollY));
  history.pushState({}, "", path);
  renderRoute();
}

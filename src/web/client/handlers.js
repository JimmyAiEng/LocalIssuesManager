import { clearActionState, emptyCommentDraft, emptyDraft, emptyFilters, emptyTicketDraft, saveFilters, state } from "./state.js";
import { api } from "./http.js";
import { renderBoard, renderError, renderLoading, renderNewIssue, root } from "./view.js";
import { renderDetail } from "./detail_view.js";
import {
  claimIssue, claimTicket, fetchDesign, fetchRequirements, performClose, readForm, refreshIssue,
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
    state.threadExpanded = false;
    state.expanded.clear(); // as chaves são da Issue anterior
  }
  root().innerHTML = `<p class="loading" aria-live="polite">Carregando Issue…</p>`;
  try {
    const [issue, requirements, design] = await Promise.all([api(`/api/issues/${id}`), fetchRequirements(id), fetchDesign(id)]);
    state.issue = issue;
    state.requirements = requirements;
    state.design = design;
    renderDetail();
  } catch (error) { renderError(error); }
}

export function handleClick(event) {
  const target = event.target.closest("a,button");
  if (!target) return;
  if (target.id === "refresh") return refresh();
  if (target.id === "refresh-issue") return refreshIssue();
  if (target.id === "toggle-ticket-form") { state.showTicketForm = !state.showTicketForm; state.errors = {}; return renderDetail(); }
  if (target.id === "clear") { state.filters = emptyFilters(); saveFilters(); return renderBoard(); }
  if (target.id === "toggle-decisions") { state.decisionsOpen = !state.decisionsOpen; return renderBoard(); }
  if (target.dataset.openPanel) {
    state.panel = target.dataset.openPanel;
    state.ticketPanel = null;
    state.confirmClose = false;
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
  if (target.dataset.copyId) {
    navigator.clipboard?.writeText(target.dataset.copyId);
    target.textContent = "ID copiado";
    return;
  }
  if (target.dataset.expandThread) { state.threadExpanded = true; return renderDetail(); }
  if (target.dataset.confirmClose) return performClose();
  if (target.dataset.cancelClose) { state.confirmClose = false; return renderDetail(); }
  if (target.id === "claim-issue") return claimIssue();
  if (target.dataset.claimTicket) return claimTicket(target.dataset.claimTicket);
  // Atributos data-* sem valor viram "" (falsy) — presença via `in`, nunca truthiness.
  if ("cancelPanel" in target.dataset) { state.panel = null; state.confirmClose = false; state.errors = {}; return renderDetail(); }
  if ("cancelTicketPanel" in target.dataset) { state.ticketPanel = null; state.errors = {}; return renderDetail(); }
  if (target.dataset.openComment) {
    state.commentPanel = { scope: target.dataset.openComment, ticketId: target.dataset.ticketId };
    state.panel = null;
    state.ticketPanel = null;
    state.errors = {};
    state.commentDraft = emptyCommentDraft();
    return renderDetail();
  }
  if ("cancelComment" in target.dataset) { state.commentPanel = null; state.errors = {}; return renderDetail(); }
  if (target.dataset.issueId || "back" in target.dataset || target.getAttribute("href") === "/issues/new") {
    if ("back" in target.dataset || target.getAttribute("href") === "/") {
      state.draft = emptyDraft();
      clearActionState();
    }
    navigate(event, target.getAttribute("href"));
  }
}

// Expansão de <details>: grava a chave para o PRÓXIMO render — o DOM atual já está correto,
// re-renderizar aqui só destruiria seleção e rolagem.
export function handleToggle(event) {
  const key = event.target.dataset?.detailsId;
  if (!key) return;
  if (event.target.open) state.expanded.add(key);
  else state.expanded.delete(key);
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
  // Trocar o tipo re-renderiza o form para atualizar o aviso de bloqueio de fase.
  if (form?.id === "ticket-create-form" && event.target.name === "type") renderDetail();
}

export async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.id === "comment-form") return submitComment(form);
  if (form.dataset.tagScope) return submitTags(form);
  readForm(form, form.id === "ticket-create-form" ? state.ticketDraft : state.draft);
  if (form.id === "create-form") return submitCreate(form);
  if (form.id === "action-form") return submitAction(form);
  if (form.id === "ticket-create-form") return submitCreateTicket(form);
  if (form.id === "ticket-action-form") return submitTicketAction(form);
}

function navigate(event, path) {
  event.preventDefault();
  if (path.startsWith("/issues/")) sessionStorage.setItem("issues.scroll", String(window.scrollY));
  history.pushState({}, "", path);
  renderRoute();
}

// Auto-atualização: só com a aba visível e sem foco em campo de edição (não rouba foco/digitação).
export function pollTick() {
  if (document.visibilityState !== "visible" || isEditing(document.activeElement)) return;
  const path = location.pathname;
  if (path === "/") return pollBoard();
  if (path.startsWith("/issues/") && path !== "/issues/new" && state.issue) refreshIssue();
}

async function pollBoard() {
  try {
    const fresh = await api("/api/issues");
    if (JSON.stringify(fresh) === JSON.stringify(state.issues)) return; // só re-renderiza se o JSON mudou
    state.issues = fresh;
    state.refreshedAt = new Date();
    renderBoard();
  } catch { /* polling silencioso: um erro transitório não deve gritar na tela */ }
}

// Atalhos só no quadro, ignorando eventos vindos de campos de edição.
export function handleKeydown(event) {
  if (location.pathname !== "/" || isEditing(event.target)) return;
  if (event.key === "c") { history.pushState({}, "", "/issues/new"); renderRoute(); }
  if (event.key === "/") { event.preventDefault(); document.querySelector("#title")?.focus(); }
}

function isEditing(element) {
  return Boolean(element) && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

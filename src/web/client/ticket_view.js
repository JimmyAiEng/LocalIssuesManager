import {
  TAG_VALUES, TICKET_TYPES, canClaimTicket, canCreateTicket, escapeHtml,
  phaseBlockerOf, suggestNextTicketType, ticketCreationGate, ticketHumanActions,
} from "./view_model.js";
import { state } from "./state.js";
import {
  areaInput, attachmentField, commentField, commentForm, message, reasonField,
  selectInput, summaryError, tagEditor, tagLabels, tagsMarkup,
} from "./view.js";
import { renderMarkdown } from "./markdown.js";

export function ticketsSection(issue) {
  const cards = issue.tickets?.length ? issue.tickets.map((ticket) => ticketCard(ticket, issue)).join("") : `<p class="empty">Nenhum Ticket ainda</p>`;
  return `<section class="box"><h2>Tickets <small>${issue.tickets?.length ?? 0}</small></h2><div class="tickets">${cards}</div>${ticketCreate(issue)}</section>`;
}

function ticketCard(ticket, issue) {
  const owner = ticket.owner ? `<span class="owner">${escapeHtml(ticket.owner)}</span>` : "";
  const references = ticket.references?.trim() ? `<p class="ticket-refs">Referências: ${escapeHtml(ticket.references)}</p>` : "";
  const artifact = ticket.artifact
    ? `<details class="ticket-artifact"><summary>Artefato</summary><div class="md">${renderMarkdown(ticket.artifact)}</div></details>` : "";
  return `<article class="ticket status-${ticket.status}"><header class="ticket-head"><span class="badge status-${ticket.status}">${ticket.status}</span><span class="ticket-type">${escapeHtml(ticket.type)}</span>${owner}</header>${tagsMarkup(ticket.tags)}${tagEditor("ticket", ticket.tags, ticket.id, ticket.status)}<h3>${escapeHtml(ticket.objective)}</h3><div class="md ticket-task">${renderMarkdown(ticket.task)}</div>${artifact}${dependsLine(ticket, issue)}${references}<details class="ticket-thread"><summary>Thread (${ticket.thread.length})</summary><ol class="thread">${ticket.thread.map(message).join("")}</ol></details>${ticketCommentSection(ticket)}${ticketActionsPanel(ticket)}</article>`;
}

// Dependências do Ticket resolvidas contra os Tickets da Issue; id desconhecido → id curto.
// Dependência não satisfeita (dep fora de AWAITING/CLOSED, ou inexistente) fica em âmbar.
function dependsLine(ticket, issue) {
  if (!ticket.depends_on?.length) return "";
  const items = ticket.depends_on.map((depId) => {
    const dep = issue.tickets?.find((candidate) => candidate.id === depId);
    const label = dep ? `${escapeHtml(dep.type)} (${dep.status})` : escapeHtml(depId.slice(0, 8));
    const met = dep && (dep.status === "AWAITING" || dep.status === "CLOSED");
    return `<li class="${met ? "" : "dep--unmet"}">${label}</li>`;
  }).join("");
  return `<div class="ticket-deps"><span class="deps-label">Depende de:</span><ul class="deps">${items}</ul></div>`;
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
  const attach = action.endsWith("-open") || action === "ticket-reopen" ? attachmentField() : ""; // devolução para OPEN
  return `<form id="ticket-action-form" class="form" data-ticket-id="${ticket.id}">${summaryError()}${commentField()}${reason}${attach}<button ${state.busy ? "disabled" : ""}>${ticketActionLabel(action)}</button><button type="button" data-cancel-ticket-panel>Cancelar</button></form>`;
}

function ticketCreate(issue) {
  if (!canCreateTicket(issue.status)) return "";
  const gate = ticketCreationGate(issue);
  if (gate === "blocked") {
    return `<div class="ticket-gate ticket-gate--blocked"><p class="warn" role="alert">Classifique a Issue (Complexidade, Humano, Risco) antes de criar o 1º Ticket</p>${tagEditor("issue", issue.tags, null, issue.status, true)}</div>`;
  }
  if (!state.showTicketForm) return `<button type="button" id="toggle-ticket-form" class="new-ticket">+ Novo Ticket</button>`;
  return ticketCreateForm(issue, gate);
}

function ticketCreateForm(issue, gate) {
  const draft = state.ticketDraft;
  const type = draft.type || suggestNextTicketType(issue.tickets);
  const blocker = phaseBlockerOf(issue.tickets, type);
  const warn = gate === "warn" ? `<p class="warn">Issue sem classificação completa (Complexidade, Humano, Risco) — recomendado classificar.</p>` : "";
  const blocked = blocker ? `<p class="warn" role="alert">Fase anterior (${escapeHtml(blocker.type)}) ainda aberta — a criação será rejeitada.</p>` : "";
  return `<form id="ticket-create-form" class="form" novalidate>${summaryError()}${warn}
    ${selectInput("type", "Tipo", TICKET_TYPES, type)}
    ${blocked}
    ${areaInput("objective", "Objetivo", draft.objective)}
    ${areaInput("task", "Tarefa", draft.task)}
    ${areaInput("acceptance_criteria", "Critérios de aceite", draft.acceptance_criteria)}
    ${areaInput("artifacts", "Artefatos (opcional)", draft.artifacts)}
    ${areaInput("references", "Referências (opcional)", draft.references)}
    ${selectInput("human_need", `${tagLabels.human_need} (opcional)`, TAG_VALUES.human_need, draft.human_need)}
    ${attachmentField()}
    <div class="form-actions"><button ${state.busy ? "disabled" : ""}>Criar Ticket</button><button type="button" id="toggle-ticket-form">Cancelar</button></div>
  </form>`;
}

function ticketActionLabel(action) {
  return {
    "ticket-decide-open": "Devolver para OPEN", "ticket-decide-close": "Fechar Ticket",
    "ticket-await": "Enviar para decisão", "ticket-reopen": "Devolver para OPEN", "ticket-close": "Concluir Ticket",
  }[action];
}

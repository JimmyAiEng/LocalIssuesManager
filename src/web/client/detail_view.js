import {
  escapeHtml, humanActions, parseChecklist, phaseSteps, splitThread, statusAge,
} from "./view_model.js";
import { state } from "./state.js";
import {
  attachmentField, commentField, commentForm, date, feedback, message, reasonField,
  root, summaryError, tagEditor, tagsMarkup,
} from "./view.js";
import { ticketsSection } from "./ticket_view.js";
import { renderMarkdown } from "./markdown.js";
import { requirementsMarkup } from "./gherkin.js";

export function renderDetail() {
  const issue = state.issue;
  document.title = `${issue.title} · Issues`;
  const owner = issue.owner ? `Owner: ${escapeHtml(issue.owner)}` : "Sem Owner";
  const closed = issue.closed_reason ? `<section class="box"><h2>Motivo de fechamento</h2><p class="preserve">${escapeHtml(issue.closed_reason)}</p></section>` : "";
  const actions = humanActions(issue.status).length ? `<section class="actionbar"><h2>Ações</h2>${actionsPanel(issue)}</section>` : "";
  root().innerHTML = `<header class="toolbar"><a class="button" href="/" data-back>← Voltar ao quadro</a><button type="button" id="refresh-issue">Atualizar Issue</button></header>${feedback()}<main class="detail"><header><span class="badge status-${issue.status}">${issue.status}</span><h1>${escapeHtml(issue.title)}</h1><p class="meta">Projeto: ${escapeHtml(issue.project)} · Tipo: ${escapeHtml(issue.type)} · ${owner}</p><p class="meta">ID: <code>${escapeHtml(issue.id)}</code> <button type="button" class="copy-id" data-copy-id="${escapeHtml(issue.id)}">Copiar ID</button> · No Status ${statusAge(issue)}</p>${tagsMarkup(issue.tags)}${tagEditor("issue", issue.tags, null, issue.status)}</header>${detailStepper(issue)}${closed}${mdField("Problema", issue.problem)}${artifactSection(issue)}${mdField("Artefatos", issue.artifacts)}${criteriaField(issue.acceptance_criteria)}${requirementsSection(issue)}${designSection(issue)}${ticketsSection(issue)}${dates(issue)}${thread(issue.thread)}${commentSection(issue)}${actions}</main>`;
}

// Pipeline Planning→Deploy no topo do detalhe; fase com Ticket AWAITING sinaliza gate pendente (âmbar).
function detailStepper(issue) {
  const tickets = issue.tickets ?? [];
  const dots = phaseSteps(issue).map((step) => {
    const gate = tickets.some((ticket) => ticket.type === step.type && ticket.status === "AWAITING");
    return `<li class="dstep dstep--${step.state}${gate ? " dstep--gate" : ""}"><span class="dstep-dot">${step.short}</span><span class="dstep-label">${escapeHtml(step.type)}</span></li>`;
  }).join("");
  return `<ol class="detail-stepper" aria-label="Fases do fluxo">${dots}</ol>`;
}

function commentSection(issue) {
  if (issue.status === "CLOSED") return "";
  const open = state.commentPanel?.scope === "issue";
  const body = open ? commentForm(null) : `<button type="button" class="new-comment" data-open-comment="issue">+ Comentar</button>`;
  return `<section class="box"><h2>Comentar</h2>${body}</section>`;
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
  if ((state.panel === "close" || state.panel === "decide-close") && state.confirmClose) return closeConfirmation(issue);
  if (state.panel === "reset") {
    return `<form id="action-form" class="form">${summaryError()}<p class="hint">A Issue voltará para OPEN e o Owner será removido.</p>${commentField()}${attachmentField()}<button ${state.busy ? "disabled" : ""}>Fazer Reset</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
  }
  if (state.panel === "decide-open") {
    return `<form id="action-form" class="form">${summaryError()}${commentField()}${attachmentField()}<button ${state.busy ? "disabled" : ""}>Confirmar devolução</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
  }
  return `<form id="action-form" class="form">${summaryError()}${commentField()}${reasonField()}<button ${state.busy ? "disabled" : ""}>Fechar Issue</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
}

// Confirmação de fechamento irreversível (UX.md §6): só "Fechar definitivamente" chama a API.
function closeConfirmation(issue) {
  const reason = state.draft.closed_reason ? ` Motivo: ${escapeHtml(state.draft.closed_reason)}.` : "";
  return `<div class="confirm-close" role="alertdialog" aria-label="Confirmar fechamento"><p>Fechar "${escapeHtml(issue.title)}"? Esta ação moverá a Issue para CLOSED e não poderá ser desfeita.${reason}</p><div class="form-actions"><button type="button" data-cancel-close="1">Cancelar</button><button type="button" class="danger" data-confirm-close="1" ${state.busy ? "disabled" : ""}>Fechar definitivamente</button></div></div>`;
}

function mdField(title, value) {
  return `<section class="box"><h2>${title}</h2><div class="md">${renderMarkdown(value)}</div></section>`;
}

function artifactSection(issue) {
  if (issue.artifact == null) return "";
  return `<details class="box artifact" open><summary>Artefato</summary><div class="md">${renderMarkdown(issue.artifact)}</div></details>`;
}

// Ausência de requisitos com Planning já entregue é violação do workflow — aviso, nunca silêncio.
function requirementsSection(issue) {
  const markup = requirementsMarkup(state.requirements);
  if (markup) return `<details class="box requirements" open><summary>Requisitos</summary>${markup}</details>`;
  const delivered = issue.tickets?.some((ticket) => ticket.type === "Planning" && ticket.status !== "OPEN");
  if (!delivered || issue.status === "CLOSED") return "";
  return `<section class="box requirements"><h2>Requisitos</h2><p class="warn" role="alert">Nenhum requisito persistido — o Ticket Planning deveria ter entregue Features Gherkin via <code>issues requirements set</code>.</p></section>`;
}

// Diagramas via <img>: a rota devolve image/svg+xml e <img> não executa script no SVG —
// injetar o SVG no innerHTML abriria o buraco que escapeHtml fecha no resto do client.
function designSection(issue) {
  const tickets = state.design?.tickets ?? [];
  const delivered = issue.tickets?.filter((ticket) => ticket.type === "Design" && ticket.status !== "OPEN") ?? [];
  const packages = tickets.filter((entry) => entry.design_md !== null || kindsOf(entry).length);
  if (!packages.length) {
    if (!delivered.length || issue.status === "CLOSED") return "";
    return `<section class="box design"><h2>Design</h2><p class="warn" role="alert">Nenhum design persistido — o Ticket Design deveria ter entregue a spec e os diagramas via <code>issues design doc</code> e <code>issues design add</code>.</p></section>`;
  }
  const many = packages.length > 1;
  return packages.map((entry) => {
    const kinds = kindsOf(entry);
    const diagrams = kinds.length
      ? `<div class="diagrams">${kinds.map((kind) => figure(issue, entry, kind)).join("")}</div>`
      : `<p class="warn" role="alert">Spec sem diagrama — use <code>issues design add</code>.</p>`;
    const doc = entry.design_md ? `<div class="md">${renderMarkdown(entry.design_md)}</div>` : "";
    // Sempre aberto, como as seções irmãs Artefato e Requisitos: o diagrama tem de estar à vista,
    // é o que a Issue pede. O colapso não persiste entre renders — mesma limitação das irmãs.
    const label = many ? `Design · Ticket ${escapeHtml(entry.ticketId.slice(0, 8))}` : "Design";
    return `<details class="box design" open><summary>${label}</summary>${doc}${diagrams}</details>`;
  }).join("");
}

// Diagrama inválido no disco não vira <img> (a rota .svg responde 400 e o browser mostra ícone
// quebrado, sem dizer o porquê): o erro do gate já veio no pacote, então mostra-se o erro.
// Sem loading="lazy": a seção fica abaixo da dobra e lazy só dispararia o request quando o
// humano rolasse até lá — aí ele espera o cold start do engine olhando um quadro vazio.
function figure(issue, entry, kind) {
  const error = (entry.validation?.errors ?? []).find((item) => item.path === `${kind}.puml`);
  const line = error?.line ? ` (linha ${error.line})` : "";
  const body = error
    ? `<p class="warn" role="alert">${escapeHtml(kind)}.puml inválido${line}: ${escapeHtml(error.message)}</p>`
    : `<img src="/api/issues/${encodeURIComponent(issue.id)}/design/${encodeURIComponent(entry.ticketId)}/${encodeURIComponent(kind)}.svg" alt="Diagrama ${escapeHtml(kind)} do Design">`;
  return `<figure>${body}<figcaption>${escapeHtml(kind)}</figcaption></figure>`;
}

function kindsOf(entry) {
  return Object.keys(entry.diagrams ?? {}).filter((kind) => entry.diagrams[kind] !== null);
}

function criteriaField(value) {
  const items = parseChecklist(value);
  const body = items.length
    ? `<ul class="checklist">${items.map((item) => `<li class="${item.done ? "done" : ""}">${escapeHtml(item.label)}</li>`).join("")}</ul>`
    : `<div class="md">${renderMarkdown(value)}</div>`;
  return `<section class="box"><h2>Critérios de aceite</h2>${body}</section>`;
}

function thread(entries) {
  const { older, recent } = splitThread(entries);
  const toggle = older.length && !state.threadExpanded
    ? `<li class="thread-more"><button type="button" data-expand-thread="1">Mostrar ${older.length} anterior${older.length === 1 ? "" : "es"}</button></li>` : "";
  const shown = state.threadExpanded ? [...older, ...recent] : recent;
  return `<section class="box"><h2>Thread</h2><ol class="thread">${toggle}${shown.map(message).join("")}</ol></section>`;
}

function dates(issue) {
  const claimed = issue.claimed_at ? `<p>Claim: ${date(issue.claimed_at)}</p>` : "";
  return `<section class="box"><h2>Datas</h2><p>Criada: ${date(issue.created_at)}</p>${claimed}<p>Última mudança: ${date(issue.status_changed_at)}</p></section>`;
}

function actionLabel(action) {
  return { close: "Fechar Issue", reset: "Fazer Reset", "decide-open": "Devolver para OPEN", "decide-close": "Fechar Issue" }[action];
}

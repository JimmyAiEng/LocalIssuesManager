import {
  DECIDE_REASONS, escapeHtml, humanActions, parseChecklist, splitThread, statusAge,
} from "./view_model.js";
import { state } from "./state.js";
import {
  attachmentField, commentField, commentForm, date, feedback, message, reasonField,
  root, summaryError, tagEditor, tagsMarkup,
} from "./view.js";
import { renderMarkdown } from "./markdown.js";
import { requirementsMarkup } from "./gherkin.js";
import { documentsMarkup } from "./documents.js";

export function renderDetail() {
  const issue = state.issue;
  document.title = `${issue.title} · Issues`;
  const owner = issue.owner ? `Owner: ${escapeHtml(issue.owner)}` : "Sem Owner";
  const closed = issue.closed_reason ? `<section class="box"><h2>Motivo de fechamento</h2><p class="preserve">${escapeHtml(issue.closed_reason)}</p></section>` : "";
  // CLOSED entra na barra por causa da remoção — é a única ação que sobra numa Issue imutável.
  const actions = humanActions(issue.status).length || canClaim(issue.status) || issue.status === "CLOSED" ? `<section class="actionbar"><h2>Ações</h2>${actionsPanel(issue)}</section>` : "";
  root().innerHTML = `<header class="toolbar"><a class="button" href="/" data-back>← Voltar ao quadro</a><button type="button" id="refresh-issue">Atualizar Issue</button></header>${feedback()}<main class="detail"><header><span class="badge status-${issue.status}">${issue.status}</span><h1>${escapeHtml(issue.title)}</h1><p class="meta">Projeto: ${escapeHtml(issue.project)} · Tipo: ${escapeHtml(issue.type)} · Action: ${escapeHtml(issue.action)} · ${owner}</p><p class="meta">ID: <code>${escapeHtml(issue.id)}</code> <button type="button" class="copy-id" data-copy-id="${escapeHtml(issue.id)}">Copiar ID</button> · No Status ${statusAge(issue)}</p>${tagsMarkup(issue.tags)}${tagEditor(issue.tags, issue.status)}</header>${closed}${mdField("Problema", issue.problem)}${artifactSection(issue)}${documentsMarkup(state.documents)}${criteriaField(issue.acceptance_criteria)}${relatedSection(issue)}${requirementsSection(issue)}${designSection(issue)}${dates(issue)}${thread(issue.thread)}${commentSection(issue)}${actions}</main>`;
}

// Claim humano pelo teclado da web: OPEN (assume a Issue livre) e APPROVED (retoma a aprovada, que
// reentrou na fila para a sessão pós-aprovação seguir os próximos passos). Ambas → CLAIMED.
function canClaim(status) {
  return status === "OPEN" || status === "APPROVED";
}

function commentSection(issue) {
  if (issue.status === "CLOSED") return "";
  const body = state.commentPanel ? commentForm() : `<button type="button" class="new-comment" data-open-comment="issue">+ Comentar</button>`;
  return `<section class="box"><h2>Comentar</h2>${body}</section>`;
}

function actionsPanel(issue) {
  const available = humanActions(issue.status);
  const claim = canClaim(issue.status)
    ? `<button type="button" id="claim-issue" ${state.busy ? "disabled" : ""}>Assumir Issue</button>` : "";
  const buttons = available.map((action) =>
    `<button type="button"${action === "decide-approve" ? ' class="approve"' : ""} data-open-panel="${action}">${actionLabel(action)}</button>`).join(" ");
  // Remover só em CLOSED; o use case ainda barra se a árvore de relates não estiver toda fechada.
  const remove = issue.status === "CLOSED"
    ? `<button type="button" class="danger" data-open-delete="1" ${state.busy ? "disabled" : ""}>Remover Issue</button>` : "";
  if (!claim && !available.length && !remove) return `<p class="muted">Issue imutável</p>`;
  return `<div class="actions">${claim}${buttons}${remove}</div>${actionForm(issue)}${deleteConfirmation(issue)}`;
}

// Remoção irreversível: mesmo molde do closeConfirmation — só "Remover definitivamente" chama a API.
function deleteConfirmation(issue) {
  if (!state.confirmDelete) return "";
  return `<div class="confirm-close" role="alertdialog" aria-label="Confirmar remoção"><p>Remover "${escapeHtml(issue.title)}"? A Issue e seus arquivos serão apagados do disco e não poderão ser recuperados.</p><div class="form-actions"><button type="button" data-cancel-delete="1">Cancelar</button><button type="button" class="danger" data-confirm-delete="1" ${state.busy ? "disabled" : ""}>Remover definitivamente</button></div></div>`;
}

function actionForm(issue) {
  if (!state.panel || !humanActions(issue.status).includes(state.panel)) return "";
  if ((state.panel === "close" || state.panel === "decide-close") && state.confirmClose) return closeConfirmation(issue);
  if (state.panel === "reset") {
    return `<form id="action-form" class="form">${summaryError()}<p class="hint">A Issue voltará para OPEN e o Owner será removido.</p>${commentField()}${attachmentField()}<button ${state.busy ? "disabled" : ""}>Fazer Reset</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
  }
  if (state.panel === "decide-approve") {
    return `<form id="action-form" class="form">${summaryError()}<p class="hint">A Issue irá para APPROVED e reentra na fila sem Owner, para a próxima sessão continuar a partir do handoff.</p>${commentField()}${attachmentField()}<button class="approve" ${state.busy ? "disabled" : ""}>Confirmar aprovação</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
  }
  if (state.panel === "decide-open") {
    return `<form id="action-form" class="form">${summaryError()}${commentField()}${attachmentField()}<button ${state.busy ? "disabled" : ""}>Confirmar devolução</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
  }
  // Fechar direto da AWAITING é abandono: sem `concluido` na lista — aprovar é o botão Aprovar.
  const reasons = state.panel === "decide-close" ? reasonField(DECIDE_REASONS) : reasonField();
  return `<form id="action-form" class="form">${summaryError()}${commentField()}${reasons}<button ${state.busy ? "disabled" : ""}>Fechar Issue</button><button type="button" data-cancel-panel>Cancelar</button></form>`;
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

// Linhagem: as Issues relacionadas e seus artefatos, navegáveis — o contexto que uma nova
// sessão herda ao reivindicar esta Issue.
function relatedSection(issue) {
  const related = issue.related ?? [];
  if (!related.length) return "";
  const items = related.map((item) => {
    const artifact = item.artifact ? `<div class="md">${renderMarkdown(item.artifact)}</div>` : `<p class="muted">Sem artefato</p>`;
    const kind = item.kind ? ` <span class="dim">· ${escapeHtml(item.kind)}</span>` : ""; // linhagem direcionada: parent/child/see-also
    return `<li><a href="/issues/${item.id}" data-issue-id="${item.id}"><span class="badge status-${item.status}">${item.status}</span> <strong>${escapeHtml(item.title)}</strong> <span class="dim">${escapeHtml(item.action)}</span>${kind}</a>${artifact}</li>`;
  }).join("");
  return `<details class="box related" open><summary>Issues relacionadas (${related.length})</summary><ul class="related-list">${items}</ul></details>`;
}

// Ausência de requisitos numa Issue Planning entregue é violação do workflow — aviso, nunca silêncio.
function requirementsSection(issue) {
  const markup = requirementsMarkup(state.requirements);
  if (markup) return `<details class="box requirements" open><summary>Requisitos</summary>${markup}</details>`;
  if (issue.action !== "Planning" || issue.status === "OPEN" || issue.status === "CLOSED") return "";
  return `<section class="box requirements"><h2>Requisitos</h2><p class="warn" role="alert">Nenhum requisito persistido — a Issue Planning deve entregar as Features via <code>issues requirements set</code>.</p></section>`;
}

// Diagramas via <img>: a rota devolve image/svg+xml e <img> não executa script no SVG —
// injetar o SVG no innerHTML abriria o buraco que escapeHtml fecha no resto do client.
function designSection(issue) {
  const pack = state.design;
  const kinds = pack ? Object.keys(pack.diagrams ?? {}).filter((kind) => pack.diagrams[kind] !== null) : [];
  if (!pack || (pack.design_md === null && !kinds.length)) {
    if (issue.action !== "Design" || issue.status === "OPEN" || issue.status === "CLOSED") return "";
    return `<section class="box design"><h2>Design</h2><p class="warn" role="alert">Nenhum design persistido — a Issue Design deve entregar a spec e os diagramas via <code>issues design doc</code> e <code>issues design add</code>.</p></section>`;
  }
  const diagrams = kinds.length
    ? `<div class="diagrams">${kinds.map((kind) => figure(issue, pack, kind)).join("")}</div>`
    : pack.architecture_changed === false
      ? "" // atalho ao plano: diagramas dispensados; o rótulo da decisão já explica
      : `<p class="warn" role="alert">Spec sem diagrama — use <code>issues design add</code>.</p>`;
  const doc = pack.design_md ? `<div class="md">${renderMarkdown(pack.design_md)}</div>` : "";
  return `<details class="box design" open><summary>Design</summary>${architectureDecision(pack)}${doc}${diagrams}</details>`;
}

// Decisão de arquitetura (architecture_changed) e falhas de gate sem diagrama associado
// (níveis faltantes / decisão ausente): true exige 4 níveis + aceite humano; false é atalho ao plano.
function architectureDecision(pack) {
  const changed = pack.architecture_changed;
  const label = changed === null || changed === undefined
    ? '<span class="warn" role="alert">Arquitetura: decisão pendente (<code>issues design changed</code>)</span>'
    : `Arquitetura ${changed ? "alterada — exige os 4 níveis + aceite humano" : "inalterada — atalho ao plano, sem diagramas"}`;
  const gate = (pack.validation?.errors ?? [])
    .filter((error) => error.code === "missing_level" || error.code === "decision_required")
    .map((error) => `<p class="warn" role="alert">${escapeHtml(error.message)}</p>`).join("");
  return `<p class="meta">${label}</p>${gate}`;
}

// Diagrama inválido no disco não vira <img> (a rota .svg responde 400): mostra-se o erro do gate.
function figure(issue, pack, kind) {
  const error = (pack.validation?.errors ?? []).find((item) => item.path === `${kind}.puml`);
  const line = error?.line ? ` (linha ${error.line})` : "";
  const body = error
    ? `<p class="warn" role="alert">${escapeHtml(kind)}.puml inválido${line}: ${escapeHtml(error.message)}</p>`
    : `<img src="/api/issues/${encodeURIComponent(issue.id)}/design/${encodeURIComponent(kind)}.svg" alt="Diagrama ${escapeHtml(kind)} do Design">`;
  return `<figure>${body}<figcaption>${escapeHtml(kind)}</figcaption></figure>`;
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
  return { close: "Fechar Issue", reset: "Fazer Reset", "decide-approve": "Aprovar", "decide-open": "Devolver para OPEN", "decide-close": "Fechar Issue" }[action];
}

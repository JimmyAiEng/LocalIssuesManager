import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentsMarkup,
  canClaimTicket,
  canCreateTicket,
  classifyMutationError,
  filterIssues,
  groupIssues,
  humanActions,
  parseChecklist,
  statusAge,
  ticketHumanActions,
  validateClose,
  validateCreate,
  validateCreateTicket,
  validateDecide,
  validateReset,
  validateTicketStatus,
} from "../../src/web/client/view_model.js";

const issues = [
  { id: "later", title: "Needle later", project: "app", type: "QA", status: "OPEN", created_at: "2026-01-02T00:00:00Z" },
  { id: "first", title: "Needle first", project: "app", type: "QA", status: "OPEN", created_at: "2026-01-01T00:00:00Z" },
  { id: "going", title: "Needle going", project: "app", type: "QA", status: "ON-GOING", created_at: "2026-01-01T00:00:00Z" },
  { id: "other", title: "Needle other", project: "other", type: "Feat", status: "AWAITING", created_at: "2026-01-01T00:00:00Z" },
];

test("view model combina filtros por tipo e mantém as cinco colunas ordenadas", () => {
  const filtered = filterIssues(issues, { title: "needle", project: "app", type: "QA" });
  const columns = groupIssues(filtered);
  assert.deepEqual(columns.OPEN.map((issue) => issue.id), ["first", "later"]);
  assert.deepEqual(columns["ON-GOING"].map((issue) => issue.id), ["going"]);
  assert.deepEqual(columns.AWAITING, []);
  assert.equal(Object.keys(columns).length, 5);
});

test("view model mostra idade humana do Status", () => {
  const age = statusAge({ ...issues[0], status_changed_at: "2026-01-01T00:00:00Z" }, new Date("2026-01-03T01:00:00Z"));
  assert.equal(age, "há 2 dias");
});

test("somente ações humanas válidas por Status, sem Claim nem reset de ON-GOING", () => {
  assert.deepEqual(humanActions("OPEN"), ["close"]);
  assert.deepEqual(humanActions("CLAIMED"), ["reset"]);
  assert.deepEqual(humanActions("ON-GOING"), []);
  assert.deepEqual(humanActions("AWAITING"), ["decide-open", "decide-close"]);
  assert.deepEqual(humanActions("CLOSED"), []);
});

test("ações humanas de Ticket: decisão em AWAITING, status quando dono humano", () => {
  assert.deepEqual(ticketHumanActions({ status: "AWAITING", owner: null }), ["ticket-decide-open", "ticket-decide-close"]);
  assert.deepEqual(ticketHumanActions({ status: "CLAIMED", owner: "human" }), ["ticket-await", "ticket-reopen", "ticket-close"]);
  assert.deepEqual(ticketHumanActions({ status: "CLAIMED", owner: "pi" }), []);
  assert.deepEqual(ticketHumanActions({ status: "OPEN", owner: null }), []);
  assert.deepEqual(ticketHumanActions({ status: "CLOSED", owner: "pi" }), []);
});

test("Humano pode assumir só Ticket OPEN, habilitando mudança de status como Owner", () => {
  assert.equal(canClaimTicket({ status: "OPEN", owner: null }), true);
  assert.equal(canClaimTicket({ status: "CLAIMED", owner: "pi" }), false);
  assert.equal(canClaimTicket({ status: "AWAITING", owner: null }), false);
  assert.equal(canClaimTicket({ status: "CLOSED", owner: "pi" }), false);
});

test("criar Ticket só quando a Issue está CLAIMED ou ON-GOING", () => {
  assert.equal(canCreateTicket("CLAIMED"), true);
  assert.equal(canCreateTicket("ON-GOING"), true);
  assert.equal(canCreateTicket("OPEN"), false);
  assert.equal(canCreateTicket("AWAITING"), false);
});

test("criar Issue exige campos obrigatórios e Tipo válido; artefatos/critérios opcionais", () => {
  const draft = { title: "", project: "app", type: "Nope", problem: "p", artifacts: "", acceptance_criteria: "" };
  const result = validateCreate(draft);
  assert.equal(result.ok, false);
  assert.equal(result.values, draft);
  assert.match(result.errors.title, /obrigat/i);
  assert.match(result.errors.type, /Tipo/);
  assert.equal(result.errors.artifacts, undefined);
  assert.equal(result.errors.acceptance_criteria, undefined);
});

test("criar Issue aceita apenas obrigatórios com Tipo do enum", () => {
  const draft = { title: "Nova", project: "app", type: "Feat", problem: "p", artifacts: "", acceptance_criteria: "" };
  assert.deepEqual(validateCreate(draft), { ok: true, values: draft, errors: {} });
});

test("criar Ticket exige objetivo, tarefa, critérios e Tipo válido", () => {
  const bad = { objective: "", task: "t", acceptance_criteria: "c", type: "Nope", artifacts: "", references: "" };
  const result = validateCreateTicket(bad);
  assert.equal(result.ok, false);
  assert.match(result.errors.objective, /obrigat/i);
  assert.match(result.errors.type, /Tipo/);
  const ok = { objective: "o", task: "t", acceptance_criteria: "c", type: "Implement", artifacts: "", references: "" };
  assert.deepEqual(validateCreateTicket(ok), { ok: true, values: ok, errors: {} });
});

test("status de Ticket: comentário sempre; CLOSED também exige Motivo", () => {
  assert.equal(validateTicketStatus({ status: "AWAITING", comment: "pronto" }).ok, true);
  assert.match(validateTicketStatus({ status: "AWAITING", comment: "" }).errors.comment, /obrigat/i);
  assert.equal(validateTicketStatus({ status: "CLOSED", comment: "fim", closed_reason: "concluido" }).ok, true);
  assert.match(validateTicketStatus({ status: "CLOSED", comment: "fim", closed_reason: "" }).errors.closed_reason, /Motivo/);
  assert.match(validateTicketStatus({ status: "CLOSED", comment: "", closed_reason: "concluido" }).errors.comment, /obrigat/i);
});

test("fechar exige apenas Motivo válido (comentário opcional); reset exige comentário", () => {
  assert.equal(validateClose({ comment: "", closed_reason: "concluido" }).ok, true);
  assert.equal(validateClose({ comment: "", closed_reason: "" }).errors.comment, undefined);
  assert.match(validateClose({ comment: "", closed_reason: "" }).errors.closed_reason, /Motivo/);
  assert.match(validateClose({ comment: "x", closed_reason: "x" }).errors.closed_reason, /Motivo/);
  assert.equal(validateReset({ comment: "liberar" }).ok, true);
  assert.match(validateReset({ comment: "  " }).errors.comment, /obrigat/i);
});

test("Decisão AWAITING: OPEN só com comentário; CLOSED com Motivo", () => {
  assert.equal(validateDecide({ status: "OPEN", comment: "voltar" }).ok, true);
  assert.match(validateDecide({ status: "OPEN", comment: "", closed_reason: "concluido" }).errors.comment, /obrigat/i);
  assert.equal(validateDecide({ status: "CLOSED", comment: "fim", closed_reason: "concluido" }).ok, true);
  assert.equal(validateDecide({ status: "CLOSED", comment: "", closed_reason: "concluido" }).ok, true);
  assert.match(validateDecide({ status: "CLOSED", comment: "fim", closed_reason: "" }).errors.closed_reason, /Motivo/);
});

test("critérios '[ ]'/'[x]' viram checklist; texto sem sintaxe não vira itens", () => {
  const items = parseChecklist("[ ] pendente\n[x] feito\n[X] outro feito\ntexto solto");
  assert.deepEqual(items, [
    { done: false, label: "pendente" },
    { done: true, label: "feito" },
    { done: true, label: "outro feito" },
  ]);
  assert.deepEqual(parseChecklist("apenas texto\nsem colchetes"), []);
  assert.deepEqual(parseChecklist(""), []);
});

test("anexos renderizam img clicável para imagem e video controls para vídeo", () => {
  const html = attachmentsMarkup([
    { id: "a1", kind: "image", filename: 'foto "boa".png' },
    { id: "b2", kind: "video", filename: "clipe.mp4" },
  ]);
  assert.match(html, /<a class="attachment" href="\/api\/attachments\/a1"[^>]*><img src="\/api\/attachments\/a1"/);
  assert.match(html, /alt="foto &quot;boa&quot;\.png"/); // filename escapado no atributo
  assert.match(html, /<video class="attachment" controls src="\/api\/attachments\/b2">/);
});

test("sem anexos não renderiza bloco algum", () => {
  assert.equal(attachmentsMarkup([]), "");
  assert.equal(attachmentsMarkup(undefined), "");
});

test("409 é conflito; demais falhas preservam mensagem de erro", () => {
  assert.deepEqual(classifyMutationError(409, "Stale Issue save"), {
    kind: "conflict",
    message: "Esta Issue mudou desde a última atualização.",
  });
  assert.deepEqual(classifyMutationError(400, "comment is required"), {
    kind: "error",
    message: "comment is required",
  });
});

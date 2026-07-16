import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentsMarkup,
  canClaimTicket,
  canCreateTicket,
  classifyMutationError,
  filterIssues,
  groupIssues,
  hasPendingDecision,
  humanActions,
  isStale,
  isUnclassified,
  parseChecklist,
  pendingDecisions,
  phaseBlockerOf,
  phaseSteps,
  splitThread,
  statusAge,
  suggestNextTicketType,
  tagRoute,
  ticketCreationGate,
  ticketHumanActions,
  validateClose,
  validateCreate,
  validateCreateTicket,
  validateDecide,
  validateReset,
  validateTicketStatus,
} from "../../src/web/client/view_model.js";
import { parseFeature, requirementsMarkup } from "../../src/web/client/gherkin.js";

const issues = [
  { id: "later", title: "Needle later", project: "app", type: "QA", status: "OPEN", created_at: "2026-01-02T00:00:00Z" },
  { id: "first", title: "Needle first", project: "app", type: "QA", status: "OPEN", created_at: "2026-01-01T00:00:00Z" },
  { id: "going", title: "Needle going", project: "app", type: "QA", status: "ON-GOING", created_at: "2026-01-01T00:00:00Z" },
  { id: "other", title: "Needle other", project: "other", type: "Feat", status: "AWAITING", created_at: "2026-01-01T00:00:00Z" },
];

test("rotas de classificação distinguem Issue e Ticket existentes", () => {
  assert.equal(tagRoute("i1", "issue"), "/api/issues/i1/tags");
  assert.equal(tagRoute("i1", "ticket", "t1"), "/api/issues/i1/tickets/t1/tags");
});

test("view model combina filtros por tipo e mantém as cinco colunas ordenadas", () => {
  const filtered = filterIssues(issues, { title: "needle", project: "app", type: "QA" });
  const columns = groupIssues(filtered);
  assert.deepEqual(columns.OPEN.map((issue) => issue.id), ["first", "later"]);
  assert.deepEqual(columns["ON-GOING"].map((issue) => issue.id), ["going"]);
  assert.deepEqual(columns.AWAITING, []);
  assert.equal(Object.keys(columns).length, 5);
});

test("filtro por Owner isola as Issues de um dono", () => {
  const withOwner = [
    { ...issues[0], owner: "pi" },
    { ...issues[1], owner: "human" },
    { ...issues[2], owner: "pi" },
  ];
  const filtered = filterIssues(withOwner, { title: "", project: "", type: "", owner: "pi" });
  assert.deepEqual(filtered.map((issue) => issue.id), ["later", "going"]);
});

test("dentro da coluna, decisões pendentes vêm antes de created_at ascendente", () => {
  const column = [
    { id: "novo-limpo", title: "a", project: "p", type: "QA", status: "ON-GOING", created_at: "2026-01-03T00:00:00Z" },
    { id: "antigo-com-decisao", title: "b", project: "p", type: "QA", status: "ON-GOING", created_at: "2026-01-01T00:00:00Z", tickets: [{ id: "t", type: "QA", status: "AWAITING", owner: null }] },
    { id: "medio-limpo", title: "c", project: "p", type: "QA", status: "ON-GOING", created_at: "2026-01-02T00:00:00Z" },
  ];
  assert.deepEqual(groupIssues(column)["ON-GOING"].map((issue) => issue.id), ["antigo-com-decisao", "medio-limpo", "novo-limpo"]);
});

test("pendingDecisions junta Issues AWAITING e Tickets AWAITING, mais antigo primeiro, ignorando CLOSED", () => {
  const list = [
    { id: "i1", title: "Issue final", project: "app", status: "AWAITING", created_at: "2026-01-01T00:00:00Z", status_changed_at: "2026-01-05T00:00:00Z" },
    { id: "i2", title: "Com ticket", project: "app", status: "ON-GOING", created_at: "2026-01-01T00:00:00Z", status_changed_at: "2026-01-02T00:00:00Z", tickets: [{ id: "t1", type: "QA", status: "AWAITING", owner: null }, { id: "t2", type: "Implement", status: "OPEN", owner: null }] },
    { id: "i3", title: "Fechada", project: "app", status: "CLOSED", created_at: "2026-01-01T00:00:00Z", tickets: [{ id: "t3", type: "QA", status: "AWAITING", owner: null }] },
  ];
  const decisions = pendingDecisions(list);
  assert.deepEqual(decisions.map((decision) => [decision.issueId, decision.kind, decision.ticketType ?? null]), [
    ["i2", "ticket", "QA"],
    ["i1", "issue", null],
  ]);
});

test("hasPendingDecision cobre Issue AWAITING e Ticket AWAITING", () => {
  assert.equal(hasPendingDecision({ status: "AWAITING", tickets: [] }), true);
  assert.equal(hasPendingDecision({ status: "ON-GOING", tickets: [{ status: "AWAITING" }] }), true);
  assert.equal(hasPendingDecision({ status: "ON-GOING", tickets: [{ status: "OPEN" }] }), false);
  assert.equal(hasPendingDecision({ status: "OPEN" }), false);
});

test("phaseSteps deriva concluída/ativa/pendente por Ticket, sem Confirmation", () => {
  const steps = phaseSteps({
    tickets: [
      { type: "Planning", status: "CLOSED" },
      { type: "Design", status: "CLOSED" },
      { type: "Implement", status: "ON-GOING" },
      { type: "Confirmation", status: "OPEN" },
    ],
  });
  assert.deepEqual(steps.map((step) => step.short), ["P", "D", "I", "Q", "D"]);
  assert.deepEqual(steps.map((step) => step.state), ["done", "done", "active", "pending", "pending"]);
});

test("isUnclassified marca Issue não-CLOSED com qualquer tag ausente", () => {
  assert.equal(isUnclassified({ status: "OPEN", tags: { complexity: "BAIXA", human_need: "AFK" } }), true);
  assert.equal(isUnclassified({ status: "OPEN", tags: { complexity: "BAIXA", human_need: "AFK", risk: "BAIXO" } }), false);
  assert.equal(isUnclassified({ status: "CLOSED", tags: {} }), false);
});

test("isStale sinaliza CLAIMED/ON-GOING parada há mais de 24h", () => {
  const now = new Date("2026-01-03T00:00:00Z");
  assert.equal(isStale({ status: "CLAIMED", status_changed_at: "2026-01-01T00:00:00Z" }, now), true);
  assert.equal(isStale({ status: "ON-GOING", status_changed_at: "2026-01-02T12:00:00Z" }, now), false);
  assert.equal(isStale({ status: "OPEN", status_changed_at: "2026-01-01T00:00:00Z" }, now), false);
  assert.equal(isStale({ status: "AWAITING", status_changed_at: "2026-01-01T00:00:00Z" }, now), false);
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
  assert.match(result.errors.title, /obrigat/i);
  assert.match(result.errors.type, /Tipo/);
  assert.equal(result.errors.artifacts, undefined);
  assert.equal(result.errors.acceptance_criteria, undefined);
});

test("criar Issue aceita apenas obrigatórios com Tipo do enum", () => {
  const draft = { title: "Nova", project: "app", type: "Feat", problem: "p", artifacts: "", acceptance_criteria: "" };
  assert.deepEqual(validateCreate(draft), { ok: true, errors: {} });
});

test("criar Ticket exige objetivo, tarefa, critérios e Tipo válido", () => {
  const bad = { objective: "", task: "t", acceptance_criteria: "c", type: "Nope", artifacts: "", references: "" };
  const result = validateCreateTicket(bad);
  assert.equal(result.ok, false);
  assert.match(result.errors.objective, /obrigat/i);
  assert.match(result.errors.type, /Tipo/);
  const ok = { objective: "o", task: "t", acceptance_criteria: "c", type: "Implement", artifacts: "", references: "" };
  assert.deepEqual(validateCreateTicket(ok), { ok: true, errors: {} });
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

test("suggestNextTicketType aponta a fase mais antiga ainda não concluída", () => {
  assert.equal(suggestNextTicketType([]), "Planning");
  assert.equal(suggestNextTicketType([{ type: "Planning", status: "CLOSED" }]), "Design");
  assert.equal(suggestNextTicketType([{ type: "Planning", status: "CLOSED" }, { type: "Design", status: "OPEN" }]), "Design");
  assert.equal(suggestNextTicketType([
    { type: "Planning", status: "CLOSED" }, { type: "Design", status: "CLOSED" }, { type: "Implement", status: "ON-GOING" },
  ]), "Implement");
  assert.equal(suggestNextTicketType(["Planning", "Design", "Implement", "QA", "Deploy"].map((type) => ({ type, status: "CLOSED" }))), "");
});

test("phaseBlockerOf espelha Issue.phaseBlocker; Confirmation nunca bloqueia", () => {
  assert.equal(phaseBlockerOf([], "Design"), null);
  assert.equal(phaseBlockerOf([{ type: "Planning", status: "OPEN" }], "Planning"), null);
  assert.equal(phaseBlockerOf([{ type: "Planning", status: "OPEN" }], "Design")?.type, "Planning");
  assert.equal(phaseBlockerOf([{ type: "Planning", status: "CLOSED" }], "Design"), null);
  assert.equal(phaseBlockerOf([{ id: "c", type: "Confirmation", status: "OPEN" }], "Deploy"), null);
});

test("ticketCreationGate: sem Ticket bloqueia; com Ticket só avisa; classificada libera", () => {
  const unclassified = { status: "CLAIMED", tags: { complexity: "BAIXA" } };
  assert.equal(ticketCreationGate({ ...unclassified, tickets: [] }), "blocked");
  assert.equal(ticketCreationGate({ ...unclassified, tickets: [{ type: "Planning", status: "OPEN" }] }), "warn");
  assert.equal(ticketCreationGate({ status: "CLAIMED", tags: { complexity: "BAIXA", human_need: "AFK", risk: "BAIXO" }, tickets: [] }), "ok");
});

test("splitThread separa as anteriores das últimas 5", () => {
  const entries = Array.from({ length: 7 }, (_, index) => index);
  assert.deepEqual(splitThread(entries), { older: [0, 1], recent: [2, 3, 4, 5, 6] });
  assert.deepEqual(splitThread([1, 2, 3]), { older: [], recent: [1, 2, 3] });
  assert.deepEqual(splitThread([]), { older: [], recent: [] });
  assert.deepEqual(splitThread([1, 2, 3, 4], 2), { older: [1, 2], recent: [3, 4] });
});

const GHERKIN = [
  "Feature: <Login>", "Como um usuário", "Eu quero poder entrar", "Para que eu acesse o sistema",
  "Scenario: Sucesso", "Given credenciais válidas", "When envio o formulário", "Then entro no sistema", "And vejo <b>meu nome</b>",
  "Scenario: Falha", "Given credenciais inválidas", "Then vejo erro",
].join("\n");

test("parseFeature estrutura nome, user story, scenarios e steps", () => {
  const feature = parseFeature(GHERKIN);
  assert.equal(feature.name, "<Login>");
  assert.deepEqual(feature.story, ["Como um usuário", "Eu quero poder entrar", "Para que eu acesse o sistema"]);
  assert.deepEqual(feature.scenarios.map((scenario) => scenario.name), ["Sucesso", "Falha"]);
  assert.deepEqual(feature.scenarios[0].steps[0], { keyword: "Given", text: "credenciais válidas" });
  assert.deepEqual(feature.scenarios[0].steps[3], { keyword: "And", text: "vejo <b>meu nome</b>" });
});

test("requirementsMarkup renderiza Features estruturadas escapando o conteúdo", () => {
  assert.equal(requirementsMarkup({ features: [] }), "");
  assert.equal(requirementsMarkup(null), "");
  const html = requirementsMarkup({ features: [GHERKIN, GHERKIN] });
  assert.equal(html.match(/<article class="feature">/g)?.length, 2);
  assert.equal(html.match(/<section class="scenario">/g)?.length, 4);
  assert.match(html, /<span class="kw kw-feature">Feature<\/span>&lt;Login&gt;/);
  assert.match(html, /<span class="kw kw-given">Given<\/span><span class="step-text">credenciais válidas<\/span>/);
  assert.match(html, /&lt;b&gt;meu nome&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>meu nome<\/b>/);
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

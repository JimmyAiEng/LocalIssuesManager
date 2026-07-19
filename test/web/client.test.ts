import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentsMarkup,
  classifyMutationError,
  escapeHtml,
  filterIssues,
  groupIssues,
  hasPendingDecision,
  humanActions,
  isStale,
  isUnclassified,
  options,
  parseChecklist,
  pendingDecisions,
  splitThread,
  statusAge,
  statusAgeFrom,
  validateClose,
  validateCreate,
  validateDecide,
  validateReset,
} from "../../src/web/client/view_model.js";
import { requirementsMarkup } from "../../src/web/client/gherkin.js";
import { documentsMarkup } from "../../src/web/client/documents.js";

const issues = [
  { id: "later", title: "Needle later", project: "app", type: "Fix", action: "Review", status: "OPEN", created_at: "2026-01-02T00:00:00Z" },
  { id: "first", title: "Needle first", project: "app", type: "Fix", action: "Review", status: "OPEN", created_at: "2026-01-01T00:00:00Z" },
  { id: "going", title: "Needle going", project: "app", type: "Fix", action: "Implement", status: "CLAIMED", created_at: "2026-01-01T00:00:00Z" },
  { id: "other", title: "Needle other", project: "other", type: "Feat", action: "Review", status: "AWAITING", created_at: "2026-01-01T00:00:00Z" },
];

test("view model combina filtros por tipo e mantém as cinco colunas ordenadas", () => {
  const filtered = filterIssues(issues, { title: "needle", project: "app", type: "Fix" });
  const columns = groupIssues(filtered);
  assert.deepEqual(columns.OPEN.map((issue) => issue.id), ["first", "later"]);
  assert.deepEqual(columns.CLAIMED.map((issue) => issue.id), ["going"]);
  assert.deepEqual(columns.AWAITING, []);
  assert.deepEqual(columns.APPROVED, []);
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
    { id: "novo", title: "a", project: "p", type: "Fix", action: "Review", status: "AWAITING", created_at: "2026-01-03T00:00:00Z" },
    { id: "antigo", title: "b", project: "p", type: "Fix", action: "Review", status: "AWAITING", created_at: "2026-01-01T00:00:00Z" },
  ];
  assert.deepEqual(groupIssues(column).AWAITING.map((issue) => issue.id), ["antigo", "novo"]);
});

test("pendingDecisions lista Issues AWAITING com action, mais antiga primeiro", () => {
  const list = [
    { id: "i1", title: "Mais nova", project: "app", action: "Implement", status: "AWAITING", created_at: "2026-01-01T00:00:00Z", status_changed_at: "2026-01-05T00:00:00Z" },
    { id: "i2", title: "Mais antiga", project: "app", action: "Review", status: "AWAITING", created_at: "2026-01-01T00:00:00Z", status_changed_at: "2026-01-02T00:00:00Z" },
    { id: "i3", title: "Fechada", project: "app", action: "Review", status: "CLOSED", created_at: "2026-01-01T00:00:00Z" },
  ];
  const decisions = pendingDecisions(list);
  assert.deepEqual(decisions.map((decision) => [decision.issueId, decision.action]), [
    ["i2", "Review"],
    ["i1", "Implement"],
  ]);
});

test("hasPendingDecision é o AWAITING da Issue", () => {
  assert.equal(hasPendingDecision({ status: "AWAITING" }), true);
  assert.equal(hasPendingDecision({ status: "OPEN" }), false);
  assert.equal(hasPendingDecision({ status: "CLAIMED" }), false);
});

// Espelha requiresHuman: risk + complexity alimentam a autonomia da Issue.
test("isUnclassified marca Issue não-CLOSED sem risk ou sem complexity", () => {
  assert.equal(isUnclassified({ status: "OPEN", tags: { complexity: "BAIXA", human_need: "AFK" } }), true); // só risk ausente
  assert.equal(isUnclassified({ status: "OPEN", tags: { human_need: "AFK", risk: "BAIXO" } }), true); // só complexity ausente
  assert.equal(isUnclassified({ status: "OPEN", tags: { complexity: "BAIXA", risk: "BAIXO" } }), false); // human_need ausente não desclassifica
  assert.equal(isUnclassified({ status: "CLOSED", tags: {} }), false);
});

test("options extrai valores únicos e ordenados de uma propriedade", () => {
  assert.deepEqual(options([{ project: "b" }, { project: "a" }, { project: "b" }], "project"), ["a", "b"]);
  assert.deepEqual(options([], "project"), []);
});

test("isStale sinaliza CLAIMED parada há mais de 24h", () => {
  const now = new Date("2026-01-03T00:00:00Z");
  assert.equal(isStale({ status: "CLAIMED", status_changed_at: "2026-01-01T00:00:00Z" }, now), true);
  assert.equal(isStale({ status: "CLAIMED", status_changed_at: "2026-01-02T12:00:00Z" }, now), false);
  assert.equal(isStale({ status: "OPEN", status_changed_at: "2026-01-01T00:00:00Z" }, now), false);
  assert.equal(isStale({ status: "AWAITING", status_changed_at: "2026-01-01T00:00:00Z" }, now), false);
});

test("view model mostra idade humana do Status", () => {
  const age = statusAge({ ...issues[0], status_changed_at: "2026-01-01T00:00:00Z" }, new Date("2026-01-03T01:00:00Z"));
  assert.equal(age, "há 2 dias");
});

test("statusAgeFrom cobre menos de 1h, horas (singular/plural) e dias (singular/plural)", () => {
  const base = "2026-01-01T00:00:00Z";
  assert.equal(statusAgeFrom(base, new Date("2026-01-01T00:30:00Z")), "há menos de 1 hora");
  assert.equal(statusAgeFrom(base, new Date("2026-01-01T01:00:00Z")), "há 1 hora");
  assert.equal(statusAgeFrom(base, new Date("2026-01-01T05:00:00Z")), "há 5 horas");
  assert.equal(statusAgeFrom(base, new Date("2026-01-02T00:00:00Z")), "há 1 dia");
  assert.equal(statusAgeFrom(base, new Date("2026-01-03T01:00:00Z")), "há 2 dias");
});

test("statusAge cai para phases.at(-1) e depois para created_at quando falta status_changed_at", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  const viaPhases = statusAge({ created_at: "2025-01-01T00:00:00Z", phases: [{ status: "OPEN", timestamp: "2026-01-01T00:00:00Z" }] }, now);
  assert.equal(viaPhases, "há 1 dia");
  const viaCreatedAt = statusAge({ created_at: "2026-01-01T00:00:00Z" }, now);
  assert.equal(viaCreatedAt, "há 1 dia");
});

test("somente ações humanas válidas por Status", () => {
  assert.deepEqual(humanActions("OPEN"), ["close"]);
  assert.deepEqual(humanActions("CLAIMED"), ["reset"]);
  assert.deepEqual(humanActions("AWAITING"), ["decide-open", "decide-close"]);
  assert.deepEqual(humanActions("CLOSED"), []);
});

test("criar Issue exige campos obrigatórios (incluindo action) e enums válidos", () => {
  const draft = { title: "", project: "app", type: "Nope", action: "Nope", problem: "p", acceptance_criteria: "" };
  const result = validateCreate(draft);
  assert.equal(result.ok, false);
  assert.match(result.errors.title, /obrigat/i);
  assert.match(result.errors.type, /Tipo/);
  assert.match(result.errors.action, /Action/);
  assert.equal(result.errors.acceptance_criteria, undefined);
});

test("criar Issue aceita apenas obrigatórios com Tipo e Action do enum", () => {
  const draft = { title: "Nova", project: "app", type: "Feat", action: "Planning", problem: "p", acceptance_criteria: "" };
  assert.deepEqual(validateCreate(draft), { ok: true, errors: {} });
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

test("splitThread separa as anteriores das últimas 5", () => {
  const entries = Array.from({ length: 7 }, (_, index) => index);
  assert.deepEqual(splitThread(entries), { older: [0, 1], recent: [2, 3, 4, 5, 6] });
  assert.deepEqual(splitThread([1, 2, 3]), { older: [], recent: [1, 2, 3] });
  assert.deepEqual(splitThread([]), { older: [], recent: [] });
  assert.deepEqual(splitThread([1, 2, 3, 4], 2), { older: [1, 2], recent: [3, 4] });
});

// Feature estruturada como a API entrega (RequirementSet): prefixos da user story são campos.
const FEATURE = {
  feature: "<Login>", como: "um usuário", quero: "entrar", para: "acessar o sistema",
  scenarios: [
    { nome: "Sucesso", steps: ["Given credenciais válidas", "When envio o formulário", "Then entro no sistema", "And vejo <b>meu nome</b>"] },
    { nome: "Falha", steps: ["Given credenciais inválidas", "Then vejo erro"] },
  ],
};

test("requirementsMarkup renderiza Features estruturadas escapando o conteúdo", () => {
  assert.equal(requirementsMarkup({ features: [] }), "");
  assert.equal(requirementsMarkup(null), "");
  const html = requirementsMarkup({ features: [FEATURE, FEATURE] });
  assert.equal(html.match(/<article class="feature">/g)?.length, 2);
  assert.equal(html.match(/<section class="scenario">/g)?.length, 4);
  assert.match(html, /<span class="kw kw-feature">Feature<\/span>&lt;Login&gt;/);
  assert.match(html, /<h4><span class="kw kw-scenario">Scenario<\/span>Sucesso<\/h4>/);
  // Prefixos pt-BR escritos na renderização, um <p> por linha da user story.
  assert.match(html, /<div class="story"><p>Como um usuário<\/p><p>Eu quero poder entrar<\/p><p>Para que eu possa acessar o sistema<\/p><\/div>/);
  assert.match(html, /<span class="kw kw-given">Given<\/span><span class="step-text">credenciais válidas<\/span>/);
  assert.match(html, /<span class="kw kw-when">When<\/span><span class="step-text">envio o formulário<\/span>/);
  assert.match(html, /<span class="kw kw-then">Then<\/span><span class="step-text">entro no sistema<\/span>/);
  assert.match(html, /<span class="kw kw-and">And<\/span>/);
  assert.match(html, /&lt;b&gt;meu nome&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>meu nome<\/b>/);
});

test("step fora do vocabulário Given/When/Then/And renderiza sem keyword", () => {
  const html = requirementsMarkup({ features: [{ ...FEATURE,
    scenarios: [{ nome: "s", steps: ["Faço <b>qualquer</b> coisa", "Given"] }] }] });
  assert.match(html, /<li><span class="step-text">Faço &lt;b&gt;qualquer&lt;\/b&gt; coisa<\/span><\/li>/);
  assert.match(html, /<li><span class="step-text">Given<\/span><\/li>/); // keyword sem texto não casa o padrão
  assert.doesNotMatch(html, /kw-given/);
});

test("funções tolerantes a undefined: campos ausentes (não só vazios) usam o fallback ??", () => {
  assert.deepEqual(pendingDecisions(undefined), []); // issues ?? []
  const noStatusChangedAt = { id: "i1", title: "t", project: "p", action: "Review", status: "AWAITING", created_at: "2026-01-01T00:00:00Z" };
  assert.deepEqual(pendingDecisions([noStatusChangedAt]), [{ issueId: "i1", issueTitle: "t", project: "p",
    action: "Review", since: "2026-01-01T00:00:00Z" }]); // status_changed_at ?? created_at

  assert.deepEqual(splitThread(undefined), { older: [], recent: [] }); // entries ?? []
  assert.equal(isUnclassified({ status: "OPEN" }), true); // issue.tags ?? {}
  assert.equal(isStale({ status: "CLAIMED", created_at: "2026-01-01T00:00:00Z" }, new Date("2026-01-03T00:00:00Z")), true); // status_changed_at ?? created_at
  assert.deepEqual(parseChecklist(undefined), []); // text ?? ""
  assert.equal(escapeHtml(undefined), ""); // value ?? ""

  assert.equal(validateCreate({}).errors.title, "Campo obrigatório"); // values[field] ?? "" (chave ausente)
  assert.equal(validateReset({}).errors.comment, "Campo obrigatório"); // values.comment ?? ""
  assert.equal(validateClose({}).errors.closed_reason, "Motivo obrigatório"); // values.closed_reason ?? ""
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

test("documentsMarkup lista os nomeados com nome e markdown, omitindo o legado artifact.md", () => {
  const html = documentsMarkup([
    { name: "artifact.md", markdown: "# Veredito" },
    { name: "intent.md", markdown: "# Intenção" },
    { name: "evidence-1.md", markdown: "- passo" },
  ]);
  assert.doesNotMatch(html, /Veredito/); // o legado já aparece na seção Artefato
  assert.match(html, /class="box document"/);
  assert.match(html, /<summary>intent\.md<\/summary>/);
  assert.match(html, /<summary>evidence-1\.md<\/summary>/);
  assert.match(html, /<h1>Intenção<\/h1>/); // markdown renderizado
});

test("documentsMarkup sem documentos não renderiza seção", () => {
  assert.equal(documentsMarkup(null), "");
  assert.equal(documentsMarkup([]), "");
});

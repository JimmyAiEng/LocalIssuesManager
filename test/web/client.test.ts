import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMutationError,
  filterIssues,
  groupIssues,
  humanActions,
  statusAge,
  validateClose,
  validateCreate,
  validateDecide,
  validateReset,
} from "../../src/web/client/view_model.js";

const issues = [
  { id: "later", title: "Needle later", project: "app", tag: "QA", status: "OPEN", created_at: "2026-01-02T00:00:00Z" },
  { id: "first", title: "Needle first", project: "app", tag: "QA", status: "OPEN", created_at: "2026-01-01T00:00:00Z" },
  { id: "other", title: "Needle other", project: "other", tag: "Design", status: "AWAITING", created_at: "2026-01-01T00:00:00Z" },
];

test("view model combina filtros e mantém as quatro colunas ordenadas", () => {
  const filtered = filterIssues(issues, { title: "needle", project: "app", tag: "QA" });
  const columns = groupIssues(filtered);
  assert.deepEqual(columns.OPEN.map((issue) => issue.id), ["first", "later"]);
  assert.deepEqual(columns.AWAITING, []);
  assert.equal(Object.keys(columns).length, 4);
});

test("view model mostra idade humana do Status", () => {
  const age = statusAge({ ...issues[0], status_changed_at: "2026-01-01T00:00:00Z" }, new Date("2026-01-03T01:00:00Z"));
  assert.equal(age, "há 2 dias");
});

test("somente ações humanas válidas por Status, sem Claim", () => {
  assert.deepEqual(humanActions("OPEN"), ["close"]);
  assert.deepEqual(humanActions("CLAIMED"), ["reset"]);
  assert.deepEqual(humanActions("AWAITING"), ["decide-open", "decide-close"]);
  assert.deepEqual(humanActions("CLOSED"), []);
});

test("criar Issue exige campos e TAG válida e preserva valores no erro", () => {
  const draft = { title: "", project: "app", tag: "Nope", problem: "p", artifacts: "a", acceptance_criteria: "c" };
  const result = validateCreate(draft);
  assert.equal(result.ok, false);
  assert.equal(result.values, draft);
  assert.match(result.errors.title, /obrigat/i);
  assert.match(result.errors.tag, /TAG/);
});

test("criar Issue aceita formulário completo com TAG do enum", () => {
  const draft = { title: "Nova", project: "app", tag: "Implement", problem: "p", artifacts: "a", acceptance_criteria: "c" };
  assert.deepEqual(validateCreate(draft), { ok: true, values: draft, errors: {} });
});

test("fechar e reset exigem comentário; fechamento exige Motivo válido", () => {
  assert.match(validateClose({ comment: "", closed_reason: "" }).errors.comment, /obrigat/i);
  assert.match(validateClose({ comment: "x", closed_reason: "x" }).errors.closed_reason, /Motivo/);
  assert.equal(validateClose({ comment: "feito", closed_reason: "concluido" }).ok, true);
  assert.equal(validateReset({ comment: "liberar" }).ok, true);
  assert.match(validateReset({ comment: "  " }).errors.comment, /obrigat/i);
});

test("Decisão AWAITING: OPEN só com comentário; CLOSED com Motivo", () => {
  assert.equal(validateDecide({ status: "OPEN", comment: "voltar" }).ok, true);
  assert.match(validateDecide({ status: "OPEN", comment: "", closed_reason: "concluido" }).errors.comment, /obrigat/i);
  assert.equal(validateDecide({ status: "CLOSED", comment: "fim", closed_reason: "concluido" }).ok, true);
  assert.match(validateDecide({ status: "CLOSED", comment: "fim", closed_reason: "" }).errors.closed_reason, /Motivo/);
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

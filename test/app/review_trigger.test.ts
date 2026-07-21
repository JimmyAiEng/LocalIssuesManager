import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createIssue, decideIssue, getIssue, listIssues, nextIssue, relateIssues, statusIssue,
} from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { afterIssueClosed } from "../../src/app/services/workflows/review_trigger.js";
import { Queue } from "../../src/domain/queue_repository.js";
import type { ActionType } from "../../src/domain/value_objects.js";

const setup = (parentAction: ActionType = "Design") => {
  const dir = mkdtempSync(join(tmpdir(), "review-trigger-"));
  createProject({ name: "app", repo: dir }, dir);
  const parent = createIssue({ title: "pai", project: "app", type: "Refactor", action: parentAction, problem: "p", actor: "human" }, dir);
  return { dir, parent };
};

// Filha Implement do pai, com linhagem parent/child recíproca (como o decompose faz).
const child = (dir: string, parentId: string, title: string) => {
  const issue = createIssue({ title, project: "app", type: "Feat", action: "Implement", problem: "p", actor: "human" }, dir);
  relateIssues({ id: issue.id, relates: [parentId], kind: "parent" }, dir);
  return issue;
};

const closeByAgent = async (dir: string, id: string, reason = "concluido") => {
  nextIssue({ agent: "claude-code", id }, dir); // claim OPEN->CLAIMED
  await statusIssue({ id, agent: "claude-code", status: "CLOSED", comment: "feito: entregue", closed_reason: reason }, dir);
};

const reviewsUnder = (dir: string, parentId: string) =>
  listIssues({ project: "app" }, dir).filter((i) => i.action === "Review" && i.relates.includes(parentId));

// A Issue de integração (integration=true). O summary de listIssues não expõe o campo, então
// carrega a entidade para lê-lo.
const integrationUnder = (dir: string, parentId: string) =>
  listIssues({ project: "app" }, dir)
    .filter((i) => i.action === "Implement" && i.relates.includes(parentId))
    .map((i) => new Queue(dir).loadRequired(i.id))
    .find((i) => i.integration);

test("com várias fatias, a última cria a Integração (integration=true) e ainda não a Review", async () => {
  const { dir, parent } = setup();
  const a = child(dir, parent.id, "impl-a");
  const b = child(dir, parent.id, "impl-b");

  await closeByAgent(dir, a.id);
  assert.equal(reviewsUnder(dir, parent.id).length, 0, "penúltima não cria nada");
  assert.equal(integrationUnder(dir, parent.id), undefined, "penúltima não cria Integração");

  await closeByAgent(dir, b.id);
  assert.equal(reviewsUnder(dir, parent.id).length, 0, "a última NÃO cria a Review: primeiro integra");
  const integration = integrationUnder(dir, parent.id);
  assert.ok(integration, "a última fatia cria a Issue de integração");
  assert.equal(integration.action, "Implement");
  assert.equal(integration.integration, true);
  assert.equal(integration.type, parent.type, "integração herda o type do pai");
  assert.equal(integration.status, "OPEN", "nasce OPEN, à espera de claim");
  assert.ok(integration.relates.some((r) => r.id === parent.id && r.kind === "parent"), "ligada ao pai via kind=parent");
  assert.ok(integration.relates.some((r) => r.id === a.id && r.kind === "see-also"), "ligada à fatia a via see-also");
  assert.ok(integration.relates.some((r) => r.id === b.id && r.kind === "see-also"), "ligada à fatia b via see-also");
});

test("fechar a Integração cria a Review ligada ao pai e às fatias", async () => {
  const { dir, parent } = setup();
  const a = child(dir, parent.id, "impl-a");
  const b = child(dir, parent.id, "impl-b");
  await closeByAgent(dir, a.id);
  await closeByAgent(dir, b.id);
  const integration = integrationUnder(dir, parent.id);
  assert.ok(integration);
  assert.equal(reviewsUnder(dir, parent.id).length, 0, "sem Review enquanto a integração não fecha");

  await closeByAgent(dir, integration.id);
  const reviews = reviewsUnder(dir, parent.id);
  assert.equal(reviews.length, 1, "fechar a integração cria exatamente uma Review");
  const review = getIssue(reviews[0].id, dir);
  assert.equal(review.type, parent.type, "Review herda o type do pai");
  assert.equal(review.status, "OPEN");
  assert.ok(review.related.some((r) => r.id === parent.id && r.kind === "parent"), "ligada ao pai");
  assert.ok(review.related.some((r) => r.id === a.id && r.kind === "see-also"), "ligada à fatia a");
  assert.ok(review.related.some((r) => r.id === b.id && r.kind === "see-also"), "ligada à fatia b");
});

test("fechar de novo não duplica a Integração e não cria Review enquanto ela vive (idempotência)", async () => {
  const { dir, parent } = setup();
  const a = child(dir, parent.id, "impl-a");
  const b = child(dir, parent.id, "impl-b");
  await closeByAgent(dir, a.id);
  await closeByAgent(dir, b.id);
  const integrations = () => listIssues({ project: "app" }, dir).filter((i) => i.title === `Integração: ${parent.title}`);
  assert.equal(integrations().length, 1, "integração criada");

  const queue = new Queue(dir);
  afterIssueClosed(queue, queue.loadRequired(b.id), dir); // gatilho dispara de novo pelo mesmo fechamento
  assert.equal(integrations().length, 1, "não duplica a integração");
  assert.equal(reviewsUnder(dir, parent.id).length, 0, "e não cria Review com a integração viva");
});

test("fatia única não integra: a última cria a Review direto (inalterado)", async () => {
  const { dir, parent } = setup();
  const a = child(dir, parent.id, "impl-a");
  await closeByAgent(dir, a.id);
  assert.equal(integrationUnder(dir, parent.id), undefined, "uma só fatia não gera integração");
  assert.equal(reviewsUnder(dir, parent.id).length, 1, "cria a Review direto");
});

test("todas as irmãs abandonadas não criam Review", async () => {
  const { dir, parent } = setup();
  const a = child(dir, parent.id, "impl-a");
  const b = child(dir, parent.id, "impl-b");
  await closeByAgent(dir, a.id, "obsoleto");
  await closeByAgent(dir, b.id, "errado");
  assert.equal(reviewsUnder(dir, parent.id).length, 0);
});

test("repetir o fechamento não duplica a Review (idempotência)", async () => {
  const { dir, parent } = setup();
  const a = child(dir, parent.id, "impl-a");
  await closeByAgent(dir, a.id);
  assert.equal(reviewsUnder(dir, parent.id).length, 1);

  // Simula o gatilho disparando de novo pelo mesmo fechamento: a Review irmã já existe fora de CLOSED.
  const queue = new Queue(dir);
  afterIssueClosed(queue, queue.loadRequired(a.id), dir);
  assert.equal(reviewsUnder(dir, parent.id).length, 1, "não duplica");
});

// Implement HITL: aprovar → APPROVED → reivindicar → fechar concluido dispara a Review no fim.
test("aprovar Implement, reivindicar a aprovada e fechar dispara o gatilho de Review", async () => {
  const { dir, parent } = setup();
  const a = child(dir, parent.id, "impl-a");
  nextIssue({ agent: "claude-code", id: a.id }, dir);
  new Queue(dir).artifacts.writeText("app", { issueId: a.id, type: "document", name: "handoff.md" }, "# handoff");
  await statusIssue({ id: a.id, agent: "claude-code", status: "AWAITING", comment: "pronto para decisão humana" }, dir);
  decideIssue({ id: a.id, human: true, status: "APPROVED", comment: "aprovado" }, dir);
  nextIssue({ agent: "claude-code", id: a.id }, dir); // reivindica a aprovada
  await statusIssue({ id: a.id, agent: "claude-code", status: "CLOSED", comment: "handoff executado", closed_reason: "concluido" }, dir);
  assert.equal(reviewsUnder(dir, parent.id).length, 1);
});

test("pai Review (2º ciclo): fechar a Implement de retrabalho cria nova Review sob o pai Review", async () => {
  const { dir, parent } = setup("Review");
  const rework = child(dir, parent.id, "retrabalho");
  await closeByAgent(dir, rework.id);
  assert.equal(reviewsUnder(dir, parent.id).length, 1, "pai action=Review também resolve e cria a próxima Review");
});

test("2º ciclo com várias correções: a última cria a Integração sob o pai Review", async () => {
  const { dir, parent } = setup("Review");
  const x = child(dir, parent.id, "fix-x");
  const y = child(dir, parent.id, "fix-y");
  await closeByAgent(dir, x.id);
  await closeByAgent(dir, y.id);
  assert.equal(reviewsUnder(dir, parent.id).length, 0, "primeiro integra, não cria a próxima Review");
  const integration = integrationUnder(dir, parent.id);
  assert.ok(integration?.integration, "cria a integração também no retrabalho reprovado");
});

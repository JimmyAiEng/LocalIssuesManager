import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { statusIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { completeIssue } from "../../src/app/services/workflows/index.js";
import { DesignGateError } from "../../src/domain/gates/design_gate.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";
import type { ActionType } from "../../src/domain/value_objects.js";

function context(action: ActionType): { root: string; queue: Queue; issue: Issue } {
  const root = mkdtempSync(join(tmpdir(), "workflow-service-"));
  const queue = new Queue(root);
  const issue = Issue.create({ title: action, project: "p", type: "Feat", action, problem: "p" }, "pi");
  issue.claim("pi");
  queue.save(issue);
  return { root, queue, issue };
}

test("dispatcher seleciona Planning e Implement", async () => {
  const planning = context("Planning");
  await assert.rejects(completeIssue(planning.queue, planning.issue, "CLOSED", "fim"), /sem requisitos/);
  const implement = context("Implement");
  await assert.rejects(completeIssue(implement.queue, implement.issue, "CLOSED", "fim"), /exige worktree/);
});

test("dispatcher preserva DesignGateError estruturado", async () => {
  const { queue, issue } = context("Design");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"),
    (error: unknown) => error instanceof DesignGateError && error.errors[0]?.code === "decision_required");
});

test("Review exige doc próprio, revalida corrupção e depois aprova", async () => {
  const { queue, issue } = context("Review");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /sem o artefato/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, Array(301).fill("x").join(" "));
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /limite 300/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "# Review");
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

test("Deploy força humano antes de validar evidência", async () => {
  const { queue, issue } = context("Deploy");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "https://git/pr/1 análise sonar"), /não fecha por agente/);
  await assert.rejects(completeIssue(queue, issue, "AWAITING", "sem link"), /exige evidência/);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "https://git/pr/1 análise sonar OK"));
});

test("GatePolicy impede CLOSED com supervisão e permite AWAITING", async () => {
  const { queue, issue } = context("Review");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "# Review");
  issue.tag({ risk: "ALTO" }, "human");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /decisão humana/);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
});

// Abandono pela IA: sem entrega prevista, o gate da action não se aplica — mas a supervisão
// humana (HITL/risco ALTO) continua barrando o CLOSED e empurrando a Issue para AWAITING.
test("abandono da IA pula o gate da action nas duas saídas", async () => {
  const closed = context("Planning");
  const issue = await statusIssue({ id: closed.issue.id, agent: "pi", status: "CLOSED",
    comment: "criada errada, abandonando", closed_reason: "obsoleto" }, closed.root);
  assert.equal(issue.status, "CLOSED");
  const hitl = context("Planning");
  hitl.issue.tag({ human_need: "HITL" }, "human");
  hitl.queue.save(hitl.issue);
  const awaiting = await statusIssue({ id: hitl.issue.id, agent: "pi", status: "AWAITING",
    comment: "criada errada", closed_reason: "errado" }, hitl.root);
  assert.equal(awaiting.status, "AWAITING");
});

test("abandono não afrouxa o gate de entrega nem a decisão humana", async () => {
  const concluded = context("Planning");
  await assert.rejects(statusIssue({ id: concluded.issue.id, agent: "pi", status: "CLOSED",
    comment: "feito", closed_reason: "concluido" }, concluded.root), /sem requisitos/);
  const hitl = context("Planning");
  hitl.issue.tag({ human_need: "HITL" }, "human");
  hitl.queue.save(hitl.issue);
  await assert.rejects(statusIssue({ id: hitl.issue.id, agent: "pi", status: "CLOSED",
    comment: "abandonando", closed_reason: "obsoleto" }, hitl.root), /decisão humana/);
});

test("fechamento humano concluido exige entrega; cancelamento preserva override", async () => {
  const concluded = context("Review");
  await assert.rejects(statusIssue({ id: concluded.issue.id, human: true, status: "CLOSED",
    comment: "feito", closed_reason: "concluido" }, concluded.root), /sem o artefato/);
  const obsolete = context("Review");
  const closed = await statusIssue({ id: obsolete.issue.id, human: true, status: "CLOSED",
    comment: "cancelada", closed_reason: "obsoleto" }, obsolete.root);
  assert.equal(closed.status, "CLOSED");
});

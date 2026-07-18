import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { statusIssue } from "../../src/app/issue_use_cases.js";
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

test("QA exige doc próprio, revalida corrupção e depois aprova", async () => {
  const { queue, issue } = context("QA");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /sem o artefato/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, Array(301).fill("x").join(" "));
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /limite 300/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "# QA");
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

test("Deploy força humano antes de validar evidência", async () => {
  const { queue, issue } = context("Deploy");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "https://git/pr/1 análise sonar"), /não fecha por agente/);
  await assert.rejects(completeIssue(queue, issue, "AWAITING", "sem link"), /exige evidência/);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "https://git/pr/1 análise sonar OK"));
});

test("GatePolicy impede CLOSED com supervisão e permite AWAITING", async () => {
  const { queue, issue } = context("QA");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "# QA");
  issue.tag({ risk: "ALTO" }, "human");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /decisão humana/);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
});

test("fechamento humano concluido exige entrega; cancelamento preserva override", async () => {
  const concluded = context("QA");
  await assert.rejects(statusIssue({ id: concluded.issue.id, human: true, status: "CLOSED",
    comment: "feito", closed_reason: "concluido" }, concluded.root), /sem o artefato/);
  const obsolete = context("QA");
  const closed = await statusIssue({ id: obsolete.issue.id, human: true, status: "CLOSED",
    comment: "cancelada", closed_reason: "obsoleto" }, obsolete.root);
  assert.equal(closed.status, "CLOSED");
});

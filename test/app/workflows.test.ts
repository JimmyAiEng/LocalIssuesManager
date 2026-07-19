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

// Conjunto de documentos de uma Review válida: intent + 2 evidence + veredito no artefato legado.
function seedReview(queue: Queue, issue: Issue, verdict = "APROVADO revisão ok"): void {
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "intent.md" }, "# intenção");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-a.md" }, "# evidência a");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-b.md" }, "# evidência b");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, verdict);
}

test("dispatcher seleciona Planning; Implement não tem gate de entrega", async () => {
  const planning = context("Planning");
  await assert.rejects(completeIssue(planning.queue, planning.issue, "CLOSED", "fim"), /sem requisitos/);
  const implement = context("Implement");
  await assert.doesNotReject(completeIssue(implement.queue, implement.issue, "CLOSED", "fim"));
});

test("dispatcher preserva DesignGateError estruturado", async () => {
  const { queue, issue } = context("Design");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"),
    (error: unknown) => error instanceof DesignGateError && error.errors[0]?.code === "decision_required");
});

test("Review exige intent + ≥2 evidence + veredito válido e depois aprova", async () => {
  const { queue, issue } = context("Review");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /sem intent\.md/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "intent.md" }, "# intenção");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /duas evidence/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-a.md" }, "# a");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /duas evidence/); // só uma evidence
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-b.md" }, "# b");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /sem o veredito/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "Talvez sim");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /deve começar por APROVADO/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "APROVADO com ressalva: ok");
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

test("Review rejeita documento acima de 300 palavras", async () => {
  const { queue, issue } = context("Review");
  seedReview(queue, issue);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "intent.md" }, Array(301).fill("x").join(" "));
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /limite 300/);
});

// Veredito REPROVADO só conclui com retrabalho vivo: uma Issue relacionada Implement/Design fora de
// CLOSED, distinta das Issues revisadas (já fechadas).
test("Review REPROVADO exige Issue Implement/Design vinculada e não-CLOSED", async () => {
  const { queue, issue } = context("Review");
  seedReview(queue, issue, "REPROVADO: precisa refazer o gate");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /retrabalho vivo/);

  const revisada = Issue.create({ title: "revisada", project: "p", type: "Feat", action: "Implement", problem: "p" }, "pi");
  revisada.closeByHuman("revisada e fechada", "concluido"); // CLOSED: não conta como retrabalho vivo
  queue.save(revisada);
  issue.relate([{ id: revisada.id, kind: "see-also" }]);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /retrabalho vivo/);

  const rework = Issue.create({ title: "retrabalho", project: "p", type: "Fix", action: "Implement", problem: "p" }, "pi");
  queue.save(rework); // OPEN: retrabalho vivo
  issue.relate([{ id: rework.id, kind: "see-also" }]);
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
  seedReview(queue, issue);
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
    comment: "feito", closed_reason: "concluido" }, concluded.root), /sem intent\.md/);
  const obsolete = context("Review");
  const closed = await statusIssue({ id: obsolete.issue.id, human: true, status: "CLOSED",
    comment: "cancelada", closed_reason: "obsoleto" }, obsolete.root);
  assert.equal(closed.status, "CLOSED");
});

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

// Projeto p com concern HIGH: piso de supervisão que força AWAITING em Planning/Design.
function highConcern(queue: Queue): void {
  queue.writeProject({ name: "p", repo: "x", concern: "HIGH" });
}

// Feature JSONL válida (uma linha) reutilizada por Planning (pai + filha Design cobrem "Login").
const FEATURE = JSON.stringify({ feature: "Login", como: "u", quero: "entrar", para: "acesso",
  scenarios: [{ nome: "ok", steps: ["Given a", "When b", "Then c"] }] });
const PLAN = JSON.stringify({ objetivo: "o", passos: ["p"], arquivos: ["a"], criterio_pronto: "c" });

// Entrega de Planning válida: requisitos + uma filha Design que particiona a Feature.
function seedPlanning(queue: Queue, issue: Issue): void {
  queue.artifacts.writeText("p", { issueId: issue.id, type: "requirement" }, FEATURE);
  const child = Issue.create({ title: "d", project: "p", type: "Feat", action: "Design", problem: "p" }, "pi");
  queue.artifacts.writeText("p", { issueId: child.id, type: "requirement" }, FEATURE);
  queue.save(child);
  issue.relate([{ id: child.id, kind: "child" }]);
}

// Entrega de Design válida sem mudança de arquitetura: plano + filha Implement (atalho ao plano).
function seedDesign(queue: Queue, issue: Issue): void {
  issue.setArchitectureChanged(false);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "implementation-plan" }, PLAN);
  const child = Issue.create({ title: "impl", project: "p", type: "Feat", action: "Implement", problem: "p" }, "pi");
  queue.save(child);
  issue.relate([{ id: child.id, kind: "child" }]);
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

// concern=HIGH é piso de supervisão: Planning e Design AFK (sem tags) nunca fecham por agente —
// o CLOSED é recusado mandando usar AWAITING, e o AWAITING (decisão humana) segue permitido.
test("HIGH força AWAITING em Planning AFK: CLOSED recusado, AWAITING ok", async () => {
  const { queue, issue } = context("Planning");
  highConcern(queue);
  seedPlanning(queue, issue);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /concern HIGH.*--status AWAITING/s);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
});

test("HIGH força AWAITING em Design AFK sem mudança de arquitetura: CLOSED recusado, AWAITING ok", async () => {
  const { queue, issue } = context("Design");
  highConcern(queue);
  seedDesign(queue, issue);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /concern HIGH.*--status AWAITING/s);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
});

// HIGH não toca as demais actions: Implement AFK fecha normalmente (o gate de Implement só cobra
// evidência, já dada na transição); Review AFK também fecha com a entrega válida.
test("HIGH não altera Implement nem Review: AFK fecha normalmente", async () => {
  const implement = context("Implement");
  highConcern(implement.queue);
  await assert.doesNotReject(completeIssue(implement.queue, implement.issue, "CLOSED", "fim"));
  const review = context("Review");
  highConcern(review.queue);
  seedReview(review.queue, review.issue);
  await assert.doesNotReject(completeIssue(review.queue, review.issue, "CLOSED", "fim"));
});

// LOW (e projeto sem concern) mantém o comportamento atual: Planning/Design AFK fecham.
test("LOW não força AWAITING: Planning/Design AFK fecham como hoje", async () => {
  const planning = context("Planning");
  planning.queue.writeProject({ name: "p", repo: "x", concern: "LOW" });
  seedPlanning(planning.queue, planning.issue);
  await assert.doesNotReject(completeIssue(planning.queue, planning.issue, "CLOSED", "fim"));
  const design = context("Design"); // sem project.json: readProject null → LOW
  seedDesign(design.queue, design.issue);
  await assert.doesNotReject(completeIssue(design.queue, design.issue, "CLOSED", "fim"));
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

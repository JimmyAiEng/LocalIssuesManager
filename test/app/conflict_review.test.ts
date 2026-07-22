import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decomposeIssue } from "../../src/app/services/use_cases/decomposition_use_cases.js";
import { setArchitectureChanged } from "../../src/app/services/use_cases/design_use_cases.js";
import {
  createIssue, getIssue, listIssues, nextIssue, relateIssues, setArtifact, statusIssue,
} from "../../src/app/services/use_cases/issue_use_cases.js";
import { setPlan } from "../../src/app/services/use_cases/plan_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { setRequirements } from "../../src/app/services/use_cases/requirements_use_cases.js";
import { afterIssueClosed } from "../../src/app/services/workflows/review_trigger.js";
import { DomainError } from "../../src/domain/domain_error.js";
import { Queue } from "../../src/domain/queue_repository.js";

const FEATURE = { feature: "Login", como: "u", quero: "entrar", para: "p",
  scenarios: [{ nome: "ok", steps: ["Given x", "When y", "Then z"] }] };
const LOGOUT = { ...FEATURE, feature: "Logout" };
const PLAN = { objetivo: "o", passos: ["p"], arquivos: ["a"], criterio_pronto: "c" };

const setup = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "conflict-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};
const write = (dir: string, name: string, content: unknown): string => {
  const path = join(dir, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
};
const jsonl = (...features: object[]): string => features.map((f) => JSON.stringify(f)).join("\n");

// Planning com as Features dadas, decomposta em uma filha Design por Feature (títulos livres).
function planningWithDesigns(dir: string, ...features: { feature: string }[]): { planning: string; designs: string[] } {
  const planning = createIssue({ title: "plan", project: "app", type: "Feat", action: "Planning", problem: "p", actor: "human" }, dir).id;
  setRequirements({ issueId: planning, file: write(dir, "req.jsonl", jsonl(...features)) }, dir);
  const spec = { children: features.map((f) => ({ title: `Design ${f.feature}`, type: "Feat", action: "Design", problem: "p", features: [f.feature] })) };
  const designs = decomposeIssue({ issueId: planning, file: write(dir, "decomp.json", spec), actor: "pi" }, dir).children;
  return { planning, designs };
}

// Prepara um Design para fechar AFK: sem mudança de arquitetura + plano.
const prepDesign = (dir: string, id: string): void => {
  setArchitectureChanged({ issueId: id, value: false }, dir);
  setPlan({ issueId: id, file: write(dir, `plan-${id}.json`, PLAN) }, dir);
};
const decomposeImplement = (dir: string, id: string): string[] =>
  decomposeIssue({ issueId: id, file: write(dir, `impl-${id}.json`, { children: [{ title: "impl", type: "Feat", action: "Implement", problem: "p", plan: PLAN }] }), actor: "pi" }, dir).children;
const claimClose = async (dir: string, id: string, reason = "concluido"): Promise<void> => {
  nextIssue({ agent: "pi", id }, dir);
  await statusIssue({ id, agent: "pi", status: "CLOSED", comment: "feito com evidência", closed_reason: reason }, dir);
};
const conflictsUnder = (dir: string, parent: string) =>
  listIssues({ project: "app" }, dir).filter((i) => i.action === "ConflictReview" && i.relates.includes(parent));

test("Planning com 2 Designs vivos: fechar o último cria o ConflictReview (idempotente)", async () => {
  const dir = setup();
  const { planning, designs: [dA, dB] } = planningWithDesigns(dir, FEATURE, LOGOUT);
  prepDesign(dir, dA);
  await claimClose(dir, dA);
  assert.equal(conflictsUnder(dir, planning).length, 0, "com um Design irmão ainda vivo, nada nasce");
  prepDesign(dir, dB);
  await claimClose(dir, dB);

  const conflicts = conflictsUnder(dir, planning);
  assert.equal(conflicts.length, 1, "o último Design fechado cria exatamente um ConflictReview");
  const cr = getIssue(conflicts[0].id, dir);
  assert.equal(cr.action, "ConflictReview");
  assert.equal(cr.status, "OPEN");
  assert.equal(cr.type, "Feat", "herda o type do Planning");
  assert.ok(cr.related.some((r) => r.id === planning && r.kind === "parent"), "ligado ao Planning (kind=parent)");
  assert.ok(cr.related.some((r) => r.id === dA && r.kind === "see-also"), "see-also ao Design A");
  assert.ok(cr.related.some((r) => r.id === dB && r.kind === "see-also"), "see-also ao Design B");

  const queue = new Queue(dir);
  afterIssueClosed(queue, queue.loadRequired(dB), dir); // re-disparar não duplica
  assert.equal(conflictsUnder(dir, planning).length, 1, "idempotente: não duplica");
});

test("Design único: decompõe direto em Implement e fecha; nenhum ConflictReview", async () => {
  const dir = setup();
  const { planning, designs: [only] } = planningWithDesigns(dir, FEATURE);
  prepDesign(dir, only);
  nextIssue({ agent: "pi", id: only }, dir);
  decomposeImplement(dir, only); // Design sozinho pode decompor em Implement
  await statusIssue({ id: only, agent: "pi", status: "CLOSED", comment: "feito com evidência", closed_reason: "concluido" }, dir);
  assert.equal(getIssue(only, dir).status, "CLOSED");
  assert.equal(conflictsUnder(dir, planning).length, 0, "Design único não reconcilia");
});

test("Design único ainda exige filha Implement viva para fechar (comportamento inalterado)", async () => {
  const dir = setup();
  const { designs: [only] } = planningWithDesigns(dir, FEATURE);
  prepDesign(dir, only);
  nextIssue({ agent: "pi", id: only }, dir);
  await assert.rejects(
    statusIssue({ id: only, agent: "pi", status: "CLOSED", comment: "feito com evidência", closed_reason: "concluido" }, dir),
    (e: unknown) => e instanceof DomainError && /não fecha sem decompor em Implement/.test(e.message));
});

test("Design abandonado não conta: 1 vivo + 1 abandonado é tratado como Design único", async () => {
  const dir = setup();
  const { planning, designs: [dA, dB] } = planningWithDesigns(dir, FEATURE, LOGOUT);
  await claimClose(dir, dB, "errado"); // abandona o irmão
  // dA agora é único: decompõe direto e fecha, sem reconciliação.
  prepDesign(dir, dA);
  nextIssue({ agent: "pi", id: dA }, dir);
  decomposeImplement(dir, dA);
  await statusIssue({ id: dA, agent: "pi", status: "CLOSED", comment: "feito com evidência", closed_reason: "concluido" }, dir);
  assert.equal(conflictsUnder(dir, planning).length, 0);
});

test("multi-Design não decompõe em Implement (rejeitado)", () => {
  const dir = setup();
  const { designs: [dA] } = planningWithDesigns(dir, FEATURE, LOGOUT);
  assert.throws(() => decomposeImplement(dir, dA),
    (e: unknown) => e instanceof DomainError && /não decompõe em Implement/.test(e.message) && /Designs irmãos/.test(e.message));
});

test("ConflictReview: gate CLOSED exige reconciliation.md e Implement viva; decompõe e fecha", async () => {
  const dir = setup();
  const { planning, designs: [dA, dB] } = planningWithDesigns(dir, FEATURE, LOGOUT);
  prepDesign(dir, dA);
  await claimClose(dir, dA);
  prepDesign(dir, dB);
  await claimClose(dir, dB);
  const cr = conflictsUnder(dir, planning)[0].id;
  nextIssue({ agent: "pi", id: cr }, dir);

  await assert.rejects(
    statusIssue({ id: cr, agent: "pi", status: "CLOSED", comment: "x", closed_reason: "concluido" }, dir),
    /reconciliation\.md/);
  setArtifact({ issueId: cr, name: "reconciliation.md", content: "# plano reconciliado" }, dir);
  await assert.rejects(
    statusIssue({ id: cr, agent: "pi", status: "CLOSED", comment: "x", closed_reason: "concluido" }, dir),
    /Implement viva/);
  const [impl] = decomposeImplement(dir, cr); // ConflictReview -> Implement é permitido
  assert.equal(getIssue(impl, dir).action, "Implement");
  const closed = await statusIssue({ id: cr, agent: "pi", status: "CLOSED", comment: "reconciliado", closed_reason: "concluido" }, dir);
  assert.equal(closed.status, "CLOSED");
});

test("ConflictReview: AWAITING com Implement já criada é recusado (veredito vai primeiro ao humano)", async () => {
  const dir = setup();
  const { planning, designs: [dA, dB] } = planningWithDesigns(dir, FEATURE, LOGOUT);
  prepDesign(dir, dA);
  await claimClose(dir, dA);
  prepDesign(dir, dB);
  await claimClose(dir, dB);
  const cr = conflictsUnder(dir, planning)[0].id;
  nextIssue({ agent: "pi", id: cr }, dir);
  setArtifact({ issueId: cr, name: "reconciliation.md", content: "# plano reconciliado" }, dir);
  new Queue(dir).artifacts.writeText("app", { issueId: cr, type: "document", name: "handoff.md" }, "# handoff");
  decomposeImplement(dir, cr); // filha Implement criada cedo
  await assert.rejects(
    statusIssue({ id: cr, agent: "pi", status: "AWAITING", comment: "pronto para decisão" }, dir),
    (e: unknown) => e instanceof DomainError && /Implement já criada/.test(e.message));
});

test("linhagem: Implement filha do ConflictReview fecha -> Quality Review encadeia sob o ConflictReview", async () => {
  const dir = setup();
  const { planning, designs: [dA, dB] } = planningWithDesigns(dir, FEATURE, LOGOUT);
  prepDesign(dir, dA);
  await claimClose(dir, dA);
  prepDesign(dir, dB);
  await claimClose(dir, dB);
  const cr = conflictsUnder(dir, planning)[0].id;
  nextIssue({ agent: "pi", id: cr }, dir);
  setArtifact({ issueId: cr, name: "reconciliation.md", content: "# plano reconciliado" }, dir);
  const [impl] = decomposeImplement(dir, cr);
  await statusIssue({ id: cr, agent: "pi", status: "CLOSED", comment: "reconciliado", closed_reason: "concluido" }, dir);

  await claimClose(dir, impl); // fatia única: cria a Review direto
  const reviews = listIssues({ project: "app" }, dir).filter((i) => i.action === "Review" && i.relates.includes(cr));
  assert.equal(reviews.length, 1, "resolveParent reconhece ConflictReview como pai da Implement");
});

test("2º ciclo: 2 Designs re-desenhados sob uma Review, fechar o último cria o ConflictReview", async () => {
  const dir = setup();
  const review = createIssue({ title: "rev", project: "app", type: "Feat", action: "Review", problem: "p", actor: "pi" }, dir);
  const dA = createIssue({ title: "redesign A", project: "app", type: "Feat", action: "Design", problem: "p", actor: "pi" }, dir);
  const dB = createIssue({ title: "redesign B", project: "app", type: "Feat", action: "Design", problem: "p", actor: "pi" }, dir);
  relateIssues({ id: dA.id, relates: [review.id], kind: "parent" }, dir);
  relateIssues({ id: dB.id, relates: [review.id], kind: "parent" }, dir);
  prepDesign(dir, dA.id);
  await claimClose(dir, dA.id);
  prepDesign(dir, dB.id);
  await claimClose(dir, dB.id);
  assert.equal(conflictsUnder(dir, review.id).length, 1, "o pai Review no 2º ciclo também dispara a reconciliação");
});

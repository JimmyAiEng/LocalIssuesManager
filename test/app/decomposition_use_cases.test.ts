import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decomposeIssue } from "../../src/app/services/use_cases/decomposition_use_cases.js";
import { createIssue, getIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { composePrompt } from "../../src/app/services/use_cases/prompt_composition.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { setRequirements } from "../../src/app/services/use_cases/requirements_use_cases.js";
import { DomainError } from "../../src/domain/domain_error.js";

const root = () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-decomp-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};
const write = (dir: string, name: string, content: unknown): string => {
  const path = join(dir, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
};

const FEATURE = "Feature: Login\n  Como um usuário\n  Eu quero poder entrar\n  Para que eu acesse\n\n  Scenario: ok\n    Given a tela\n    When entro\n    Then vejo o painel";
const PLAN = { objetivo: "o", passos: ["p"], arquivos: ["a"], criterio_pronto: "c" };

// Planning com duas Features, pronta para decompor em Design.
function planningWithRequirements(dir: string): string {
  const issue = createIssue({ title: "plan", project: "app", type: "Feat", action: "Planning", problem: "p", actor: "human" }, dir);
  setRequirements({ issueId: issue.id, file: write(dir, "req.json", { features: [FEATURE, FEATURE.replace(/Login/g, "Logout")] }) }, dir);
  return issue.id;
}

const designIssue = (dir: string): string =>
  createIssue({ title: "design", project: "app", type: "Feat", action: "Design", problem: "p", actor: "pi" }, dir).id;

const decompose = (dir: string, issueId: string, spec: unknown) =>
  decomposeIssue({ issueId, file: write(dir, `d-${Math.random()}.json`, spec), actor: "pi" }, dir);

test("decompõe Planning em filhas Design com linhagem parent/child recíproca", () => {
  const dir = root();
  const parent = planningWithRequirements(dir);
  const result = decompose(dir, parent, { children: [
    { title: "Design Login", type: "Feat", action: "Design", problem: "p" },
    { title: "Design Logout", type: "Feat", action: "Design", problem: "p" }] });
  assert.equal(result.mode, "concurrent");
  assert.equal(result.children.length, 2);
  const child = getIssue(result.children[0], dir);
  assert.deepEqual(child.relates, [{ id: parent, kind: "parent" }]); // filha aponta o pai
  assert.equal(child.action, "Design");
  assert.deepEqual(child.features, [FEATURE]); // a Feature casada pelo nome no título
  assert.match(composePrompt(child), /## Feature desta Issue Design/);
  const parentView = getIssue(parent, dir);
  assert.deepEqual(parentView.relates.map((r) => r.kind), ["child", "child"]); // recíproca no pai
});

test("decompose recusa filha Design cujo título não casa nenhuma Feature", () => {
  const dir = root();
  const parent = planningWithRequirements(dir);
  assert.throws(() => decompose(dir, parent, { children: [
    { title: "Design de Cadastro", type: "Feat", action: "Design", problem: "p" }] }),
    (e: unknown) => e instanceof DomainError && /não casa nenhuma Feature/.test(e.message) && /Login, Logout/.test(e.message));
});

test("decompõe Design em filhas Implement carregando o Small Plan (persistido e no prompt)", () => {
  const dir = root();
  const parent = designIssue(dir);
  const result = decompose(dir, parent, { children: [
    { title: "Implementar fatia", type: "Feat", action: "Implement", problem: "p", plan: PLAN }] });
  const child = getIssue(result.children[0], dir);
  assert.deepEqual(child.relates, [{ id: parent, kind: "parent" }]);
  assert.deepEqual(child.plan, PLAN); // Small Plan da própria filha persistido
  assert.match(composePrompt(child), /## Small Plan desta Issue[\s\S]*Objetivo: o/);
});

test("mode sequential encadeia as filhas see-also à anterior; concurrent não", () => {
  const dir = root();
  const parent = designIssue(dir);
  const seq = decompose(dir, parent, { mode: "sequential", children: [
    { title: "A", type: "Feat", action: "Implement", problem: "p", plan: PLAN },
    { title: "B", type: "Feat", action: "Implement", problem: "p", plan: PLAN }] });
  assert.equal(seq.mode, "sequential");
  const second = getIssue(seq.children[1], dir);
  assert.ok(second.relates.some((r) => r.id === seq.children[0] && r.kind === "see-also")); // B encadeada a A

  const con = decompose(dir, parent, { children: [
    { title: "C", type: "Feat", action: "Implement", problem: "p", plan: PLAN },
    { title: "D", type: "Feat", action: "Implement", problem: "p", plan: PLAN }] });
  const conSecond = getIssue(con.children[1], dir);
  assert.ok(!conSecond.relates.some((r) => r.kind === "see-also")); // concurrent: sem encadeamento
});

test("só Planning (→Design) e Design (→Implement) decompõem", () => {
  const dir = root();
  const qa = createIssue({ title: "qa", project: "app", type: "Feat", action: "QA", problem: "p", actor: "pi" }, dir);
  assert.throws(() => decompose(dir, qa.id, { children: [{ title: "x", type: "Feat", action: "Implement", problem: "p", plan: PLAN }] }),
    (e: unknown) => e instanceof DomainError && /não decompõe/.test(e.message));
});

test("Planning exige Requirements; filha de Planning exige action=Design", () => {
  const dir = root();
  const semRequisitos = createIssue({ title: "p", project: "app", type: "Feat", action: "Planning", problem: "p", actor: "human" }, dir);
  assert.throws(() => decompose(dir, semRequisitos.id, { children: [{ title: "Design Login", type: "Feat", action: "Design", problem: "p", features: ["Login"] }] }),
    (e: unknown) => e instanceof DomainError && /exige Requirements/.test(e.message));
  const parent = planningWithRequirements(dir);
  assert.throws(() => decompose(dir, parent, { children: [{ title: "Design Login", type: "Feat", action: "Implement", problem: "p" }] }),
    (e: unknown) => e instanceof DomainError && /deve ter action=Design/.test(e.message));
});

test("filha Implement exige Small Plan válido; action errada é rejeitada", () => {
  const dir = root();
  const parent = designIssue(dir);
  assert.throws(() => decompose(dir, parent, { children: [{ title: "x", type: "Feat", action: "Design", problem: "p" }] }),
    (e: unknown) => e instanceof DomainError && /deve ter action=Implement/.test(e.message));
  assert.throws(() => decompose(dir, parent, { children: [{ title: "x", type: "Feat", action: "Implement", problem: "p" }] }),
    (e: unknown) => e instanceof DomainError && /exige o Small Plan/.test(e.message));
  assert.throws(() => decompose(dir, parent, { children: [{ title: "x", type: "Feat", action: "Implement", problem: "p", plan: { objetivo: "o" } }] }),
    (e: unknown) => e instanceof DomainError && /passos/.test(e.message));
});

test("arquivo de decomposição inválido: JSON, forma e campos obrigatórios", () => {
  const dir = root();
  const parent = designIssue(dir);
  assert.throws(() => decompose(dir, parent, "{quebrado"), /JSON válido/);
  assert.throws(() => decompose(dir, parent, [1, 2]), /objeto JSON com children/);
  assert.throws(() => decompose(dir, parent, { mode: "paralelo", children: [] }), /mode deve ser/);
  assert.throws(() => decompose(dir, parent, { children: [] }), /ao menos uma filha/);
  assert.throws(() => decompose(dir, parent, { children: [{ type: "Feat", action: "Implement", problem: "p", plan: PLAN }] }),
    /children\[0\]\.title é obrigatório/);
});

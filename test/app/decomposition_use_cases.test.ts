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
import { RequirementArtifact } from "../../src/domain/artifacts/requirement_artifact.js";
import { DomainError } from "../../src/domain/domain_error.js";
import { Queue } from "../../src/domain/queue_repository.js";

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

// Requisitos em JSONL: uma Feature estruturada por linha.
const FEATURE = { feature: "Login", como: "um usuário", quero: "entrar", para: "acessar o painel",
  scenarios: [{ nome: "ok", steps: ["Given a tela", "When entro", "Then vejo o painel"] }] };
const LOGOUT = { ...FEATURE, feature: "Logout" };
const jsonl = (...features: object[]): string => features.map((feature) => JSON.stringify(feature)).join("\n");
const PLAN = { objetivo: "o", passos: ["p"], arquivos: ["a"], criterio_pronto: "c" };

// Planning com duas Features, pronta para decompor em Design.
function planningWithRequirements(dir: string): string {
  const issue = createIssue({ title: "plan", project: "app", type: "Feat", action: "Planning", problem: "p", actor: "human" }, dir);
  setRequirements({ issueId: issue.id, file: write(dir, "req.jsonl", jsonl(FEATURE, LOGOUT)) }, dir);
  return issue.id;
}

const designIssue = (dir: string): string =>
  createIssue({ title: "design", project: "app", type: "Feat", action: "Design", problem: "p", actor: "pi" }, dir).id;

const decompose = (dir: string, issueId: string, spec: unknown) =>
  decomposeIssue({ issueId, file: write(dir, `d-${Math.random()}.json`, spec), actor: "pi" }, dir);

test("decompõe Planning em filhas Design com linhagem parent/child recíproca e Features declaradas", () => {
  const dir = root();
  const parent = planningWithRequirements(dir);
  const result = decompose(dir, parent, { children: [
    { title: "Design A", type: "Feat", action: "Design", problem: "p", features: ["Login"] },
    { title: "Design B", type: "Feat", action: "Design", problem: "p", features: ["Logout"] }] });
  assert.equal(result.mode, "concurrent");
  assert.equal(result.children.length, 2);
  const child = getIssue(result.children[0], dir);
  assert.deepEqual(child.relates, [{ id: parent, kind: "parent" }]); // filha aponta o pai
  assert.equal(child.action, "Design");
  assert.deepEqual(child.features, [FEATURE]); // a Feature declarada, inteira; título livre
  // O recorte gravado na filha é JSONL — mesmo formato do pai, lido pelo mesmo parser.
  assert.equal(new Queue(dir).readRequirements("app", result.children[0]),
    RequirementArtifact.toJsonl({ features: [FEATURE] }));
  const parentView = getIssue(parent, dir);
  assert.deepEqual(parentView.relates.map((r) => r.kind), ["child", "child"]); // recíproca no pai
});

test("agrupamento N:1: uma filha Design cobre duas Features e recebe as duas no prompt", () => {
  const dir = root();
  const parent = planningWithRequirements(dir);
  const [only] = decompose(dir, parent, { children: [
    { title: "Design do domínio de sessão", type: "Feat", action: "Design", problem: "p",
      features: ["Login", "Logout"] }] }).children;
  const child = getIssue(only, dir);
  assert.equal(child.features?.length, 2);
  const prompt = composePrompt(child);
  assert.match(prompt, /## Features desta Issue/);
  // O artefato é JSONL, mas quem lê o prompt é um agente: chega renderizado em Gherkin.
  assert.match(prompt, /Feature: Login\nComo um usuário\nEu quero poder entrar\nPara que eu possa acessar o painel/);
  assert.match(prompt, /Feature: Logout/);
});

test("decompose recusa Feature inexistente, features ausente/vazio e Feature já coberta", () => {
  const dir = root();
  const parent = planningWithRequirements(dir);
  assert.throws(() => decompose(dir, parent, { children: [
    { title: "x", type: "Feat", action: "Design", problem: "p", features: ["Cadastro"] }] }),
    (e: unknown) => e instanceof DomainError && /não existe nos requisitos/.test(e.message) && /disponíveis: Login, Logout/.test(e.message));
  for (const features of [undefined, [], [" "], ["Login", 1]]) {
    assert.throws(() => decompose(dir, parent, { children: [
      { title: "x", type: "Feat", action: "Design", problem: "p", features }] }), /exige "features"/);
  }
  assert.throws(() => decompose(dir, parent, { children: [
    { title: "a", type: "Feat", action: "Design", problem: "p", features: ["Login"] },
    { title: "b", type: "Feat", action: "Design", problem: "p", features: ["Login"] }] }), /já coberta por outra filha Design/);
});

test("decompose em duas chamadas: a segunda recusa Feature já coberta pela primeira", () => {
  const dir = root();
  const parent = planningWithRequirements(dir);
  decompose(dir, parent, { children: [{ title: "a", type: "Feat", action: "Design", problem: "p", features: ["Login"] }] });
  assert.throws(() => decompose(dir, parent, { children: [
    { title: "b", type: "Feat", action: "Design", problem: "p", features: ["Login"] }] }), /já coberta por outra filha Design/);
  const second = decompose(dir, parent, { children: [
    { title: "b", type: "Feat", action: "Design", problem: "p", features: ["Logout"] }] });
  assert.equal(second.children.length, 1); // a Feature restante ainda decompõe
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

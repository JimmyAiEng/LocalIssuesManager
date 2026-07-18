import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decomposeIssue } from "../../src/app/decomposition_use_cases.js";
import { createIssue, nextIssue, statusIssue } from "../../src/app/issue_use_cases.js";
import { createProject } from "../../src/app/project_use_cases.js";
import { getPrd, getRequirements, setPrd, setRequirements } from "../../src/app/requirements_use_cases.js";
import { DomainError, NotFoundError } from "../../src/domain/domain_error.js";

const body = { project: "app", type: "Feat" as const, action: "Planning", problem: "p", actor: "human" as const };
const root = () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-req-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};

const FEATURE = "Feature: Login\n  Como um usuário\n  Eu quero poder entrar\n  Para que eu acesse\n\n  Scenario: ok\n    Given a tela\n    When entro\n    Then vejo o painel";
const VALID = JSON.stringify({ features: [FEATURE] });
const INVALID = JSON.stringify({ features: ["Feature: Login\n  Scenario: sem user story\n    Given a"] });
const VALID_PRD = JSON.stringify({
  visao: "Acesso", requisitos_funcionais: ["Entrar"], requisitos_nao_funcionais: ["Rápido"],
  clusters: [{ name: "Login", features: ["Login"] }],
});

const reqFile = (dir: string, content: string): string => {
  const path = join(dir, "req.json");
  writeFileSync(path, content, "utf8");
  return path;
};

const prdFile = (dir: string, content: string): string => {
  const path = join(dir, "prd.json");
  writeFileSync(path, content, "utf8");
  return path;
};

// Semeia requisitos + PRD válidos numa Issue Planning (o gate exige os dois).
const seedPlanning = (dir: string, issueId: string): void => {
  setRequirements({ issueId, file: reqFile(dir, VALID) }, dir);
  setPrd({ issueId, file: prdFile(dir, VALID_PRD) }, dir);
};

// Decompõe a Planning numa filha Design por cluster (a trava do gate exige uma por cluster).
const decomposeInto = (dir: string, issueId: string, clusters: string[]): void => {
  const path = join(dir, `decomp-${issueId}.json`);
  writeFileSync(path, JSON.stringify({ children: clusters.map((name) => (
    { title: `Design ${name}`, type: "Feat", action: "Design", problem: "desenhar" })) }));
  decomposeIssue({ issueId, file: path, actor: "human" }, dir);
};

// Issue action=Planning CLAIMED por pi, pronta para concluir.
const planningClaimed = (dir: string): string => {
  const issue = createIssue({ ...body, title: "t" }, dir);
  nextIssue({ agent: "pi", id: issue.id }, dir);
  return issue.id;
};

test("setRequirements persiste JSON Gherkin válido e getRequirements devolve", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  const saved = setRequirements({ issueId: issue.id, file: reqFile(dir, VALID) }, dir);
  assert.equal(saved.features.length, 1);
  assert.deepEqual(getRequirements({ issueId: issue.id }, dir), saved);
});

test("setRequirements rejeita JSON inválido e nada é persistido", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  assert.throws(() => setRequirements({ issueId: issue.id, file: reqFile(dir, INVALID) }, dir),
    (e: unknown) => e instanceof DomainError);
  assert.throws(() => getRequirements({ issueId: issue.id }, dir),
    (e: unknown) => e instanceof NotFoundError);
});

test("setRequirements só aceita Issue action=Planning", () => {
  const dir = root();
  const qa = createIssue({ ...body, action: "QA", title: "qa" }, dir);
  assert.throws(() => setRequirements({ issueId: qa.id, file: reqFile(dir, VALID) }, dir),
    /não é de Planning/);
});

test("setRequirements limita a 5 Features com orientação de decomposição", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  const six = JSON.stringify({ features: Array(6).fill(FEATURE) });
  assert.throws(() => setRequirements({ issueId: issue.id, file: reqFile(dir, six) }, dir),
    /6 Features \(limite 5\).*Issues menores relacionadas/);
});

test("getRequirements erro claro quando inexistente", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  assert.throws(() => getRequirements({ issueId: issue.id }, dir),
    (e: unknown) => e instanceof NotFoundError && /não encontrado/.test(e.message));
});

test("gate: Issue Planning não conclui sem requisitos válidos", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  await assert.rejects(
    statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir),
    (e: unknown) => e instanceof NotFoundError && /sem requisitos/.test(e.message),
  );
});

test("gate: Issue Planning conclui com requisitos, PRD e uma filha Design por cluster", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  seedPlanning(dir, issueId);
  decomposeInto(dir, issueId, ["Login"]);
  const issue = await statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir);
  assert.equal(issue.status, "AWAITING");
});

// Requisitos com 3 Features / PRD com 3 clusters: a trava de decomposição do gate.
const REQ_3 = JSON.stringify({ features: [FEATURE, FEATURE.replace(/Login/g, "Logout"), FEATURE.replace(/Login/g, "Cadastro")] });
const PRD_3 = JSON.stringify({
  visao: "Acesso", requisitos_funcionais: ["Entrar"], requisitos_nao_funcionais: ["Rápido"],
  clusters: [{ name: "Login", features: ["Login"] }, { name: "Logout", features: ["Logout"] }, { name: "Cadastro", features: ["Cadastro"] }],
});

test("gate: Planning com 3 clusters e só 2 filhas Design não fecha, apontando o cluster descoberto", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: reqFile(dir, REQ_3) }, dir);
  setPrd({ issueId, file: prdFile(dir, PRD_3) }, dir);
  decomposeInto(dir, issueId, ["Login", "Logout"]); // falta Cadastro
  await assert.rejects(
    statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir),
    (e: unknown) => e instanceof DomainError && /cluster "Cadastro"/.test(e.message),
  );
  decomposeInto(dir, issueId, ["Cadastro"]); // cria a terceira → fecha
  const issue = await statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir);
  assert.equal(issue.status, "AWAITING");
});

test("setPrd persiste PRD válido (cross-validado com os requisitos) e getPrd devolve", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  setRequirements({ issueId: issue.id, file: reqFile(dir, VALID) }, dir);
  const saved = setPrd({ issueId: issue.id, file: prdFile(dir, VALID_PRD) }, dir);
  assert.equal(saved.clusters.length, 1);
  assert.deepEqual(getPrd({ issueId: issue.id }, dir), saved);
});

test("setPrd exige requisitos persistidos antes (clusters agrupam Features)", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  assert.throws(() => setPrd({ issueId: issue.id, file: prdFile(dir, VALID_PRD) }, dir),
    (e: unknown) => e instanceof DomainError && /exige requisitos/.test(e.message));
});

test("setPrd rejeita PRD com Feature fora de cluster e nada persiste", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  const two = JSON.stringify({ features: [FEATURE, FEATURE.replace("Login", "Logout")] });
  setRequirements({ issueId: issue.id, file: reqFile(dir, two) }, dir);
  assert.throws(() => setPrd({ issueId: issue.id, file: prdFile(dir, VALID_PRD) }, dir),
    (e: unknown) => e instanceof DomainError && /"Logout" não pertence a nenhum cluster/.test(e.message));
  assert.throws(() => getPrd({ issueId: issue.id }, dir), (e: unknown) => e instanceof NotFoundError);
});

test("gate: Issue Planning com requisitos mas sem PRD não conclui", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: reqFile(dir, VALID) }, dir);
  await assert.rejects(
    statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir),
    (e: unknown) => e instanceof NotFoundError && /sem PRD/.test(e.message),
  );
});

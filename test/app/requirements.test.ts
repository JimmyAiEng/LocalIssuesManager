import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decomposeIssue } from "../../src/app/services/use_cases/decomposition_use_cases.js";
import { createIssue, nextIssue, relateIssues, statusIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { getRequirements, setRequirements } from "../../src/app/services/use_cases/requirements_use_cases.js";
import { DomainError, NotFoundError } from "../../src/domain/domain_error.js";
import { Queue } from "../../src/domain/queue_repository.js";

const body = { project: "app", type: "Feat" as const, action: "Planning", problem: "p", actor: "human" as const };
const FEATURE = "Feature: Login\n  Como um usuário\n  Eu quero poder entrar\n  Para que eu acesse\n\n  Scenario: ok\n    Given a tela\n    When entro\n    Then vejo o painel";
const VALID = JSON.stringify({ features: [FEATURE] });
const THREE = JSON.stringify({ features: [FEATURE, FEATURE.replace(/Login/g, "Logout"), FEATURE.replace(/Login/g, "Cadastro")] });
const INVALID = JSON.stringify({ features: ["Feature: Login\n  Scenario: sem user story\n    Given a"] });

const root = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "issues-req-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};
const file = (dir: string, content: string): string => {
  const path = join(dir, "requirements.json");
  writeFileSync(path, content, "utf8");
  return path;
};
const planningClaimed = (dir: string): string => {
  const issue = createIssue({ ...body, title: "t" }, dir);
  nextIssue({ agent: "pi", id: issue.id }, dir);
  return issue.id;
};
// Uma filha Design por Feature: o casamento é pelo nome da Feature contido no título da filha.
// Um grupo de Features por filha Design: o título é livre, quem casa é o campo `features`.
const decomposeInto = (dir: string, issueId: string, groups: string[][]): void => {
  const path = join(dir, `decomp-${issueId}.json`);
  const children = groups.map((features, index) =>
    ({ title: `Design grupo ${index + 1}`, type: "Feat", action: "Design", problem: "desenhar", features }));
  writeFileSync(path, JSON.stringify({ children }));
  decomposeIssue({ issueId, file: path, actor: "human" }, dir);
};

test("set/get Requirements persiste conjunto Gherkin válido", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  const saved = setRequirements({ issueId: issue.id, file: file(dir, VALID) }, dir);
  assert.deepEqual(getRequirements({ issueId: issue.id }, dir), saved);
});

test("RequirementArtifact rejeita conteúdo inválido e action incorreta", () => {
  const dir = root();
  const planning = createIssue({ ...body, title: "t" }, dir);
  assert.throws(() => setRequirements({ issueId: planning.id, file: file(dir, INVALID) }, dir), DomainError);
  assert.throws(() => getRequirements({ issueId: planning.id }, dir), NotFoundError);
  const qa = createIssue({ ...body, action: "QA", title: "qa" }, dir);
  assert.throws(() => setRequirements({ issueId: qa.id, file: file(dir, VALID) }, dir), /não é de Planning/);
});

test("RequirementArtifact limita os Requirements a 5 Features", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  assert.throws(() => setRequirements({ issueId: issue.id,
    file: file(dir, JSON.stringify({ features: Array(6).fill(FEATURE) })) }, dir), /limite 5/);
});

test("gate Planning exige RequirementArtifact e as filhas Design cobrindo as Features", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  await assert.rejects(statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir), /sem requisitos/);
  setRequirements({ issueId, file: file(dir, VALID) }, dir);
  decomposeInto(dir, issueId, [["Login"]]);
  const issue = await statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir);
  assert.equal(issue.status, "AWAITING");
});

test("gate Planning fecha com agrupamento N:1 (uma filha Design cobrindo três Features)", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: file(dir, THREE) }, dir);
  decomposeInto(dir, issueId, [["Login", "Logout", "Cadastro"]]);
  const issue = await statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir);
  assert.equal(issue.status, "AWAITING");
});

test("gate Planning aponta a primeira Feature ainda não coberta por filha Design", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: file(dir, THREE) }, dir);
  decomposeInto(dir, issueId, [["Login", "Logout"]]);
  await assert.rejects(statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir), /não fecha sem decompor a Feature "Cadastro"/);
});

// Sobreposição só nasce por escrita direta do artefato (o decompose barra antes); o gate é a
// última linha de defesa: duas filhas desenhando o mesmo conceito produzem specs conflitantes.
test("gate Planning barra Feature coberta por duas filhas Design, nomeando-as", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: file(dir, VALID) }, dir);
  decomposeInto(dir, issueId, [["Login"]]);
  const intrusa = createIssue({ ...body, action: "Design", title: "Design duplicado" }, dir);
  relateIssues({ id: issueId, relates: [intrusa.id], kind: "child" }, dir);
  new Queue(dir).writeRequirements("app", intrusa.id, VALID);
  await assert.rejects(statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir),
    (e: unknown) => e instanceof DomainError && /coberta por mais de uma filha Design/.test(e.message) && e.message.includes("Design duplicado"));
});

// Filha Design criada fora do decompose não tem o recorte de Requirements: não cobre nada.
test("gate Planning ignora filha Design sem Requirements e manda decompor", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: file(dir, VALID) }, dir);
  const avulsa = createIssue({ ...body, action: "Design", title: "Design Login" }, dir);
  relateIssues({ id: issueId, relates: [avulsa.id], kind: "child" }, dir);
  await assert.rejects(statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir), /issues decompose/);
});

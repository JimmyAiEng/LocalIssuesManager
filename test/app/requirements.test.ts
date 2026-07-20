import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decomposeIssue } from "../../src/app/services/use_cases/decomposition_use_cases.js";
import { createIssue, nextIssue, relateIssues, statusIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { getRequirements, setRequirements } from "../../src/app/services/use_cases/requirements_use_cases.js";
import { RequirementArtifact } from "../../src/domain/artifacts/requirement_artifact.js";
import { DomainError, NotFoundError } from "../../src/domain/domain_error.js";
import { Queue } from "../../src/domain/queue_repository.js";

const body = { project: "app", type: "Feat" as const, action: "Planning", problem: "p", actor: "human" as const };
// Requisitos em JSONL: uma Feature estruturada por linha.
const FEATURE = { feature: "Login", como: "usuário", quero: "entrar", para: "acesse o painel",
  scenarios: [{ nome: "ok", steps: ["Given a tela", "When entro", "Then vejo o painel"] }] };
const named = (name: string) => ({ ...FEATURE, feature: name });
const jsonl = (...features: object[]): string => features.map((feature) => JSON.stringify(feature)).join("\n");
const VALID = jsonl(FEATURE);
const THREE = jsonl(FEATURE, named("Logout"), named("Cadastro"));
const INVALID = jsonl({ ...FEATURE, scenarios: [] });

const root = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "issues-req-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};
const file = (dir: string, content: string): string => {
  const path = join(dir, "requirements.jsonl");
  writeFileSync(path, content, "utf8");
  return path;
};
const planningClaimed = (dir: string): string => {
  const issue = createIssue({ ...body, title: "t" }, dir);
  nextIssue({ agent: "pi", id: issue.id }, dir);
  return issue.id;
};
// Handoff obrigatório ao enviar para AWAITING não-abandono.
const seedHandoff = (dir: string, id: string): void =>
  new Queue(dir).artifacts.writeText("app", { issueId: id, type: "document", name: "handoff.md" }, "# handoff");
// A partição em filhas Design é gate do CLOSED (AFK): é a saída onde a sequência viva é cobrada.
const closeConcluido = (dir: string, issueId: string) =>
  statusIssue({ id: issueId, agent: "pi", status: "CLOSED", comment: "fim", closed_reason: "concluido" }, dir);
// Uma filha Design por Feature: o casamento é pelo nome da Feature contido no título da filha.
// Um grupo de Features por filha Design: o título é livre, quem casa é o campo `features`.
const decomposeInto = (dir: string, issueId: string, groups: string[][]): void => {
  const path = join(dir, `decomp-${issueId}.json`);
  const children = groups.map((features, index) =>
    ({ title: `Design grupo ${index + 1}`, type: "Feat", action: "Design", problem: "desenhar", features }));
  writeFileSync(path, JSON.stringify({ children }));
  decomposeIssue({ issueId, file: path, actor: "human" }, dir);
};

test("set/get Requirements persiste o conjunto como JSONL em requirements/<id>.jsonl", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  const saved = setRequirements({ issueId: issue.id, file: file(dir, THREE) }, dir);
  assert.deepEqual(getRequirements({ issueId: issue.id }, dir), saved);
  // O que fica em disco é o serializador único: uma Feature por linha, relido pelo mesmo parser.
  assert.equal(new Queue(dir).readRequirements("app", issue.id), RequirementArtifact.toJsonl(saved));
  assert.ok(existsSync(join(dir, "projects", "app", "requirements", `${issue.id}.jsonl`)));
});

test("RequirementArtifact rejeita conteúdo inválido e action incorreta", () => {
  const dir = root();
  const planning = createIssue({ ...body, title: "t" }, dir);
  assert.throws(() => setRequirements({ issueId: planning.id, file: file(dir, INVALID) }, dir), DomainError);
  assert.throws(() => getRequirements({ issueId: planning.id }, dir), NotFoundError);
  const qa = createIssue({ ...body, action: "Review", title: "qa" }, dir);
  assert.throws(() => setRequirements({ issueId: qa.id, file: file(dir, VALID) }, dir), /não é de Planning/);
});

test("RequirementArtifact limita os Requirements a 5 Features", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "t" }, dir);
  assert.throws(() => setRequirements({ issueId: issue.id,
    file: file(dir, jsonl(...Array.from({ length: 6 }, (_, i) => named(`F${i}`)))) }, dir), /limite 5/);
});

// Requisitos são cobrados nas duas saídas (o humano precisa deles para julgar); a partição em
// filhas Design é cobrada só no CLOSED — no AWAITING a Issue nem pode ter filhas.
test("gate Planning exige RequirementArtifact e as filhas Design cobrindo as Features", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  await assert.rejects(statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir), /sem requisitos/);
  setRequirements({ issueId, file: file(dir, VALID) }, dir);
  decomposeInto(dir, issueId, [["Login"]]);
  const issue = await closeConcluido(dir, issueId);
  assert.equal(issue.status, "CLOSED");
});

test("gate Planning fecha com agrupamento N:1 (uma filha Design cobrindo três Features)", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: file(dir, THREE) }, dir);
  decomposeInto(dir, issueId, [["Login", "Logout", "Cadastro"]]);
  const issue = await closeConcluido(dir, issueId);
  assert.equal(issue.status, "CLOSED");
});

// A entrega sem filha nenhuma vai para AWAITING (é a ordem nova); a filha só nasce depois.
test("gate Planning manda para AWAITING sem filha e recusa AWAITING com filha", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: file(dir, VALID) }, dir);
  seedHandoff(dir, issueId);
  const issue = await statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir);
  assert.equal(issue.status, "AWAITING");

  const outro = planningClaimed(dir);
  setRequirements({ issueId: outro, file: file(dir, VALID) }, dir);
  decomposeInto(dir, outro, [["Login"]]);
  seedHandoff(dir, outro);
  await assert.rejects(statusIssue({ id: outro, agent: "pi", status: "AWAITING", comment: "fim" }, dir),
    /não vai para AWAITING com filha.*decomposição vem DEPOIS da aprovação/s);
});

test("gate Planning aponta a primeira Feature ainda não coberta por filha Design", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: file(dir, THREE) }, dir);
  decomposeInto(dir, issueId, [["Login", "Logout"]]);
  await assert.rejects(closeConcluido(dir, issueId), /não fecha sem decompor a Feature "Cadastro"/);
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
  await assert.rejects(closeConcluido(dir, issueId),
    (e: unknown) => e instanceof DomainError && /coberta por mais de uma filha Design/.test(e.message) && e.message.includes("Design duplicado"));
});

// Filha Design criada fora do decompose não tem o recorte de Requirements: não cobre nada.
test("gate Planning ignora filha Design sem Requirements e manda decompor", async () => {
  const dir = root();
  const issueId = planningClaimed(dir);
  setRequirements({ issueId, file: file(dir, VALID) }, dir);
  const avulsa = createIssue({ ...body, action: "Design", title: "Design Login" }, dir);
  relateIssues({ id: issueId, relates: [avulsa.id], kind: "child" }, dir);
  await assert.rejects(closeConcluido(dir, issueId), /issues decompose/);
});

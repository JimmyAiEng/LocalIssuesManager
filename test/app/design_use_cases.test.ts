import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addDesignDiagram, getDesignPackage, setArchitectureChanged, setDesignDoc } from "../../src/app/services/use_cases/design_use_cases.js";
import { decomposeIssue } from "../../src/app/services/use_cases/decomposition_use_cases.js";
import { createIssue, decideIssue, getIssue, nextIssue, statusIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { setPlan } from "../../src/app/services/use_cases/plan_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { DesignGateError } from "../../src/domain/gates/design_gate.js";
import { Queue } from "../../src/domain/queue_repository.js";

const VALID_CLASS = "@startuml\nclass A\n@enduml";
const VALID_STATE = "@startuml\n[*] --> Ativo\n@enduml";
const VALID_COMPONENT = '@startuml\n[Comp]\n@enduml';
const VALID_PACKAGE = '@startuml\npackage "P" {\n  [A]\n}\n@enduml';
const INVALID = "@startuml\nthis is !! broken\n@enduml";
const PLAN = JSON.stringify({ objetivo: "o", passos: ["p"], arquivos: ["a"], criterio_pronto: "c" });

const root = () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-design-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};
const file = (dir: string, name: string, content: string) => {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
};

// Handoff obrigatório ao enviar para AWAITING não-abandono.
const seedHandoff = (dir: string, id: string): void =>
  new Queue(dir).artifacts.writeText("app", { issueId: id, type: "document", name: "handoff.md" }, "# handoff");

// Issue action=Design pronta para receber o pacote (o gate roda na conclusão pela IA).
function designIssue(dir: string): string {
  const issue = createIssue({ title: "t", project: "app", type: "Feat", action: "Design",
    problem: "p", actor: "pi" }, dir);
  return issue.id;
}

// Decompõe a Design numa filha Implement com Small Plan (a trava do gate de Design a exige).
function seedImplementChild(dir: string, designId: string): void {
  const into = file(dir, "decomp.json", JSON.stringify({ children: [
    { title: "Implementar fatia", type: "Feat", action: "Implement", problem: "p",
      plan: { objetivo: "o", passos: ["p"], arquivos: ["a"], criterio_pronto: "c" } }] }));
  decomposeIssue({ issueId: designId, file: into, actor: "pi" }, dir);
}

// Cobre os 4 níveis de arquitetura com PlantUML válido (high_level, package, class, interface/data).
async function coverFourLevels(dir: string, issueId: string): Promise<void> {
  await addDesignDiagram({ issueId, kind: "component", file: file(dir, "comp.puml", VALID_COMPONENT) }, dir);
  await addDesignDiagram({ issueId, kind: "package", file: file(dir, "pkg.puml", VALID_PACKAGE) }, dir);
  await addDesignDiagram({ issueId, kind: "class", file: file(dir, "cls.puml", VALID_CLASS) }, dir);
  await addDesignDiagram({ issueId, kind: "state", file: file(dir, "st.puml", VALID_STATE) }, dir);
}

// Pacote completo com mudança de arquitetura: doc + 4 níveis + plano + architecture_changed=true.
async function completeChangedDesign(dir: string, issueId: string): Promise<void> {
  setDesignDoc({ issueId, file: file(dir, "d.md", "# Design") }, dir);
  await coverFourLevels(dir, issueId);
  setPlan({ issueId, file: file(dir, "plan.json", PLAN) }, dir);
  setArchitectureChanged({ issueId, value: true }, dir);
}

test("setDesignDoc grava design/<issueId>/design.md", () => {
  const dir = root();
  const issueId = designIssue(dir);
  setDesignDoc({ issueId, file: file(dir, "d.md", "# Design") }, dir);
  assert.equal(new Queue(dir).artifacts.readText("app", { issueId, type: "document", name: "design.md" }), "# Design");
});

test("setDesignDoc rejeita Issue inexistente, non-Design e CLOSED", async () => {
  const dir = root();
  const doc = file(dir, "d.md", "# Design");
  assert.throws(() => setDesignDoc({ issueId: "nope", file: doc }, dir), /Issue not found/);

  const qa = createIssue({ title: "qa", project: "app", type: "Feat", action: "Review", problem: "p", actor: "pi" }, dir);
  assert.throws(() => setDesignDoc({ issueId: qa.id, file: doc }, dir), /não é de Design/);

  const closedId = designIssue(dir);
  await statusIssue({ id: closedId, human: true, status: "CLOSED", comment: "x", closed_reason: "obsoleto" }, dir);
  assert.throws(() => setDesignDoc({ issueId: closedId, file: doc }, dir), /CLOSED/);
});

test("setDesignDoc com doc vazio lança empty_doc e nada é gravado; doc grande é rejeitado", () => {
  const dir = root();
  const issueId = designIssue(dir);
  const empty = file(dir, "vazio.md", "  \n\t\n");
  assert.throws(() => setDesignDoc({ issueId, file: empty }, dir),
    (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "empty_doc");
  const big = file(dir, "grande.md", Array(301).fill("x").join(" "));
  assert.throws(() => setDesignDoc({ issueId, file: big }, dir), /limite 300/);
  assert.equal(new Queue(dir).artifacts.readText("app", { issueId, type: "document", name: "design.md" }), null);
});

test("addDesignDiagram com PlantUML inválido reporta line/message e nada é gravado", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  await assert.rejects(
    addDesignDiagram({ issueId, kind: "class", file: file(dir, "bad.puml", INVALID) }, dir),
    (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "plantuml_invalid"
      && error.errors[0].line === 2 && error.errors[0].path === "class.puml");
  assert.equal(new Queue(dir).artifacts.readText("app", { issueId, type: "uml", name: "class.puml" }), null);
});

test("addDesignDiagram com kind incompatível lança kind_mismatch citando kind e diagramType", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  await assert.rejects(
    addDesignDiagram({ issueId, kind: "state", file: file(dir, "c.puml", VALID_CLASS) }, dir),
    (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "kind_mismatch"
      && /state/.test(error.errors[0].message) && /ClassDiagram/.test(error.errors[0].message));
  assert.equal(new Queue(dir).artifacts.readText("app", { issueId, type: "uml", name: "state.puml" }), null);
});

test("addDesignDiagram com kind inválido lança invalid_kind", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  await assert.rejects(
    addDesignDiagram({ issueId, kind: "sequence", file: file(dir, "c.puml", VALID_CLASS) }, dir),
    (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "invalid_kind");
});

test("addDesignDiagram grava <kind>.puml e regravar substitui", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  await addDesignDiagram({ issueId, kind: "class", file: file(dir, "a.puml", VALID_CLASS) }, dir);
  assert.equal(new Queue(dir).artifacts.readText("app", { issueId, type: "uml", name: "class.puml" }), VALID_CLASS);
  const updated = "@startuml\nclass B\n@enduml";
  await addDesignDiagram({ issueId, kind: "class", file: file(dir, "b.puml", updated) }, dir);
  assert.equal(new Queue(dir).artifacts.readText("app", { issueId, type: "uml", name: "class.puml" }), updated);
});

test("getDesignPackage com mudança de arquitetura e 4 níveis devolve ready true", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  await completeChangedDesign(dir, issueId);
  const pack = await getDesignPackage({ issueId }, dir);
  assert.equal(pack.issueId, issueId);
  assert.equal(pack.design_md, "# Design");
  assert.equal(pack.architecture_changed, true);
  assert.equal(pack.diagrams.class, VALID_CLASS);
  assert.equal(pack.diagrams.state, VALID_STATE);
  assert.equal(pack.diagrams.deployment, null);
  assert.deepEqual(pack.validation, { ready: true, errors: [] });
});

test("getDesignPackage sem a decisão de arquitetura exige a escolha explícita", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  setDesignDoc({ issueId, file: file(dir, "d.md", "# Design") }, dir);
  const pack = await getDesignPackage({ issueId }, dir);
  assert.equal(pack.architecture_changed, null);
  assert.deepEqual(pack.validation.errors.map((error) => error.code), ["decision_required"]);
});

test("getDesignPackage com mudança e só 2 níveis lista os níveis faltantes", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  setDesignDoc({ issueId, file: file(dir, "d.md", "# Design") }, dir);
  await addDesignDiagram({ issueId, kind: "class", file: file(dir, "c.puml", VALID_CLASS) }, dir);
  await addDesignDiagram({ issueId, kind: "package", file: file(dir, "pkg.puml", VALID_PACKAGE) }, dir);
  setArchitectureChanged({ issueId, value: true }, dir);
  const pack = await getDesignPackage({ issueId }, dir);
  assert.equal(pack.validation.ready, false);
  const missing = pack.validation.errors.find((error) => error.code === "missing_level");
  assert.match(missing?.message ?? "", /High Level.*Interface\/DataModel/);
});

test("getDesignPackage sem mudança de arquitetura dispensa diagramas (ready true)", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  setArchitectureChanged({ issueId, value: false }, dir);
  const pack = await getDesignPackage({ issueId }, dir);
  assert.equal(pack.architecture_changed, false);
  assert.deepEqual(pack.validation, { ready: true, errors: [] });
});

test("getDesignPackage é somente leitura, funciona com Issue CLOSED e re-checa .puml corrompido", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  await completeChangedDesign(dir, issueId);
  nextIssue({ agent: "pi", id: issueId }, dir);
  seedHandoff(dir, issueId);
  await statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "spec congelada" }, dir);
  decideIssue({ id: issueId, human: true, status: "APPROVED", comment: "aceito" }, dir); // aprova → APPROVED
  nextIssue({ agent: "pi", id: issueId }, dir); // reivindica a aprovada
  seedImplementChild(dir, issueId); // decompõe só depois da aprovação; o CLOSED cobra a filha viva
  await statusIssue({ id: issueId, agent: "pi", status: "CLOSED", comment: "fechado", closed_reason: "concluido" }, dir); // fecha pós-APPROVED
  assert.equal((await getDesignPackage({ issueId }, dir)).validation.ready, true);

  new Queue(dir).artifacts.writeText("app", { issueId, type: "uml", name: "class.puml" }, INVALID); // corrompido fora do use case
  const validation = (await getDesignPackage({ issueId }, dir)).validation;
  assert.equal(validation.ready, false);
  assert.deepEqual(validation.errors.map((error) => error.code), ["plantuml_invalid", "missing_level"]);
});

test("gate: sem a decisão de arquitetura a conclusão falha com decision_required (erro claro)", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  setDesignDoc({ issueId, file: file(dir, "d.md", "# Design") }, dir);
  await coverFourLevels(dir, issueId);
  setPlan({ issueId, file: file(dir, "plan.json", PLAN) }, dir); // pacote pronto, mas sem a decisão de arquitetura
  nextIssue({ agent: "pi", id: issueId }, dir);
  await assert.rejects(
    statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir),
    (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "decision_required");
});

test("gate: com mudança de arquitetura e só 2 níveis a Issue não fecha e lista os faltantes", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  setDesignDoc({ issueId, file: file(dir, "d.md", "# Design") }, dir);
  await addDesignDiagram({ issueId, kind: "class", file: file(dir, "c.puml", VALID_CLASS) }, dir);
  await addDesignDiagram({ issueId, kind: "package", file: file(dir, "pkg.puml", VALID_PACKAGE) }, dir);
  setPlan({ issueId, file: file(dir, "plan.json", PLAN) }, dir);
  setArchitectureChanged({ issueId, value: true }, dir);
  nextIssue({ agent: "pi", id: issueId }, dir);
  await assert.rejects(
    statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir),
    (error: unknown) => error instanceof DesignGateError
      && error.errors.some((each) => each.code === "missing_level" && /High Level/.test(each.message)));
  assert.equal(getIssue(issueId, dir).status, "CLAIMED"); // nada aplicado/salvo
});

test("gate: com mudança e 4 níveis válidos cai em AWAITING e nunca fecha AFK", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  await completeChangedDesign(dir, issueId);
  nextIssue({ agent: "pi", id: issueId }, dir);
  // A trava do aceite humano vem antes do gate de entrega: uma Issue que nunca fecha por agente
  // ouve isso primeiro, em vez de ser mandada decompor — decompor barraria o AWAITING seguinte.
  await assert.rejects(
    statusIssue({ id: issueId, agent: "pi", status: "CLOSED", comment: "fim", closed_reason: "concluido" }, dir),
    /não fecha por agente/);
  seedHandoff(dir, issueId);
  const issue = await statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir);
  assert.equal(issue.status, "AWAITING");
  const decided = decideIssue({ id: issueId, human: true, status: "APPROVED", comment: "aceito" }, dir);
  assert.equal(decided.status, "APPROVED"); // aprovação humana gera APPROVED (não CLOSED)
});

test("gate: sem mudança de arquitetura fecha AFK sem diagramas, desde que o plano exista", async () => {
  const dir = root();
  const issueId = designIssue(dir);
  setArchitectureChanged({ issueId, value: false }, dir);
  nextIssue({ agent: "pi", id: issueId }, dir);
  await assert.rejects( // sem plano, o gate ainda cobra o Implementation Plan
    statusIssue({ id: issueId, agent: "pi", status: "CLOSED", comment: "fim", closed_reason: "concluido" }, dir),
    /plano/);
  setPlan({ issueId, file: file(dir, "plan.json", PLAN) }, dir);
  seedImplementChild(dir, issueId);
  const issue = await statusIssue({ id: issueId, agent: "pi", status: "CLOSED", comment: "fim", closed_reason: "concluido" }, dir);
  assert.equal(issue.status, "CLOSED"); // sem diagramas nem revisão humana
});

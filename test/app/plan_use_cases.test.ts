import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addDesignDiagram, setArchitectureChanged, setDesignDoc } from "../../src/app/services/use_cases/design_use_cases.js";
import { decomposeIssue } from "../../src/app/services/use_cases/decomposition_use_cases.js";
import { createIssue, nextIssue, setArtifact, statusIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { getPlan, setPlan } from "../../src/app/services/use_cases/plan_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { DomainError, NotFoundError } from "../../src/domain/domain_error.js";

const VALID_CLASS = "@startuml\nclass A\n@enduml";
const PLAN = {
  objetivo: "Congelar a spec",
  passos: ["desenhar", "diagramar"],
  arquivos: ["src/x.ts"],
  criterio_pronto: "gate verde",
};

const root = () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-plan-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};
const write = (dir: string, name: string, content: string): string => {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
};
const planFile = (dir: string, plan: unknown = PLAN): string => write(dir, "plan.json", JSON.stringify(plan));

const designIssue = (dir: string): string =>
  createIssue({ title: "d", project: "app", type: "Feat", action: "Design", problem: "p", actor: "pi" }, dir).id;

// Handoff obrigatório ao enviar para AWAITING não-abandono.
const seedHandoff = (dir: string, id: string): void =>
  setArtifact({ issueId: id, content: "# handoff", name: "handoff.md" }, dir);

// Semeia uma filha Implement (a trava de decomposição do gate de Design a exige).
export const seedImplementChild = (dir: string, designId: string): string => {
  const into = write(dir, `decomp-${designId}.json`, JSON.stringify({
    children: [{ title: "Implementar fatia", type: "Feat", action: "Implement", problem: "p", plan: PLAN }],
  }));
  return decomposeIssue({ issueId: designId, file: into, actor: "pi" }, dir).children[0];
};

// Semeia o pacote de Design completo (doc + diagrama + plano) numa Issue CLAIMED.
async function fullDesign(dir: string): Promise<string> {
  const issueId = designIssue(dir);
  nextIssue({ agent: "pi", id: issueId }, dir);
  setDesignDoc({ issueId, file: write(dir, "d.md", "# Design") }, dir);
  await addDesignDiagram({ issueId, kind: "class", file: write(dir, "c.puml", VALID_CLASS) }, dir);
  setArchitectureChanged({ issueId, value: false }, dir); // isola o gate do plano (diagramas dispensados)
  return issueId;
}

test("setPlan persiste plano válido e getPlan devolve", () => {
  const dir = root();
  const issueId = designIssue(dir);
  const saved = setPlan({ issueId, file: planFile(dir) }, dir);
  assert.deepEqual(saved, PLAN);
  assert.deepEqual(getPlan({ issueId }, dir), PLAN);
});

test("setPlan rejeita plano sem passos/critério e nada é persistido", () => {
  const dir = root();
  const issueId = designIssue(dir);
  assert.throws(() => setPlan({ issueId, file: planFile(dir, { objetivo: "x", arquivos: ["a"] }) }, dir),
    (e: unknown) => e instanceof DomainError && /passos/.test(e.message) && /criterio_pronto/.test(e.message));
  assert.throws(() => getPlan({ issueId }, dir), (e: unknown) => e instanceof NotFoundError);
});

test("setPlan só aceita Issue action=Design", () => {
  const dir = root();
  const impl = createIssue({ title: "i", project: "app", type: "Feat", action: "Implement", problem: "p", actor: "pi" }, dir);
  assert.throws(() => setPlan({ issueId: impl.id, file: planFile(dir) }, dir), /não é de Design/);
});

test("gate: Issue Design não conclui sem plano válido, mesmo com doc+diagrama", async () => {
  const dir = root();
  const issueId = await fullDesign(dir);
  await assert.rejects(
    statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir),
    (e: unknown) => e instanceof NotFoundError && /sem plano/.test(e.message),
  );
});

// A filha Implement é gate do CLOSED (ver workflows.test.ts); o AWAITING cobra doc+diagrama+plano
// e recusa Issue já decomposta — a decomposição vem depois da aprovação humana.
test("gate: Issue Design vai a AWAITING com doc+diagrama+plano, sem filha Implement", async () => {
  const dir = root();
  const issueId = await fullDesign(dir);
  setPlan({ issueId, file: planFile(dir) }, dir);
  seedHandoff(dir, issueId);
  const issue = await statusIssue({ id: issueId, agent: "pi", status: "AWAITING", comment: "fim" }, dir);
  assert.equal(issue.status, "AWAITING");
});

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addDesignDiagram, getDesignPackage, setDesignDoc } from "../../src/app/design_use_cases.js";
import { claimIssue, createIssue, decideIssue, getIssue } from "../../src/app/issue_use_cases.js";
import { claimTicket, createTicket, decideTicket, getTicket, statusTicket } from "../../src/app/ticket_use_cases.js";
import { DesignGateError } from "../../src/domain/design_gate.js";
import { Queue } from "../../src/domain/queue_repository.js";

const VALID_CLASS = "@startuml\nclass A\n@enduml";
const VALID_STATE = "@startuml\n[*] --> Ativo\n@enduml";
const INVALID = "@startuml\nthis is !! broken\n@enduml";

const root = () => mkdtempSync(join(tmpdir(), "issues-design-"));
const file = (dir: string, name: string, content: string) => {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
};

// Issue CLAIMED e classificada (o guard de criação de Ticket exige risk+complexity) com um
// Ticket type=Design pronto para receber o pacote. Feat·BAIXO·BAIXA → Design deriva AFK.
function designTicket(dir: string): { issueId: string; ticketId: string } {
  const issue = createIssue({ title: "t", project: "app", type: "Feat", problem: "p", actor: "pi",
    complexity: "BAIXA", risk: "BAIXO" }, dir);
  claimIssue({ id: issue.id }, dir);
  const ticketId = createTicket({ issueId: issue.id, type: "Design", objective: "o", task: "t",
    acceptance_criteria: "c", actor: "pi" }, dir).tickets.at(-1)!.id;
  return { issueId: issue.id, ticketId };
}

test("setDesignDoc grava design/<ticketId>/design.md", () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  setDesignDoc({ issueId, ticketId, file: file(dir, "d.md", "# Design") }, dir);
  assert.equal(new Queue(dir).readDesign("app", ticketId, "design.md"), "# Design");
});

test("setDesignDoc rejeita ticket inexistente, non-Design e CLOSED", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  const doc = file(dir, "d.md", "# Design");
  assert.throws(() => setDesignDoc({ issueId, ticketId: "nope", file: doc }, dir), /Ticket not found/);

  claimTicket({ issueId, ticketId, actor: "pi" }, dir);
  await statusTicket({ issueId, ticketId, actor: "pi", status: "CLOSED", comment: "ok", closed_reason: "concluido" }, dir);
  assert.throws(() => setDesignDoc({ issueId, ticketId, file: doc }, dir), /CLOSED/);

  // com o Design CLOSED a fase seguinte destrava e o Implement pode existir
  const implId = createTicket({ issueId, type: "Implement", objective: "o", task: "t",
    acceptance_criteria: "c", actor: "pi" }, dir).tickets.at(-1)!.id;
  assert.throws(() => setDesignDoc({ issueId, ticketId: implId, file: doc }, dir), /não é de Design/);
});

test("setDesignDoc com doc vazio lança empty_doc e nada é gravado", () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  const empty = file(dir, "vazio.md", "  \n\t\n");
  assert.throws(() => setDesignDoc({ issueId, ticketId, file: empty }, dir),
    (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "empty_doc");
  assert.equal(new Queue(dir).readDesign("app", ticketId, "design.md"), null);
});

test("addDesignDiagram com PlantUML inválido reporta line/message e nada é gravado", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  await assert.rejects(
    addDesignDiagram({ issueId, ticketId, kind: "class", file: file(dir, "bad.puml", INVALID) }, dir),
    (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "plantuml_invalid"
      && error.errors[0].line === 2 && error.errors[0].path === "class.puml");
  assert.equal(new Queue(dir).readDesign("app", ticketId, "class.puml"), null);
});

test("addDesignDiagram com kind incompatível lança kind_mismatch citando kind e diagramType", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  await assert.rejects(
    addDesignDiagram({ issueId, ticketId, kind: "state", file: file(dir, "c.puml", VALID_CLASS) }, dir),
    (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "kind_mismatch"
      && /state/.test(error.errors[0].message) && /ClassDiagram/.test(error.errors[0].message));
  assert.equal(new Queue(dir).readDesign("app", ticketId, "state.puml"), null);
});

test("addDesignDiagram com kind inválido lança invalid_kind", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  await assert.rejects(
    addDesignDiagram({ issueId, ticketId, kind: "sequence", file: file(dir, "c.puml", VALID_CLASS) }, dir),
    (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "invalid_kind");
});

test("addDesignDiagram grava <kind>.puml e regravar substitui", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  await addDesignDiagram({ issueId, ticketId, kind: "class", file: file(dir, "a.puml", VALID_CLASS) }, dir);
  assert.equal(new Queue(dir).readDesign("app", ticketId, "class.puml"), VALID_CLASS);
  const updated = "@startuml\nclass B\n@enduml";
  await addDesignDiagram({ issueId, ticketId, kind: "class", file: file(dir, "b.puml", updated) }, dir);
  assert.equal(new Queue(dir).readDesign("app", ticketId, "class.puml"), updated);
});

test("getDesignPackage com pacote completo devolve ready_for_awaiting true", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  setDesignDoc({ issueId, ticketId, file: file(dir, "d.md", "# Design") }, dir);
  await addDesignDiagram({ issueId, ticketId, kind: "class", file: file(dir, "c.puml", VALID_CLASS) }, dir);
  await addDesignDiagram({ issueId, ticketId, kind: "state", file: file(dir, "s.puml", VALID_STATE) }, dir);
  const pack = await getDesignPackage({ issueId }, dir);
  assert.equal(pack.issueId, issueId);
  assert.equal(pack.tickets.length, 1);
  const entry = pack.tickets[0];
  assert.equal(entry.ticketId, ticketId);
  assert.equal(entry.design_md, "# Design");
  assert.equal(entry.diagrams.class, VALID_CLASS);
  assert.equal(entry.diagrams.state, VALID_STATE);
  assert.equal(entry.diagrams.component, null);
  assert.deepEqual(entry.validation, { ready_for_awaiting: true, errors: [] });
});

test("getDesignPackage incompleto devolve ready_for_awaiting false com os erros do gate", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  setDesignDoc({ issueId, ticketId, file: file(dir, "d.md", "# Design") }, dir); // doc sem diagrama
  const pack = await getDesignPackage({ issueId }, dir);
  const validation = pack.tickets[0].validation;
  assert.equal(validation.ready_for_awaiting, false);
  assert.deepEqual(validation.errors.map((error) => error.code), ["missing_diagram"]);
});

test("getDesignPackage é somente leitura e funciona com Issue/Ticket CLOSED", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  setDesignDoc({ issueId, ticketId, file: file(dir, "d.md", "# Design") }, dir);
  await addDesignDiagram({ issueId, ticketId, kind: "class", file: file(dir, "c.puml", VALID_CLASS) }, dir);
  claimTicket({ issueId, ticketId, actor: "pi" }, dir);
  await statusTicket({ issueId, ticketId, actor: "pi", status: "CLOSED", comment: "ok",
    closed_reason: "concluido", last: true }, dir); // injeta o Confirmation
  const confId = getIssue(issueId, dir).tickets.find((ticket) => ticket.type === "Confirmation")!.id;
  claimTicket({ issueId, ticketId: confId, actor: "pi" }, dir);
  await statusTicket({ issueId, ticketId: confId, actor: "pi", status: "CLOSED", comment: "ok",
    closed_reason: "concluido" }, dir); // Issue -> AWAITING
  decideIssue({ id: issueId, human: true, status: "CLOSED", comment: "aceito", closed_reason: "concluido" }, dir);
  const pack = await getDesignPackage({ issueId }, dir);
  assert.equal(pack.tickets[0].validation.ready_for_awaiting, true);
});

test("getDesignPackage funciona para Issue sem Ticket de Design e re-checa .puml corrompido no disco", async () => {
  const dir = root();
  const issue = createIssue({ title: "t", project: "app", type: "Feat", problem: "p", actor: "pi" }, dir);
  assert.deepEqual(await getDesignPackage({ issueId: issue.id }, dir), { issueId: issue.id, tickets: [] });

  const { issueId, ticketId } = designTicket(dir);
  setDesignDoc({ issueId, ticketId, file: file(dir, "d.md", "# Design") }, dir);
  new Queue(dir).writeDesign("app", ticketId, "class.puml", INVALID); // corrompido fora do use case
  const validation = (await getDesignPackage({ issueId }, dir)).tickets[0].validation;
  assert.equal(validation.ready_for_awaiting, false);
  assert.deepEqual(validation.errors.map((error) => error.code), ["plantuml_invalid"]);
  assert.equal(validation.errors[0].path, "class.puml");
});

test("gate: Design→AWAITING sem pacote acumula TODAS as falhas e o Ticket permanece CLAIMED", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  claimTicket({ issueId, ticketId, actor: "pi" }, dir);
  new Queue(dir).writeDesign("app", ticketId, "class.puml", INVALID); // .puml corrompido no disco
  await assert.rejects(
    statusTicket({ issueId, ticketId, actor: "pi", status: "AWAITING", comment: "fim" }, dir),
    (error: unknown) => {
      assert.ok(error instanceof DesignGateError);
      assert.deepEqual(error.errors.map((each) => each.code), ["missing_design_md", "plantuml_invalid"]);
      assert.equal(error.errors[1].path, "class.puml");
      assert.equal(error.errors[1].line, 2);
      return true;
    });
  assert.equal(getTicket({ issueId, ticketId }, dir).status, "CLAIMED"); // nada aplicado/salvo
});

test("gate: Design→AWAITING sem diagrama falha só com missing_diagram", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  claimTicket({ issueId, ticketId, actor: "pi" }, dir);
  setDesignDoc({ issueId, ticketId, file: file(dir, "d.md", "# Design") }, dir);
  await assert.rejects(
    statusTicket({ issueId, ticketId, actor: "pi", status: "AWAITING", comment: "fim" }, dir),
    (error: unknown) => error instanceof DesignGateError
      && error.errors.length === 1 && error.errors[0].code === "missing_diagram");
});

test("gate: Design→AWAITING passa com design.md + diagrama válido; decideTicket segue sem gate", async () => {
  const dir = root();
  const { issueId, ticketId } = designTicket(dir);
  claimTicket({ issueId, ticketId, actor: "pi" }, dir);
  setDesignDoc({ issueId, ticketId, file: file(dir, "d.md", "# Design") }, dir);
  await addDesignDiagram({ issueId, ticketId, kind: "class", file: file(dir, "c.puml", VALID_CLASS) }, dir);
  const issue = await statusTicket({ issueId, ticketId, actor: "pi", status: "AWAITING", comment: "fim" }, dir);
  assert.equal(issue.tickets.find((ticket) => ticket.id === ticketId)!.status, "AWAITING");

  new Queue(dir).writeDesign("app", ticketId, "class.puml", INVALID); // corrompe após o gate
  const decided = decideTicket({ issueId, ticketId, human: true, status: "CLOSED",
    comment: "aceito", closed_reason: "concluido" }, dir); // síncrono e sem gate — inalterado
  assert.equal(decided.tickets.find((ticket) => ticket.id === ticketId)!.status, "CLOSED");
});

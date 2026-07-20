import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deleteIssue, deleteIssues } from "../../src/app/services/use_cases/deletion_use_cases.js";
import { createIssue, nextIssue, relateIssues, setArtifact, statusIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { DomainError, NotFoundError } from "../../src/domain/domain_error.js";
import { Queue } from "../../src/domain/queue_repository.js";

const root = () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-delete-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};

const open = (dir: string, title: string): string =>
  createIssue({ title, project: "app", type: "Feat", action: "Implement", problem: "p", actor: "pi" }, dir).id;

const closed = async (dir: string, title: string): Promise<string> => {
  const id = open(dir, title);
  nextIssue({ agent: "pi", id }, dir);
  await statusIssue({ id, agent: "pi", status: "CLOSED", comment: "feito: evidência", closed_reason: "concluido" }, dir);
  return id;
};

test("remove a Issue alvo com JSON e artefatos quando a árvore transitiva está toda CLOSED", async () => {
  const dir = root();
  const target = open(dir, "alvo");
  setArtifact({ issueId: target, content: "# spec" }, dir);
  nextIssue({ agent: "pi", id: target }, dir);
  await statusIssue({ id: target, agent: "pi", status: "CLOSED", comment: "feito: evidência", closed_reason: "concluido" }, dir);
  const neto = await closed(dir, "neto");
  const filho = await closed(dir, "filho");
  relateIssues({ id: target, relates: [filho], kind: "child" }, dir);
  relateIssues({ id: filho, relates: [neto], kind: "child" }, dir);

  assert.deepEqual(deleteIssue({ issueId: target }, dir), { id: target });
  const queue = new Queue(dir);
  assert.equal(queue.load(target), null);
  assert.equal(queue.readArtifact("app", target), null);
  assert.equal(queue.load(filho)?.id, filho); // só a alvo some
  assert.equal(queue.load(neto)?.id, neto);
});

test("barra a remoção citando o nó não-CLOSED do fecho transitivo", async () => {
  const dir = root();
  const target = await closed(dir, "alvo");
  const filho = await closed(dir, "filho");
  const neto = open(dir, "neto aberto");
  relateIssues({ id: target, relates: [filho], kind: "child" }, dir);
  relateIssues({ id: filho, relates: [neto], kind: "child" }, dir);

  assert.throws(() => deleteIssue({ issueId: target }, dir),
    (error: DomainError) => error instanceof DomainError && error.message.includes(neto) && error.message.includes("OPEN"));
  assert.equal(new Queue(dir).load(target)?.id, target);
});

test("barra a remoção da própria Issue quando ela não está CLOSED", () => {
  const dir = root();
  const target = open(dir, "alvo aberto");
  assert.throws(() => deleteIssue({ issueId: target }, dir), new RegExp(`Issue ${target} está em OPEN`));
});

test("ciclo de relates não trava o BFS", async () => {
  const dir = root();
  const a = await closed(dir, "a");
  const b = await closed(dir, "b");
  const c = await closed(dir, "c");
  relateIssues({ id: a, relates: [b] }, dir);
  relateIssues({ id: b, relates: [c] }, dir);
  relateIssues({ id: c, relates: [a] }, dir);

  assert.deepEqual(deleteIssue({ issueId: a }, dir), { id: a });
  assert.equal(new Queue(dir).load(a), null);
});

test("relates pendente para Issue já removida não bloqueia nem quebra", async () => {
  const dir = root();
  const a = await closed(dir, "a");
  const b = await closed(dir, "b");
  relateIssues({ id: a, relates: [b] }, dir);

  deleteIssue({ issueId: b }, dir);
  assert.deepEqual(deleteIssue({ issueId: a }, dir), { id: a });
});

test("id inexistente é NotFoundError", () => {
  assert.throws(() => deleteIssue({ issueId: "nope" }, root()), NotFoundError);
});

test("remoção em massa apaga todas as elegíveis", async () => {
  const dir = root();
  const ids = [await closed(dir, "a"), await closed(dir, "b"), await closed(dir, "c")];

  assert.deepEqual(deleteIssues({ ids }, dir), { removed: ids, blocked: [] });
  const queue = new Queue(dir);
  for (const id of ids) assert.equal(queue.load(id), null);
});

test("remoção em massa mantém a bloqueada por linhagem e a reporta com título e motivo", async () => {
  const dir = root();
  const livre = await closed(dir, "livre");
  const presa = await closed(dir, "presa");
  const viva = open(dir, "filha viva");
  relateIssues({ id: presa, relates: [viva], kind: "child" }, dir);

  const result = deleteIssues({ ids: [livre, presa] }, dir);
  assert.deepEqual(result.removed, [livre]);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].id, presa);
  assert.equal(result.blocked[0].title, "presa");
  assert.match(result.blocked[0].reason, /só remove com a árvore de relates toda CLOSED/);
  assert.equal(new Queue(dir).load(presa)?.id, presa);
});

test("remoção em massa de lista vazia devolve listas vazias", () => {
  assert.deepEqual(deleteIssues({ ids: [] }, root()), { removed: [], blocked: [] });
});

// Aresta legada gravada só de um lado (antes de `create --relates` delegar a relateIssues): o scan
// two-way de deleteIssue é a última defesa contra store não migrado ou JSON editado à mão.
test("barra a remoção quando a linhagem viva é uma aresta legada só de entrada", async () => {
  const dir = root();
  const pai = await closed(dir, "pai");
  const filha = open(dir, "filha viva");
  const queue = new Queue(dir);
  const viva = queue.loadRequired(filha);
  viva.relate([{ id: pai, kind: "see-also" }]);
  queue.save(viva);
  assert.deepEqual(new Queue(dir).load(pai)?.relates, []); // pai sem aresta de saída

  assert.throws(() => deleteIssue({ issueId: pai }, dir),
    (error: DomainError) => error instanceof DomainError && error.message.includes(filha) && error.message.includes("OPEN"));
  assert.equal(new Queue(dir).load(pai)?.id, pai);
});

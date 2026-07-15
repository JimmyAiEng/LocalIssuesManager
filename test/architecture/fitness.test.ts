import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { Issue } from "../../src/domain/issue_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";
import { CLOSED_REASONS, ISSUE_STATUSES, ISSUE_TYPES, TICKET_TYPES } from "../../src/domain/value_objects.js";
import * as clientVm from "../../src/web/client/view_model.js";

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test("módulos expõem somente a API pública definida (FF-06)", () => {
  assert.deepEqual(publicMethods(Issue.prototype), [
    "addTicket", "artifactOwnerId", "claim", "claimTicket", "clearWorktree", "closeByAgent", "closeByHuman",
    "comment", "commentTicket", "decide", "decideTicket", "dependenciesMet", "phaseBlocker", "readyTickets", "reset", "setWorktree", "tag", "tagTicket", "ticket", "toJSON", "transitionTicket",
  ]);
  assert.deepEqual(publicMethods(Queue.prototype), [
    "findAttachment", "list", "load", "loadRequired", "oldestOpen", "oldestOpenTicket", "purgeClosed", "readArtifact", "readRequirements", "save", "writeArtifact", "writeAttachment", "writeRequirements",
  ]);
});

function publicMethods(prototype: object): string[] {
  return Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor").sort();
}

test("enums do client não divergem do domínio (Confirmation é interno ao sistema)", () => {
  assert.deepEqual(clientVm.ISSUE_STATUSES, [...ISSUE_STATUSES]);
  assert.deepEqual(clientVm.ISSUE_TYPES, [...ISSUE_TYPES]);
  assert.deepEqual(clientVm.CLOSED_REASONS, [...CLOSED_REASONS]);
  assert.deepEqual(clientVm.TICKET_TYPES, TICKET_TYPES.filter((type) => type !== "Confirmation"));
});

test("respeita limites de arquivos e dependências", () => {
  const source = files("src").filter((file) => file.endsWith(".ts"));
  for (const file of source) inspectFile(file);
  // JS do client segue o mesmo limite de 300 linhas (o resto de inspectFile é específico de TS)
  for (const file of files("src").filter((file) => file.endsWith(".js"))) {
    assertLineLimit(file, readFileSync(file, "utf8"));
  }
  assert.equal(source.some((file) => file.includes("/infra/")), false);
});

test("o limite de 300 linhas cobre JavaScript (FF-07)", () => {
  assert.throws(() => assertLineLimit("fake.js", `${"x\n".repeat(300)}x`), /exceeds 300 lines/);
  assert.doesNotThrow(() => assertLineLimit("fake.js", "x\n".repeat(299)));
});

function assertLineLimit(file: string, content: string): void {
  assert.ok(content.split("\n").length <= 300, `${file} exceeds 300 lines`);
}

function inspectFile(file: string): void {
  const content = readFileSync(file, "utf8");
  assertLineLimit(file, content);
  if (file === "src/cli.ts") assert.doesNotMatch(content, /from ["']\.\/domain\//);
  if (file.includes("src/domain/") && !file.endsWith("queue_repository.ts")) {
    assert.doesNotMatch(content, /from ["'].*(?:app|cli)/);
  }
  assert.doesNotMatch(content, /interface\s+\w*(?:Port|Repository)/);
  inspectFunctions(file, content);
}

function inspectFunctions(file: string, content: string): void {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      const start = source.getLineAndCharacterOfPosition(node.getStart()).line;
      const end = source.getLineAndCharacterOfPosition(node.getEnd()).line;
      assert.ok(end - start + 1 <= 20, `${file} function at line ${start + 1} exceeds 20 lines`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

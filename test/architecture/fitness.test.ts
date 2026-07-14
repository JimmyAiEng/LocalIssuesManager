import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { Issue } from "../../src/domain/issue_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test("módulos expõem somente a API pública definida (FF-06)", () => {
  assert.deepEqual(publicMethods(Issue.prototype), [
    "addTicket", "await", "claim", "claimTicket", "closeByAgent", "closeByHuman",
    "comment", "commentTicket", "decide", "decideTicket", "reset", "tag", "tagTicket", "toJSON", "transitionTicket",
  ]);
  assert.deepEqual(publicMethods(Queue.prototype), [
    "findAttachment", "list", "load", "oldestOpen", "oldestOpenTicket", "purgeClosed", "save", "writeAttachment",
  ]);
});

function publicMethods(prototype: object): string[] {
  return Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor").sort();
}

test("respeita limites de arquivos e dependências", () => {
  const source = files("src").filter((file) => file.endsWith(".ts"));
  for (const file of source) inspectFile(file);
  assert.equal(source.some((file) => file.includes("/infra/")), false);
});

function inspectFile(file: string): void {
  const content = readFileSync(file, "utf8");
  assert.ok(content.split("\n").length <= 300, `${file} exceeds 300 lines`);
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

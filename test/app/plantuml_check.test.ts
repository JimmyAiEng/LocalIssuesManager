import assert from "node:assert/strict";
import test from "node:test";
import { checkSyntax } from "../../src/app/plantuml_check.js";

const VALID_CLASS = "@startuml\nclass A\nA --> B\n@enduml";
const INVALID = "@startuml\nthis is !! broken\n@enduml";

test("checkSyntax valida diagrama PlantUML e reporta o diagramType", async () => {
  const check = await checkSyntax(VALID_CLASS);
  assert.equal(check.valid, true);
  assert.equal(check.diagramType, "ClassDiagram");
});

test("checkSyntax reporta line e message do engine para fonte inválida", async () => {
  const check = await checkSyntax(INVALID);
  assert.equal(check.valid, false);
  assert.equal(check.errorLineNumber, 2);
  assert.match(check.errorMessage ?? "", /Syntax Error/);
});

test("checkSyntax não escreve no stdout via console.log e restaura o console (D2)", async () => {
  const original = console.log;
  const calls: unknown[][] = [];
  const spy = (...args: unknown[]) => calls.push(args);
  console.log = spy;
  try {
    await checkSyntax(VALID_CLASS);
    assert.equal(calls.length, 0, "logs do engine devem ir para stderr, não para console.log");
    assert.equal(console.log, spy, "console.log deve ser restaurado após o check");
  } finally {
    console.log = original;
  }
});

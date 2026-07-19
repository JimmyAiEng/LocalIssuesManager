import assert from "node:assert/strict";
import test from "node:test";
import { gateFor } from "../../src/domain/gates/index.js";
import { ACTION_TYPES } from "../../src/domain/value_objects.js";

test("cada Action possui um Gate com o mesmo padrão de requisitos", () => {
  const gates = ACTION_TYPES.map(gateFor);
  assert.deepEqual(gates.map((gate) => gate.action), [...ACTION_TYPES]);
  assert.deepEqual(gates.map((gate) => gate.name),
    ["Requirement Engineering", "Design", "Unit of Work", "Quality Review", "Merge/PR Analysis"]);
  for (const gate of gates) {
    assert.ok(["none", "required", "conditional"].includes(gate.artifacts.mode));
    assert.ok(["none", "required", "conditional"].includes(gate.codeExecution.mode));
    assert.ok(["none", "required", "conditional"].includes(gate.humanApproval.mode));
  }
});

test("gates declaram artefatos, execução de código e aprovação humana", () => {
  assert.deepEqual(ACTION_TYPES.map((action) => {
    const gate = gateFor(action);
    return [action, gate.artifacts.mode, gate.artifacts.types,
      gate.codeExecution.mode, gate.humanApproval.mode];
  }), [
    ["Planning", "required", ["requirement"], "none", "conditional"],
    ["Design", "required", ["implementation-plan"], "conditional", "conditional"],
    ["Implement", "none", [], "conditional", "conditional"],
    ["Review", "required", ["document"], "none", "conditional"],
    ["Deploy", "none", [], "required", "required"],
  ]);
  assert.deepEqual(gateFor("Design").artifacts.conditional,
    { types: ["document", "uml"], condition: "architecture_changed=true" });
});

test("gateFor devolve snapshot e protege a definição compartilhada", () => {
  gateFor("Review").artifacts.types.push("media");
  assert.deepEqual(gateFor("Review").artifacts.types, ["document"]);
});

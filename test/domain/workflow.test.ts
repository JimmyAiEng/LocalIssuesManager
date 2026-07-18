import assert from "node:assert/strict";
import test from "node:test";
import { workflowFor } from "../../src/domain/workflow.js";
import { ACTION_TYPES } from "../../src/domain/value_objects.js";

test("cada Action seleciona exatamente um Workflow não persistido", () => {
  assert.deepEqual(ACTION_TYPES.map((action) => workflowFor(action).action), [...ACTION_TYPES]);
  assert.deepEqual(ACTION_TYPES.map((action) => workflowFor(action).name),
    ["Requirement Engineering", "Design", "Unit of Work", "Quality Review", "Merge/PR Analysis"]);
  assert.deepEqual(workflowFor("Planning").requiredArtifacts, ["requirements", "prd"]);
  assert.deepEqual(workflowFor("Design").requiredArtifacts, ["plan"]);
  assert.deepEqual(workflowFor("Implement").requiredArtifacts, []);
  assert.deepEqual(workflowFor("QA").requiredArtifacts, ["doc"]);
  assert.deepEqual(workflowFor("Deploy").requiredArtifacts, []);
});

test("workflowFor devolve snapshot e protege a definição compartilhada", () => {
  workflowFor("QA").requiredArtifacts.push("media");
  assert.deepEqual(workflowFor("QA").requiredArtifacts, ["doc"]);
});

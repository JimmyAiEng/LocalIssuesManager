import assert from "node:assert/strict";
import test from "node:test";
import { assessGate } from "../../src/domain/gate_policy.js";

test("GatePolicy aprova entrega AFK válida", () => {
  assert.deepEqual(assessGate({ risk: "BAIXO", complexity: "BAIXA" }), { outcome: "approved" });
});

test("GatePolicy roteia classificações altas com razões estáveis", () => {
  assert.deepEqual(assessGate({ human_need: "HITL" }),
    { outcome: "human-required", reasons: ["human_need=HITL"] });
  assert.deepEqual(assessGate({ risk: "ALTO" }),
    { outcome: "human-required", reasons: ["risk=ALTO"] });
  assert.deepEqual(assessGate({ complexity: "ALTA" }),
    { outcome: "human-required", reasons: ["complexity=ALTA"] });
});

test("GatePolicy combina regra obrigatória do Workflow com autonomia", () => {
  assert.deepEqual(assessGate({}, { forceHuman: "deploy" }),
    { outcome: "human-required", reasons: ["deploy"] });
});

test("entrega inválida precede o roteamento humano", () => {
  const violations = [{ code: "missing", message: "Artifact ausente" }];
  assert.deepEqual(assessGate({ human_need: "HITL" }, { violations }), { outcome: "rejected", violations });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  DESIGN_KINDS,
  DesignGateError,
  evaluateGate,
  kindAccepts,
  parseDesignKind,
  plantumlError,
  requireNonEmptyDoc,
} from "../../src/domain/design_gate.js";

test("parseDesignKind aceita os 6 kinds e rejeita desconhecidos com invalid_kind", () => {
  for (const kind of DESIGN_KINDS) assert.equal(parseDesignKind(kind), kind);
  try {
    parseDesignKind("sequence");
    assert.fail("deveria lançar");
  } catch (error) {
    assert.ok(error instanceof DesignGateError);
    assert.equal(error.errors[0].code, "invalid_kind");
    assert.match(error.errors[0].message, /sequence/);
  }
});

test("kindAccepts aplica a heurística D3 kind↔diagramType", () => {
  assert.equal(kindAccepts("class", "ClassDiagram"), true);
  assert.equal(kindAccepts("state", "StateDiagram"), true);
  assert.equal(kindAccepts("activity", "ActivityDiagram3"), true);
  for (const kind of ["component", "package", "deployment"] as const) {
    assert.equal(kindAccepts(kind, "DescriptionDiagram"), true);
    assert.equal(kindAccepts(kind, "ClassDiagram"), false);
  }
  assert.equal(kindAccepts("class", "StateDiagram"), false);
  assert.equal(kindAccepts("state", "ClassDiagram"), false);
  assert.equal(kindAccepts("activity", "ClassDiagram"), false);
});

test("kindAccepts aceita quando diagramType está ausente (heurística documentada)", () => {
  for (const kind of DESIGN_KINDS) assert.equal(kindAccepts(kind), true);
});

test("requireNonEmptyDoc rejeita vazio e whitespace com empty_doc", () => {
  assert.doesNotThrow(() => requireNonEmptyDoc("# Design\ntexto"));
  for (const content of ["", "   \n\t  "]) {
    assert.throws(
      () => requireNonEmptyDoc(content),
      (error: unknown) => error instanceof DesignGateError && error.errors[0].code === "empty_doc",
    );
  }
});

test("plantumlError propaga line e message do engine", () => {
  const error = plantumlError("class.puml", {
    valid: false,
    errorLineNumber: 2,
    errorMessage: "Syntax Error?",
  });
  assert.deepEqual(error, { code: "plantuml_invalid", path: "class.puml", message: "Syntax Error?", line: 2 });
  const bare = plantumlError("state.puml", { valid: false });
  assert.equal(bare.message, "PlantUML inválido");
  assert.equal("line" in bare, false);
});

test("evaluateGate acumula todas as falhas da entrega", () => {
  const errors = evaluateGate(null, []);
  assert.deepEqual(
    errors.map((error) => error.code),
    ["missing_design_md", "missing_diagram"],
  );
  const invalid = evaluateGate("doc", [
    { path: "class.puml", check: { valid: true, diagramType: "ClassDiagram" } },
    { path: "state.puml", check: { valid: false, errorLineNumber: 3, errorMessage: "boom" } },
  ]);
  assert.deepEqual(invalid, [{ code: "plantuml_invalid", path: "state.puml", message: "boom", line: 3 }]);
});

test("evaluateGate trata design.md só de whitespace como ausente", () => {
  const errors = evaluateGate("  \n ", [{ path: "class.puml", check: { valid: true } }]);
  assert.deepEqual(
    errors.map((error) => error.code),
    ["missing_design_md"],
  );
});

test("evaluateGate devolve vazio para pacote completo (pronto para AWAITING)", () => {
  assert.deepEqual(evaluateGate("# Design", [{ path: "class.puml", check: { valid: true } }]), []);
});

test("DesignGateError compõe a mensagem a partir dos codes", () => {
  const error = new DesignGateError([
    { code: "missing_design_md", message: "a" },
    { code: "missing_diagram", message: "b" },
  ]);
  assert.equal(error.message, "missing_design_md: a; missing_diagram: b");
  assert.equal(error.name, "DesignGateError");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  DESIGN_KINDS,
  type DesignDiagram,
  DesignGateError,
  evaluateDesignGate,
  kindAccepts,
  parseDesignKind,
  plantumlError,
  requireNonEmptyDoc,
} from "../../src/domain/gates/design_gate.js";

const valid = (kind: DesignDiagram["kind"]): DesignDiagram => ({ kind, path: `${kind}.puml`, check: { valid: true } });

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

test("evaluateDesignGate: decisão de arquitetura ausente exige a escolha explícita", () => {
  for (const changed of [null, undefined] as const) {
    const errors = evaluateDesignGate(changed, "# Design", [valid("class")]);
    assert.deepEqual(errors.map((error) => error.code), ["decision_required"]);
  }
});

test("evaluateDesignGate: sem mudança de arquitetura dispensa diagramas (só o plano, cobrado à parte)", () => {
  assert.deepEqual(evaluateDesignGate(false, null, []), []);
});

test("evaluateDesignGate com mudança exige os 4 níveis e lista os faltantes", () => {
  const errors = evaluateDesignGate(true, "# Design", [valid("class"), valid("package")]);
  const missing = errors.find((error) => error.code === "missing_level");
  assert.ok(missing);
  assert.match(missing.message, /High Level/);
  assert.match(missing.message, /Interface\/DataModel/);
  assert.doesNotMatch(missing.message, /Package/); // package coberto
  assert.doesNotMatch(missing.message, /(?<![-/])Class/); // class coberto
});

test("evaluateDesignGate com mudança: doc ausente, .puml inválido e nível não contam para cobertura", () => {
  const errors = evaluateDesignGate(true, "  \n ", [
    { kind: "class", path: "class.puml", check: { valid: false, errorLineNumber: 3, errorMessage: "boom" } },
    valid("package"), valid("deployment"), valid("state"),
  ]);
  const codes = errors.map((error) => error.code);
  assert.deepEqual(codes, ["missing_design_md", "plantuml_invalid", "missing_level"]); // class inválido → nível Class descoberto
  assert.match(errors[2].message, /Class/);
});

test("evaluateDesignGate com mudança devolve vazio quando os 4 níveis têm PlantUML válido", () => {
  const complete = [valid("deployment"), valid("package"), valid("class"), valid("state")]; // high_level, package, class, interface/data
  assert.deepEqual(evaluateDesignGate(true, "# Design", complete), []);
});

test("DesignGateError compõe a mensagem a partir dos codes", () => {
  const error = new DesignGateError([
    { code: "missing_design_md", message: "a" },
    { code: "missing_diagram", message: "b" },
  ]);
  assert.equal(error.message, "missing_design_md: a; missing_diagram: b");
  assert.equal(error.name, "DesignGateError");
});

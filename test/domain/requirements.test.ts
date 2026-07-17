import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import { parseAndValidateRequirements, validateGherkinRequirements } from "../../src/domain/requirements.js";

const feature = (over: Partial<Record<"header" | "como" | "quero" | "para" | "scenario" | "steps", string>> = {}): string =>
  [
    over.header ?? "Feature: Cadastro de usuário",
    `  ${over.como ?? "Como um administrador"}`,
    `  ${over.quero ?? "Eu quero poder cadastrar usuários"}`,
    `  ${over.para ?? "Para que eu controle o acesso"}`,
    "",
    `  ${over.scenario ?? "Scenario: Cadastro válido"}`,
    over.steps ??
      "    Given um formulário aberto\n    When preencho os dados\n    And confirmo\n    Then o usuário é criado\n    And vejo uma confirmação",
  ].join("\n");

const throwsDomain = (fn: () => unknown, match: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof DomainError && match.test(error.message));

test("aceita >=1 Feature no padrão e devolve as features", () => {
  const result = validateGherkinRequirements({ features: [feature()] });
  assert.equal(result.features.length, 1);
  assert.ok(result.features[0].includes("Feature: Cadastro de usuário"));
});

test("aceita múltiplas Features válidas", () => {
  const result = validateGherkinRequirements({ features: [feature(), feature({ header: "Feature: Login" })] });
  assert.equal(result.features.length, 2);
});

test("rejeita não-objeto (array, string, null, número)", () => {
  for (const raw of [[], "texto livre", null, 42, true]) {
    throwsDomain(() => validateGherkinRequirements(raw), /objeto JSON/);
  }
});

test("rejeita features ausente ou não-array", () => {
  throwsDomain(() => validateGherkinRequirements({}), /features deve ser um array/);
  throwsDomain(() => validateGherkinRequirements({ features: "x" }), /features deve ser um array/);
});

test("rejeita array de features vazio com mensagem clara", () => {
  throwsDomain(() => validateGherkinRequirements({ features: [] }), /ao menos uma Feature/);
});

test("rejeita feature que não é string", () => {
  throwsDomain(() => validateGherkinRequirements({ features: [{}] }), /Feature 1: deve ser texto/);
});

test("rejeita ausência do cabeçalho Feature", () => {
  throwsDomain(() => validateGherkinRequirements({ features: ["Como um x\nEu quero poder y\nPara que eu z"] }), /cabeçalho "Feature/);
});

test("rejeita user story ausente", () => {
  throwsDomain(() => validateGherkinRequirements({ features: [feature({ quero: "" })] }), /Eu quero poder/);
});

test("rejeita user story fora de ordem", () => {
  const outOfOrder = [
    "Feature: X",
    "  Eu quero poder algo",
    "  Como um alguém",
    "  Para que eu ganhe",
    "  Scenario: s",
    "    Given a",
  ].join("\n");
  throwsDomain(() => validateGherkinRequirements({ features: [outOfOrder] }), /Como um/);
});

test("rejeita feature sem Scenario", () => {
  const noScenario = ["Feature: X", "  Como um a", "  Eu quero poder b", "  Para que eu c"].join("\n");
  throwsDomain(() => validateGherkinRequirements({ features: [noScenario] }), /ao menos um Scenario/);
});

test("rejeita step fora de Given/When/Then/And (texto livre)", () => {
  throwsDomain(() => validateGherkinRequirements({ features: [feature({ steps: "    Faço qualquer coisa" })] }), /step inválido/);
});

test("rejeita 'But' como step (fora do vocabulário exigido)", () => {
  throwsDomain(() => validateGherkinRequirements({ features: [feature({ steps: "    Given a\n    But b" })] }), /step inválido/);
});

test("rejeita Scenario sem nenhum step", () => {
  const empty = [
    "Feature: X",
    "  Como um a",
    "  Eu quero poder b",
    "  Para que eu c",
    "  Scenario: vazio",
    "  Scenario: outro",
    "    Given passo",
  ].join("\n");
  throwsDomain(() => validateGherkinRequirements({ features: [empty] }), /ao menos um step/);
});

test("rejeita conteúdo antes do primeiro Scenario", () => {
  const before = [
    "Feature: X",
    "  Como um a",
    "  Eu quero poder b",
    "  Para que eu c",
    "  Given solto",
    "  Scenario: s",
    "    When passo",
  ].join("\n");
  throwsDomain(() => validateGherkinRequirements({ features: [before] }), /antes do primeiro Scenario/);
});

test("rejeita quando o último Scenario do texto não tem nenhum step (checagem pós-loop)", () => {
  const lastWithoutStep = [
    "Feature: X", "  Como um a", "  Eu quero poder b", "  Para que eu c", "  Scenario: sozinho, sem steps",
  ].join("\n");
  throwsDomain(() => validateGherkinRequirements({ features: [lastWithoutStep] }), /ao menos um step/);
});

test("parseAndValidateRequirements rejeita JSON malformado", () => {
  throwsDomain(() => parseAndValidateRequirements("{ features: [ }"), /JSON válido/);
});

test("parseAndValidateRequirements aceita JSON válido no padrão", () => {
  const result = parseAndValidateRequirements(JSON.stringify({ features: [feature()] }));
  assert.equal(result.features.length, 1);
});

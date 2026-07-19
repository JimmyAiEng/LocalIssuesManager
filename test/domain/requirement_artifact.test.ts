import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import { RequirementArtifact } from "../../src/domain/artifacts/requirement_artifact.js";

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
  const result = RequirementArtifact.validateParsed({ features: [feature()] });
  assert.equal(result.features.length, 1);
  assert.ok(result.features[0].includes("Feature: Cadastro de usuário"));
});

test("aceita múltiplas Features válidas", () => {
  const result = RequirementArtifact.validateParsed({ features: [feature(), feature({ header: "Feature: Login" })] });
  assert.equal(result.features.length, 2);
});

test("rejeita não-objeto (array, string, null, número)", () => {
  for (const raw of [[], "texto livre", null, 42, true]) {
    throwsDomain(() => RequirementArtifact.validateParsed(raw), /objeto JSON/);
  }
});

test("rejeita features ausente ou não-array", () => {
  throwsDomain(() => RequirementArtifact.validateParsed({}), /features deve ser um array/);
  throwsDomain(() => RequirementArtifact.validateParsed({ features: "x" }), /features deve ser um array/);
});

test("rejeita array de features vazio com mensagem clara", () => {
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [] }), /ao menos uma Feature/);
});

test("rejeita feature que não é string", () => {
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [{}] }), /Feature 1: deve ser texto/);
});

test("rejeita ausência do cabeçalho Feature", () => {
  throwsDomain(() => RequirementArtifact.validateParsed({ features: ["Como um x\nEu quero poder y\nPara que eu z"] }), /cabeçalho "Feature/);
});

test("rejeita user story ausente", () => {
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [feature({ quero: "" })] }), /Eu quero poder/);
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
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [outOfOrder] }), /Como um/);
});

test("rejeita feature sem Scenario", () => {
  const noScenario = ["Feature: X", "  Como um a", "  Eu quero poder b", "  Para que eu c"].join("\n");
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [noScenario] }), /ao menos um Scenario/);
});

test("rejeita step fora de Given/When/Then/And (texto livre)", () => {
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [feature({ steps: "    Faço qualquer coisa" })] }), /step inválido/);
});

test("rejeita 'But' como step (fora do vocabulário exigido)", () => {
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [feature({ steps: "    Given a\n    But b" })] }), /step inválido/);
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
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [empty] }), /ao menos um step/);
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
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [before] }), /antes do primeiro Scenario/);
});

test("rejeita quando o último Scenario do texto não tem nenhum step (checagem pós-loop)", () => {
  const lastWithoutStep = [
    "Feature: X", "  Como um a", "  Eu quero poder b", "  Para que eu c", "  Scenario: sozinho, sem steps",
  ].join("\n");
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [lastWithoutStep] }), /ao menos um step/);
});

test("erro de user story mostra a linha encontrada e a correção mecânica pronta", () => {
  // A armadilha observada com modelo pequeno: "Eu quero criar" sem o "poder", em loop de retentativas.
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [feature({ quero: "Eu quero criar usuários" })] }),
    /encontrado "Eu quero criar usuários" — corrija para "Eu quero poder criar usuários"/);
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [feature({ como: "Como administrador" })] }),
    /corrija para "Como um administrador"/);
});

test("erro de user story distingue prefixo sem conteúdo e linha ausente", () => {
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [feature({ para: "Para que eu" })] }),
    /complete o conteúdo após "Para que eu "/);
  const truncated = ["Feature: X", "  Como um a", "  Eu quero poder b"].join("\n");
  throwsDomain(() => RequirementArtifact.validateParsed({ features: [truncated] }), /linha ausente/);
});

test("erro de limite de Features aponta a rota de abandono, não um fechamento que o gate barraria", () => {
  const six = Array.from({ length: 6 }, (_, i) => feature({ header: `Feature: F${i}` }));
  throwsDomain(() => RequirementArtifact.validateParsed({ features: six }), /--reason obsoleto/);
});

test("parseAndValidateRequirements rejeita JSON malformado", () => {
  throwsDomain(() => RequirementArtifact.validate("{ features: [ }"), /JSON válido/);
});

test("parseAndValidateRequirements aceita JSON válido no padrão", () => {
  const result = RequirementArtifact.validate(JSON.stringify({ features: [feature()] }));
  assert.equal(result.features.length, 1);
});

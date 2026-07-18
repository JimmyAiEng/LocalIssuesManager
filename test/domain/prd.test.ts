import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import {
  clusterFeatures, clusterForTitle, parseAndValidatePrd, validatePrd,
} from "../../src/domain/prd.js";
import { featureNames, type Requirements } from "../../src/domain/requirements.js";

const feature = (name: string): string =>
  `Feature: ${name}\n  Como um usuário\n  Eu quero poder ${name}\n  Para que eu use\n\n  Scenario: ok\n    Given a tela\n    When ajo\n    Then vejo`;

const requirements: Requirements = { features: [feature("Login"), feature("Cadastro")] };

const validPrd = {
  visao: "Sistema de acesso",
  requisitos_funcionais: ["Entrar", "Registrar"],
  requisitos_nao_funcionais: ["Rápido"],
  clusters: [
    { name: "Acesso", features: ["Login"] },
    { name: "Conta", features: ["Cadastro"] },
  ],
};

test("featureNames extrai o nome de cada Feature do cabeçalho Gherkin", () => {
  assert.deepEqual(featureNames(requirements), ["Login", "Cadastro"]);
});

test("validatePrd aceita PRD estruturado com clusters cobrindo cada Feature uma vez", () => {
  assert.deepEqual(validatePrd(validPrd, requirements), validPrd);
});

test("validatePrd rejeita Feature sem cluster", () => {
  const prd = { ...validPrd, clusters: [{ name: "Acesso", features: ["Login"] }] };
  assert.throws(() => validatePrd(prd, requirements),
    (e: unknown) => e instanceof DomainError && /"Cadastro" não pertence a nenhum cluster/.test(e.message));
});

test("validatePrd rejeita Feature em dois clusters", () => {
  const prd = { ...validPrd, clusters: [
    { name: "Acesso", features: ["Login", "Cadastro"] },
    { name: "Conta", features: ["Cadastro"] },
  ] };
  assert.throws(() => validatePrd(prd, requirements),
    (e: unknown) => e instanceof DomainError && /"Cadastro" pertence a mais de um cluster/.test(e.message));
});

test("validatePrd rejeita cluster referenciando Feature inexistente", () => {
  const prd = { ...validPrd, clusters: [
    { name: "Acesso", features: ["Login"] },
    { name: "Conta", features: ["Cadastro", "Fantasma"] },
  ] };
  assert.throws(() => validatePrd(prd, requirements),
    (e: unknown) => e instanceof DomainError && /Feature inexistente "Fantasma"/.test(e.message));
});

test("validatePrd exige visão, requisitos e ao menos um cluster", () => {
  assert.throws(() => validatePrd({ clusters: [] }, requirements),
    (e: unknown) => e instanceof DomainError && /visao.*requisitos_funcionais.*clusters/s.test(e.message));
});

test("parseAndValidatePrd rejeita JSON malformado com erro claro", () => {
  assert.throws(() => parseAndValidatePrd("{ nope", requirements),
    (e: unknown) => e instanceof DomainError && /arquivo JSON válido/.test(e.message));
});

test("clusterForTitle casa o cluster cujo nome aparece no título da filha; senão null", () => {
  const prd = validPrd;
  assert.equal(clusterForTitle(prd, "Design: Acesso do usuário")?.name, "Acesso");
  assert.equal(clusterForTitle(prd, "Design sem cluster"), null);
});

test("clusterFeatures resolve os nomes do cluster para o Gherkin completo dos requisitos", () => {
  const features = clusterFeatures({ name: "Acesso", features: ["Login"] }, requirements);
  assert.equal(features.length, 1);
  assert.match(features[0], /^Feature: Login/);
});

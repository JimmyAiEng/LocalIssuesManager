import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import { ImplementationPlanArtifact } from "../../src/domain/artifacts/implementation_plan_artifact.js";

const VALID = {
  objetivo: "Extrair o parser de plano para o domínio",
  passos: ["Criar implementation_plan.ts", "Escrever os testes", "Ligar o gate"],
  arquivos: ["src/domain/artifacts/implementation_plan_artifact.ts", "src/app/plan_use_cases.ts"],
  criterio_pronto: "npm test verde e gate de Design exige plano",
};

test("validatePlan aceita e normaliza um plano completo", () => {
  assert.deepEqual(ImplementationPlanArtifact.validateParsed(VALID), VALID);
});

test("plano sem passos E sem critério de pronto acumula os dois erros", () => {
  assert.throws(
    () => ImplementationPlanArtifact.validateParsed({ objetivo: "x", arquivos: ["a"] }),
    (e: unknown) => e instanceof DomainError
      && /passos/.test(e.message) && /criterio_pronto/.test(e.message),
  );
});

test("passos vazio (array sem itens) é rejeitado", () => {
  assert.throws(() => ImplementationPlanArtifact.validateParsed({ ...VALID, passos: [] }), /passos/);
});

test("passo em branco é rejeitado", () => {
  assert.throws(() => ImplementationPlanArtifact.validateParsed({ ...VALID, passos: ["ok", "  "] }), /passos/);
});

test("objetivo/arquivos ausentes são rejeitados", () => {
  assert.throws(() => ImplementationPlanArtifact.validateParsed({ passos: ["p"], criterio_pronto: "c" }),
    (e: unknown) => e instanceof DomainError && /objetivo/.test(e.message) && /arquivos/.test(e.message));
});

test("não-objeto é rejeitado com mensagem única", () => {
  assert.throws(() => ImplementationPlanArtifact.validateParsed([]), /objeto JSON/);
  assert.throws(() => ImplementationPlanArtifact.validateParsed("x"), /objeto JSON/);
});

test("parseAndValidatePlan rejeita JSON malformado", () => {
  assert.throws(() => ImplementationPlanArtifact.validate("{não é json"), /arquivo JSON válido/);
});

test("parseAndValidatePlan aceita JSON válido", () => {
  assert.deepEqual(ImplementationPlanArtifact.validate(JSON.stringify(VALID)), VALID);
});

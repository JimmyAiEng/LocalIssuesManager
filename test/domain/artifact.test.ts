import assert from "node:assert/strict";
import test from "node:test";
import { ARTIFACT_TYPES } from "../../src/domain/artifacts/artifact.js";
import { DocumentArtifact } from "../../src/domain/artifacts/document_artifact.js";
import { MediaArtifact, MAX_MEDIA_SIZE } from "../../src/domain/artifacts/media_artifact.js";
import { RequirementArtifact } from "../../src/domain/artifacts/requirement_artifact.js";
import { UmlArtifact } from "../../src/domain/artifacts/uml_artifact.js";

const feature = { feature: "Login", como: "usuário", quero: "entrar", para: "use",
  scenarios: [{ nome: "ok", steps: ["Given a tela", "When entro", "Then vejo"] }] };

test("Artifact Types usam os nomes reais do domínio", () => {
  assert.deepEqual(ARTIFACT_TYPES,
    ["media", "document", "requirement", "uml", "implementation-plan"]);
});

test("MediaArtifact deriva metadata e aplica 25 MiB", () => {
  const artifact = MediaArtifact.create({ issueId: "i", filename: "a.png",
    mediaType: "image/png", size: MAX_MEDIA_SIZE });
  assert.equal(artifact.type, "media");
  assert.equal(artifact.kind, "image");
  assert.throws(() => MediaArtifact.create({ issueId: "i", filename: "a.png",
    mediaType: "image/png", size: MAX_MEDIA_SIZE + 1 }), /25MB/);
});

test("DocumentArtifact aplica limite e cria metadata", () => {
  const long = Array(301).fill("x").join(" ");
  assert.throws(() => DocumentArtifact.validate(long), /limite 300/);
  const artifact = DocumentArtifact.create({ issueId: "i", name: "qa.md", size: 3 },
    new Date("2026-01-01"));
  assert.equal(artifact.type, "document");
  assert.equal(artifact.created_at, "2026-01-01T00:00:00.000Z");
});

// O exemplo embutido na mensagem de erro é a única documentação garantida quando a skill da fase
// não foi carregada (foi assim que um modelo pequeno entrou em loop). Se ele apodrecer, ensina
// errado — então o teste extrai o exemplo da própria mensagem e exige que ele valide.
test("erro de forma do Requirements carrega um exemplo que de fato valida", () => {
  const erroDe = (raw: string): string => {
    try { RequirementArtifact.validate(raw); } catch (error) { return (error as Error).message; }
    throw new Error(`deveria ter rejeitado: ${raw}`);
  };
  // O envelope antigo ({"features": [...]}) é a confusão provável de quem já viu o formato anterior:
  // é justamente aí que a mensagem precisa ensinar a linha JSONL nova.
  const mensagem = erroDe('{"features":["Feature: Login"]}');
  assert.match(mensagem, /campo "feature" é obrigatório/);
  const exemplo = mensagem.slice(mensagem.indexOf('{"feature"')); // o exemplo é uma linha JSONL
  assert.equal(RequirementArtifact.validate(exemplo).features.length, 1); // o exemplo passa no validador
  for (const invalido of ["{quebrado", '["array"]', '{"feature":"X"}']) {
    assert.match(erroDe(invalido), /Formato esperado — um JSON por linha/);
  }
});

test("RequirementArtifact representa os Requirements como conjunto de Features estruturadas", () => {
  assert.deepEqual(RequirementArtifact.validate(JSON.stringify(feature)), { features: [feature] });
});

test("UmlArtifact valida kind, sintaxe e tipo detectado", () => {
  assert.equal(UmlArtifact.parseKind("class"), "class");
  assert.doesNotThrow(() => UmlArtifact.validate("class", { valid: true, diagramType: "ClassDiagram" }));
  assert.throws(() => UmlArtifact.validate("class", { valid: false, errorMessage: "quebrado" }), /quebrado/);
  assert.throws(() => UmlArtifact.validate("class", { valid: true, diagramType: "StateDiagram" }), /não corresponde/);
});

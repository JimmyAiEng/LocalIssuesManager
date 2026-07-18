import assert from "node:assert/strict";
import test from "node:test";
import { ARTIFACT_TYPES } from "../../src/domain/artifacts/artifact.js";
import { DocumentArtifact } from "../../src/domain/artifacts/document_artifact.js";
import { MediaArtifact, MAX_MEDIA_SIZE } from "../../src/domain/artifacts/media_artifact.js";
import { RequirementArtifact } from "../../src/domain/artifacts/requirement_artifact.js";
import { UmlArtifact } from "../../src/domain/artifacts/uml_artifact.js";

const feature = "Feature: Login\n  Como um usuário\n  Eu quero poder entrar\n  Para que eu use\n\n  Scenario: ok\n    Given a tela\n    When entro\n    Then vejo";

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

test("RequirementArtifact representa os Requirements como conjunto de Features", () => {
  assert.deepEqual(RequirementArtifact.validate(JSON.stringify({ features: [feature] })),
    { features: [feature] });
});

test("UmlArtifact valida kind, sintaxe e tipo detectado", () => {
  assert.equal(UmlArtifact.parseKind("class"), "class");
  assert.doesNotThrow(() => UmlArtifact.validate("class", { valid: true, diagramType: "ClassDiagram" }));
  assert.throws(() => UmlArtifact.validate("class", { valid: false, errorMessage: "quebrado" }), /quebrado/);
  assert.throws(() => UmlArtifact.validate("class", { valid: true, diagramType: "StateDiagram" }), /não corresponde/);
});

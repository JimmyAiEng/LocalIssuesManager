import assert from "node:assert/strict";
import test from "node:test";
import { Artifact, ARTIFACT_TYPES, MAX_MEDIA_SIZE, validateArtifactContent } from "../../src/domain/artifact.js";
import { DomainError } from "../../src/domain/domain_error.js";
import type { Requirements } from "../../src/domain/requirements.js";

const feature = "Feature: Login\n  Como um usuário\n  Eu quero poder entrar\n  Para que eu use\n\n  Scenario: ok\n    Given a tela\n    When entro\n    Then vejo";

test("Artifact Types são o vocabulário unificado", () => {
  assert.deepEqual(ARTIFACT_TYPES, ["doc", "prd", "requirements", "design", "plan", "media"]);
});

test("Artifact media deriva metadata e aplica 25 MiB", () => {
  const artifact = Artifact.media({ issueId: "i", filename: "a.png", mediaType: "image/png", size: MAX_MEDIA_SIZE });
  assert.equal(artifact.type, "media");
  assert.equal(artifact.kind, "image");
  assert.throws(() => Artifact.media({ issueId: "i", filename: "a.png", mediaType: "image/png", size: MAX_MEDIA_SIZE + 1 }), /25MB/);
});

test("validador por tipo aplica brevidade e formatos estruturados", () => {
  const long = Array(301).fill("x").join(" ");
  assert.throws(() => validateArtifactContent("doc", long), /limite 300/);
  assert.throws(() => validateArtifactContent("design", long), /limite 300/);
  assert.doesNotThrow(() => validateArtifactContent("requirements", JSON.stringify({ features: [feature] })));
  assert.throws(() => validateArtifactContent("plan", "{}"), /objetivo/);
});

 test("Artifact textual cria metadata e serializa snapshot desacoplado", () => {
  const artifact = Artifact.text({ issueId: "i", type: "doc", name: "a.md", size: 3 }, new Date("2026-01-01"));
  const snapshot = artifact.toJSON();
  assert.equal(snapshot.created_at, "2026-01-01T00:00:00.000Z");
  snapshot.name = "outro.md";
  assert.equal(artifact.name, "a.md");
});

test("PRD exige Requirements e valida referências de Feature", () => {
  const prd = { visao: "v", requisitos_funcionais: ["f"], requisitos_nao_funcionais: ["n"],
    clusters: [{ name: "c", features: ["Login"] }] };
  assert.throws(() => validateArtifactContent("prd", JSON.stringify(prd)), /exige requisitos/);
  const requirements: Requirements = { features: [feature] };
  assert.doesNotThrow(() => validateArtifactContent("prd", JSON.stringify(prd), { requirements }));
});

test("Artifact rejeita metadata e mediaType inválidos", () => {
  assert.throws(() => Artifact.text({ issueId: "", type: "doc", name: "a.md", size: 1 }), DomainError);
  assert.throws(() => Artifact.media({ issueId: "i", filename: "a", mediaType: "x", size: 1 }), /Unsupported/);
});

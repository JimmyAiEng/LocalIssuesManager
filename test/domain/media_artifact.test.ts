import assert from "node:assert/strict";
import test from "node:test";
import { MediaArtifact, extForMediaType, MAX_MEDIA_SIZE, mediaTypeForExt } from "../../src/domain/artifacts/media_artifact.js";
import { DomainError } from "../../src/domain/domain_error.js";

const input = { filename: "prova.png", mediaType: "image/png", size: 1024 };

test("create deriva kind, gera id e carimba created_at", () => {
  const attachment = MediaArtifact.create(input, new Date("2026-01-01T00:00:00Z"));
  assert.match(attachment.id, /^[0-9a-f-]{36}$/);
  assert.equal(attachment.kind, "image");
  assert.equal(attachment.mediaType, "image/png");
  assert.equal(attachment.created_at, "2026-01-01T00:00:00.000Z");
});

test("create deriva kind video para mp4/webm", () => {
  assert.equal(MediaArtifact.create({ ...input, mediaType: "video/mp4" }).kind, "video");
  assert.equal(MediaArtifact.create({ ...input, mediaType: "video/webm" }).kind, "video");
});

test("create rejeita formato não suportado, filename vazio e tamanho inválido", () => {
  assert.throws(() => MediaArtifact.create({ ...input, mediaType: "application/pdf" }),
    (e: unknown) => e instanceof DomainError && e.message === "Unsupported mediaType: application/pdf");
  assert.throws(() => MediaArtifact.create({ ...input, filename: "  " }), /filename is required/);
  assert.throws(() => MediaArtifact.create({ ...input, size: 0 }), /size must be positive/);
});

test("create aceita exatamente 25MB e rejeita acima", () => {
  assert.equal(MediaArtifact.create({ ...input, size: MAX_MEDIA_SIZE }).size, MAX_MEDIA_SIZE);
  assert.throws(() => MediaArtifact.create({ ...input, size: MAX_MEDIA_SIZE + 1 }), /exceeds 25MB/);
});

test("mapa mediaType <-> extensão é reversível para os formatos aceitos", () => {
  for (const mediaType of ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"] as const) {
    assert.equal(mediaTypeForExt(extForMediaType(mediaType)), mediaType);
  }
  assert.equal(mediaTypeForExt("exe"), null);
});

test("toJSON serializa um snapshot desacoplado da entidade", () => {
  const attachment = MediaArtifact.create(input);
  const json = attachment.toJSON();
  json.filename = "outro.png";
  assert.equal(attachment.filename, input.filename); // mutar o JSON não afeta a entidade
});

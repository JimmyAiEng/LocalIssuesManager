import assert from "node:assert/strict";
import test from "node:test";
import { Attachment, extForMediaType, MAX_ATTACHMENT_SIZE, mediaTypeForExt } from "../../src/domain/attachment_entity.js";
import { DomainError } from "../../src/domain/domain_error.js";

const input = { filename: "prova.png", mediaType: "image/png", size: 1024 };

test("create deriva kind, gera id e carimba created_at", () => {
  const attachment = Attachment.create(input, new Date("2026-01-01T00:00:00Z"));
  assert.match(attachment.id, /^[0-9a-f-]{36}$/);
  assert.equal(attachment.kind, "image");
  assert.equal(attachment.mediaType, "image/png");
  assert.equal(attachment.created_at, "2026-01-01T00:00:00.000Z");
});

test("create deriva kind video para mp4/webm", () => {
  assert.equal(Attachment.create({ ...input, mediaType: "video/mp4" }).kind, "video");
  assert.equal(Attachment.create({ ...input, mediaType: "video/webm" }).kind, "video");
});

test("create rejeita formato não suportado, filename vazio e tamanho inválido", () => {
  assert.throws(() => Attachment.create({ ...input, mediaType: "application/pdf" }),
    (e: unknown) => e instanceof DomainError && e.message === "Unsupported mediaType: application/pdf");
  assert.throws(() => Attachment.create({ ...input, filename: "  " }), /filename is required/);
  assert.throws(() => Attachment.create({ ...input, size: 0 }), /size must be positive/);
});

test("create aceita exatamente 25MB e rejeita acima", () => {
  assert.equal(Attachment.create({ ...input, size: MAX_ATTACHMENT_SIZE }).size, MAX_ATTACHMENT_SIZE);
  assert.throws(() => Attachment.create({ ...input, size: MAX_ATTACHMENT_SIZE + 1 }), /exceeds 25MB/);
});

test("mapa mediaType <-> extensão é reversível para os formatos aceitos", () => {
  for (const mediaType of ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"] as const) {
    assert.equal(mediaTypeForExt(extForMediaType(mediaType)), mediaType);
  }
  assert.equal(mediaTypeForExt("exe"), null);
});

test("fromJSON e toJSON preservam o Attachment", () => {
  const attachment = Attachment.create(input);
  const clone = Attachment.fromJSON(attachment.toJSON());
  assert.deepEqual(clone.toJSON(), attachment.toJSON());
  assert.notEqual(clone, attachment);
});

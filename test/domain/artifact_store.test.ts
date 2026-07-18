import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MediaArtifact } from "../../src/domain/artifacts/media_artifact.js";
import { ArtifactStore } from "../../src/domain/artifacts/artifact_store.js";

const root = () => mkdtempSync(join(tmpdir(), "artifact-store-"));

test("ArtifactStore usa uma API para todos os tipos textuais", () => {
  const store = new ArtifactStore(root());
  store.writeText("p", { issueId: "i", type: "document" }, "# doc");
  store.writeText("p", { issueId: "i", type: "requirement" }, "{}");
  store.writeText("p", { issueId: "i", type: "uml", name: "class.puml" }, "@startuml\n@enduml");
  assert.equal(store.readText("p", { issueId: "i", type: "document" }), "# doc");
  assert.deepEqual(store.list("p", "i", "uml"), ["class.puml"]);
});

test("ArtifactStore sobrescreve singleton e codifica Projeto", () => {
  const store = new ArtifactStore(root());
  store.writeText("space / project", { issueId: "i", type: "requirement" }, "primeiro");
  store.writeText("space / project", { issueId: "i", type: "requirement" }, "segundo");
  assert.equal(store.readText("space / project", { issueId: "i", type: "requirement" }), "segundo");
});

test("ArtifactStore grava, encontra e remove media pela identidade", () => {
  const store = new ArtifactStore(root());
  const media = MediaArtifact.create({ issueId: "i", filename: "a.png", mediaType: "image/png", size: 3 });
  store.writeMedia("p", media, Buffer.from("png"));
  const found = store.findMedia(media.id)!;
  assert.equal(found.mediaType, "image/png");
  assert.equal(existsSync(found.path), true);
  store.purgeMedia("p", media.id, "image/png");
  assert.equal(store.findMedia(media.id), null);
});

test("ArtifactStore trata tipos ausentes e projetos dot-segment", () => {
  const store = new ArtifactStore(root());
  assert.deepEqual(store.list("p", "i", "media"), []);
  assert.deepEqual(store.list("p", "i", "document"), []);
  store.writeText(".", { issueId: "i", type: "document" }, "x");
  store.writeText("..", { issueId: "i", type: "document" }, "y");
  assert.equal(store.readText(".", { issueId: "i", type: "document" }), "x");
  assert.equal(store.readText("..", { issueId: "i", type: "document" }), "y");
});

test("purgeIssue remove todos os tipos pertencentes à Issue", () => {
  const store = new ArtifactStore(root());
  for (const type of ["document", "requirement", "implementation-plan"] as const) {
    store.writeText("p", { issueId: "i", type }, "x");
  }
  store.writeText("p", { issueId: "i", type: "uml", name: "class.puml" }, "x");
  store.purgeIssue("p", "i");
  for (const type of ["document", "requirement", "implementation-plan"] as const) {
    assert.equal(store.readText("p", { issueId: "i", type }), null);
  }
  assert.equal(store.readText("p", { issueId: "i", type: "uml", name: "class.puml" }), null);
});

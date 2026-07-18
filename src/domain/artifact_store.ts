import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Artifact, type ArtifactType, extForArtifactMedia, type MediaType, mediaTypeForArtifactExt } from "./artifact.js";
import { defaultRoot } from "./root.js";

export type ArtifactRef = { issueId: string; type: Exclude<ArtifactType, "media">; name?: string };
export type StoredMedia = { path: string; mediaType: MediaType };

export class ArtifactStore {
  readonly #root: string;
  constructor(root = defaultRoot()) { this.#root = root; }

  writeText(project: string, ref: ArtifactRef, content: string): void {
    const path = this.#textPath(project, ref);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content, "utf8");
  }

  readText(project: string, ref: ArtifactRef): string | null {
    const path = this.#textPath(project, ref);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }

  list(project: string, issueId: string, type: ArtifactType): string[] {
    if (type === "media") return [];
    if (type !== "design") return this.readText(project, { issueId, type }) === null ? [] : [defaultName(type)];
    const directory = this.#designDir(project, issueId);
    return existsSync(directory) ? readdirSync(directory) : [];
  }

  writeMedia(project: string, artifact: Pick<Artifact, "id" | "mediaType">, bytes: Buffer): void {
    if (!artifact.mediaType) throw new Error("media artifact required");
    const directory = join(this.#project(project), "attachments");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${artifact.id}.${extForArtifactMedia(artifact.mediaType)}`), bytes);
  }

  findMedia(id: string): StoredMedia | null {
    for (const project of this.#projects()) {
      const found = this.#findMediaIn(project, id);
      if (found) return found;
    }
    return null;
  }

  purgeIssue(project: string, issueId: string): void {
    rmSync(this.#textPath(project, { issueId, type: "doc" }), { force: true });
    rmSync(this.#textPath(project, { issueId, type: "requirements" }), { force: true });
    rmSync(this.#textPath(project, { issueId, type: "prd" }), { force: true });
    rmSync(this.#designDir(project, issueId), { recursive: true, force: true });
  }

  purgeMedia(project: string, id: string, mediaType: MediaType): void {
    rmSync(join(this.#project(project), "attachments", `${id}.${extForArtifactMedia(mediaType)}`), { force: true });
  }

  #textPath(project: string, ref: ArtifactRef): string {
    const base = this.#project(project);
    if (ref.type === "doc") return join(base, "artifacts", `${ref.issueId}.md`);
    if (ref.type === "requirements") return join(base, "requirements", `${ref.issueId}.json`);
    if (ref.type === "prd") return join(base, "prd", `${ref.issueId}.json`);
    if (ref.type === "plan") return join(this.#designDir(project, ref.issueId), "plan.json");
    return join(this.#designDir(project, ref.issueId), ref.name ?? "design.md");
  }

  #designDir(project: string, issueId: string): string { return join(this.#project(project), "design", issueId); }
  #project(project: string): string { return join(this.#root, "projects", projectSegment(project)); }

  #projects(): string[] {
    const directory = join(this.#root, "projects");
    return existsSync(directory) ? readdirSync(directory) : [];
  }

  #findMediaIn(project: string, id: string): StoredMedia | null {
    const directory = join(this.#root, "projects", project, "attachments");
    if (!existsSync(directory)) return null;
    const file = readdirSync(directory).find((name) => name.startsWith(`${id}.`));
    const mediaType = file && mediaTypeForArtifactExt(file.slice(file.lastIndexOf(".") + 1));
    return file && mediaType ? { path: join(directory, file), mediaType } : null;
  }
}

function projectSegment(project: string): string {
  const encoded = encodeURIComponent(project);
  return encoded === "." ? "%2E" : encoded === ".." ? "%2E%2E" : encoded;
}

function defaultName(type: Exclude<ArtifactType, "media">): string {
  if (type === "doc") return "artifact.md";
  if (type === "design") return "design.md";
  return `${type}.json`;
}

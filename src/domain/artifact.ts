import { randomUUID } from "node:crypto";
import { DomainError } from "./domain_error.js";
import { parseAndValidatePlan } from "./implementation_plan.js";
import { parseAndValidatePrd } from "./prd.js";
import { parseAndValidateRequirements, type Requirements } from "./requirements.js";
import { assertBrief } from "./value_objects.js";

export const ARTIFACT_TYPES = ["doc", "prd", "requirements", "design", "plan", "media"] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
export const MAX_MEDIA_SIZE = 26_214_400;

const MEDIA = {
  "image/jpeg": { kind: "image", ext: "jpg" }, "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" }, "image/gif": { kind: "image", ext: "gif" },
  "video/mp4": { kind: "video", ext: "mp4" }, "video/webm": { kind: "video", ext: "webm" },
} as const;

export type MediaType = keyof typeof MEDIA;
export type MediaKind = (typeof MEDIA)[MediaType]["kind"];
export type ArtifactData = {
  id: string; issueId: string; type: ArtifactType; name: string; mediaType?: MediaType;
  kind?: MediaKind; size: number; created_at: string;
};
export type ArtifactInput = { issueId: string; type: Exclude<ArtifactType, "media">; name: string; size: number };
export type MediaArtifactInput = { issueId: string; filename: string; mediaType: string; size: number };
export type ArtifactValidation = { requirements?: Requirements };

export class Artifact implements ArtifactData {
  id!: string; issueId!: string; type!: ArtifactType; name!: string; mediaType?: MediaType;
  kind?: MediaKind; size!: number; created_at!: string;

  private constructor(data: ArtifactData) { Object.assign(this, data); }

  static text(input: ArtifactInput, now = new Date()): Artifact {
    requiredMetadata(input.issueId, input.name, input.size);
    return new Artifact({ ...input, id: randomUUID(), created_at: now.toISOString() });
  }

  static media(input: MediaArtifactInput, now = new Date()): Artifact {
    requiredMetadata(input.issueId, input.filename, input.size);
    const media = MEDIA[input.mediaType as MediaType];
    if (!media) throw new DomainError(`Unsupported mediaType: ${input.mediaType}`);
    if (input.size > MAX_MEDIA_SIZE) throw new DomainError("Attachment exceeds 25MB");
    return new Artifact({ id: randomUUID(), issueId: input.issueId, type: "media", name: input.filename,
      mediaType: input.mediaType as MediaType, kind: media.kind, size: input.size, created_at: now.toISOString() });
  }

  toJSON(): ArtifactData { return structuredClone({ ...this }); }
}

export function validateArtifactContent(type: Exclude<ArtifactType, "media">, content: string,
  context: ArtifactValidation = {}): void {
  if (type === "doc" || type === "design") return assertBrief(content, type);
  if (type === "requirements") { parseAndValidateRequirements(content); return; }
  if (type === "plan") { parseAndValidatePlan(content); return; }
  if (!context.requirements) throw new DomainError("PRD exige requisitos Gherkin antes");
  parseAndValidatePrd(content, context.requirements);
}

export function extForArtifactMedia(mediaType: MediaType): string { return MEDIA[mediaType].ext; }

export function mediaTypeForArtifactExt(ext: string): MediaType | null {
  const found = Object.entries(MEDIA).find(([, value]) => value.ext === ext);
  return found ? found[0] as MediaType : null;
}

function requiredMetadata(issueId: string, name: string, size: number): void {
  if (!issueId.trim()) throw new DomainError("issueId is required");
  if (!name.trim()) throw new DomainError("filename is required");
  if (size <= 0) throw new DomainError("Attachment size must be positive");
}

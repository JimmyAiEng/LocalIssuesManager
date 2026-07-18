import { randomUUID } from "node:crypto";
import { DomainError } from "../domain_error.js";
import type { ArtifactData, ArtifactDefinition } from "./artifact.js";

export const MAX_MEDIA_SIZE = 26_214_400;
const MEDIA = {
  "image/jpeg": { kind: "image", ext: "jpg" }, "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" }, "image/gif": { kind: "image", ext: "gif" },
  "video/mp4": { kind: "video", ext: "mp4" }, "video/webm": { kind: "video", ext: "webm" },
} as const;

export type MediaType = keyof typeof MEDIA;
export type MediaKind = (typeof MEDIA)[MediaType]["kind"];
export type MediaArtifactData = ArtifactData & {
  type: "media"; filename: string; mediaType: MediaType; kind: MediaKind;
};
export type MediaArtifactInput = {
  issueId?: string; filename: string; mediaType: string; size: number;
};

class MediaArtifactEntity implements MediaArtifactData {
  readonly type = "media" as const;
  readonly id: string;
  readonly issueId: string;
  readonly name: string;
  readonly filename: string;
  readonly mediaType: MediaType;
  readonly kind: MediaKind;
  readonly size: number;
  readonly created_at: string;

  private constructor(input: MediaArtifactInput, now: Date) {
    const media = validateInput(input);
    this.id = randomUUID();
    this.issueId = input.issueId ?? "unassigned";
    this.name = input.filename;
    this.filename = input.filename;
    this.mediaType = input.mediaType as MediaType;
    this.kind = media.kind;
    this.size = input.size;
    this.created_at = now.toISOString();
  }

  static create(input: MediaArtifactInput, now = new Date()): MediaArtifactEntity {
    return new MediaArtifactEntity(input, now);
  }

  toJSON(): MediaArtifactData { return structuredClone({ ...this }); }
}

export type MediaArtifact = MediaArtifactData & { toJSON(): MediaArtifactData };
export const MediaArtifact = {
  type: "media" as const,
  create: MediaArtifactEntity.create,
} satisfies ArtifactDefinition;

export function extForMediaType(mediaType: MediaType): string { return MEDIA[mediaType].ext; }

export function mediaTypeForExt(ext: string): MediaType | null {
  const found = Object.entries(MEDIA).find(([, value]) => value.ext === ext);
  return found ? found[0] as MediaType : null;
}

function validateInput(input: MediaArtifactInput): (typeof MEDIA)[MediaType] {
  if (!input.filename.trim()) throw new DomainError("filename is required");
  if (input.size <= 0) throw new DomainError("Attachment size must be positive");
  const media = MEDIA[input.mediaType as MediaType];
  if (!media) throw new DomainError(`Unsupported mediaType: ${input.mediaType}`);
  if (input.size > MAX_MEDIA_SIZE) throw new DomainError("Attachment exceeds 25MB");
  return media;
}

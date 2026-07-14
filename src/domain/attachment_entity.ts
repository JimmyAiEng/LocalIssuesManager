import { randomUUID } from "node:crypto";
import { DomainError } from "./domain_error.js";

export const MAX_ATTACHMENT_SIZE = 26_214_400; // 25 MiB

const MEDIA: Record<string, { kind: "image" | "video"; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
};

export type MediaType = keyof typeof MEDIA;
export type AttachmentKind = "image" | "video";
export type CreateAttachment = { filename: string; mediaType: string; size: number };
export type AttachmentData = {
  id: string; filename: string; mediaType: MediaType;
  kind: AttachmentKind; size: number; created_at: string;
};

export function extForMediaType(mediaType: MediaType): string {
  return MEDIA[mediaType].ext;
}

export function mediaTypeForExt(ext: string): MediaType | null {
  const found = Object.entries(MEDIA).find(([, value]) => value.ext === ext);
  return found ? (found[0] as MediaType) : null;
}

export class Attachment implements AttachmentData {
  id!: string; filename!: string; mediaType!: MediaType;
  kind!: AttachmentKind; size!: number; created_at!: string;

  private constructor(data: AttachmentData) {
    Object.assign(this, data);
  }

  static create(input: CreateAttachment, now = new Date()): Attachment {
    if (!input.filename.trim()) throw new DomainError("filename is required");
    const media = MEDIA[input.mediaType];
    if (!media) throw new DomainError(`Unsupported mediaType: ${input.mediaType}`);
    if (input.size <= 0) throw new DomainError("Attachment size must be positive");
    if (input.size > MAX_ATTACHMENT_SIZE) throw new DomainError("Attachment exceeds 25MB");
    return new Attachment({
      id: randomUUID(), filename: input.filename, mediaType: input.mediaType as MediaType,
      kind: media.kind, size: input.size, created_at: now.toISOString(),
    });
  }

  static fromJSON(data: AttachmentData): Attachment {
    return new Attachment(structuredClone(data));
  }

  toJSON(): AttachmentData {
    return structuredClone({ ...this });
  }
}

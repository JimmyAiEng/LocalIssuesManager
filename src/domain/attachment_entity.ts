import {
  Artifact, type ArtifactData, extForArtifactMedia, MAX_MEDIA_SIZE,
  type MediaKind, type MediaType, mediaTypeForArtifactExt,
} from "./artifact.js";

export const MAX_ATTACHMENT_SIZE = MAX_MEDIA_SIZE;
export type { MediaType };
export type AttachmentKind = MediaKind;
export type CreateAttachment = { filename: string; mediaType: string; size: number; issueId?: string };
export type AttachmentData = {
  id: string; filename: string; mediaType: MediaType;
  kind: AttachmentKind; size: number; created_at: string;
};

export function extForMediaType(mediaType: MediaType): string { return extForArtifactMedia(mediaType); }
export function mediaTypeForExt(ext: string): MediaType | null { return mediaTypeForArtifactExt(ext); }

export class Attachment implements AttachmentData {
  id!: string; filename!: string; mediaType!: MediaType;
  kind!: AttachmentKind; size!: number; created_at!: string;

  private constructor(data: AttachmentData) { Object.assign(this, data); }

  static create(input: CreateAttachment, now = new Date()): Attachment {
    const artifact = Artifact.media({ issueId: input.issueId ?? "unassigned", ...input }, now);
    return new Attachment(toAttachmentData(artifact.toJSON()));
  }

  toJSON(): AttachmentData { return structuredClone({ ...this }); }
}

function toAttachmentData(data: ArtifactData): AttachmentData {
  return { id: data.id, filename: data.name, mediaType: data.mediaType!, kind: data.kind!,
    size: data.size, created_at: data.created_at };
}

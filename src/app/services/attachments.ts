import { MediaArtifact } from "../../domain/artifacts/media_artifact.js";

export type IncomingAttachment = { filename: string; mediaType: string; bytes: Buffer };
export type PersistableAttachment = { entity: MediaArtifact; bytes: Buffer };

// Cria (valida formato/tamanho) todos antes de gravar qualquer byte: evita blob órfão se um for inválido.
// Compartilhado por criação de Issue, comentário e devolução para OPEN.
export function persistableAttachments(files: IncomingAttachment[] | undefined, now?: Date): PersistableAttachment[] {
  return (files ?? []).map((file) => ({
    entity: MediaArtifact.create({ filename: file.filename, mediaType: file.mediaType, size: file.bytes.length }, now),
    bytes: file.bytes,
  }));
}

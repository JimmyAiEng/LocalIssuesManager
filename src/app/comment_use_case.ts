import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Attachment, mediaTypeForExt } from "../domain/attachment_entity.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { parseActor } from "../domain/value_objects.js";
import { loadRequiredIssue } from "./required_issue.js";

export type IncomingAttachment = { filename: string; mediaType: string; bytes: Buffer };

export function attachmentFromFile(path: string): IncomingAttachment {
  const mediaType = mediaTypeForExt(path.slice(path.lastIndexOf(".") + 1).toLowerCase());
  if (!mediaType) throw new Error(`Unsupported attachment extension: ${path}`);
  return { filename: basename(path), mediaType, bytes: readFileSync(path) };
}
export type CommentInput = {
  issueId: string; ticketId?: string; comment: string;
  attachments?: IncomingAttachment[]; actor: string; now?: Date;
};

export class CommentUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  execute(input: CommentInput): Issue {
    const actor = parseActor(input.actor);
    const issue = loadRequiredIssue(this.queue, input.issueId);
    // Cria (valida formato/tamanho) todos antes de gravar qualquer byte: evita blob órfão se um for inválido.
    const created = (input.attachments ?? []).map((file) => ({
      entity: Attachment.create({ filename: file.filename, mediaType: file.mediaType, size: file.bytes.length }, input.now),
      bytes: file.bytes,
    }));
    for (const { entity, bytes } of created) this.queue.writeAttachment(issue.project, entity, bytes);
    const attachments = created.map(({ entity }) => entity.toJSON());
    if (input.ticketId) issue.commentTicket(input.ticketId, actor, input.comment, attachments, input.now);
    else issue.comment(actor, input.comment, attachments, input.now);
    this.queue.save(issue);
    return issue;
  }
}

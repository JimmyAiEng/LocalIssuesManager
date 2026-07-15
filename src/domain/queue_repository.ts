import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AttachmentData, extForMediaType, type MediaType, mediaTypeForExt } from "./attachment_entity.js";
import { ConflictError, NotFoundError } from "./domain_error.js";
import { Issue, type IssueData } from "./issue_entity.js";
import { defaultRoot } from "./root.js";
import type { TicketData } from "./ticket_entity.js";
import type { IssueStatus, IssueType } from "./value_objects.js";

export type ListFilter = { status?: IssueStatus; project?: string; title?: string; type?: IssueType };
export type TicketTarget = { issue: Issue; ticket: TicketData };
const FOLDERS: Record<IssueStatus, string> = {
  OPEN: "open", CLAIMED: "claimed", "ON-GOING": "ongoing", AWAITING: "awaiting", CLOSED: "closed",
};

export class Queue {
  readonly #root: string;

  constructor(root = defaultRoot()) { this.#root = root; }

  save(issue: Issue): void {
    this.#ensureProject(issue.project);
    const previous = this.#findPath(issue.id);
    const destination = this.#path(issue.project, issue.status, issue.id);
    if (previous) this.#guard(previous, issue);
    if (previous && previous !== destination) renameSync(previous, destination);
    this.#write(destination, issue);
  }

  purgeClosed(now = new Date(), retentionDays = 7): string[] {
    const cutoff = now.getTime() - retentionDays * 86_400_000;
    const purged: string[] = [];
    for (const project of this.#projects()) {
      for (const file of this.#files(project, "CLOSED")) {
        const issue = this.#read(file);
        if (Date.parse(issue.status_changed_at) <= cutoff) {
          this.#purgeAttachments(issue);
          this.#purgeArtifacts(issue);
          rmSync(this.#requirementsPath(issue.project, issue.id), { force: true });
          rmSync(file, { force: true }); // corrida entre closes concorrentes: ignora arquivo já removido
          purged.push(issue.id);
        }
      }
    }
    return purged;
  }

  #purgeAttachments(issue: Issue): void {
    const threads = [issue.thread, ...issue.tickets.map((ticket) => ticket.thread)];
    for (const thread of threads) {
      for (const entry of thread) {
        for (const attachment of entry.attachments ?? []) {
          rmSync(this.#attachmentPath(issue.project, attachment), { force: true });
        }
      }
    }
  }

  // Artefatos .md são flat (fora das pastas de status, como attachments): keyed pelo id do dono.
  #purgeArtifacts(issue: Issue): void {
    for (const ownerId of [issue.id, ...issue.tickets.map((ticket) => ticket.id)]) {
      rmSync(this.#artifactPath(issue.project, ownerId), { force: true });
    }
  }

  #artifactPath(project: string, ownerId: string): string {
    return join(this.#root, "projects", projectSegment(project), "artifacts", `${ownerId}.md`);
  }

  writeArtifact(project: string, ownerId: string, content: string): void {
    const directory = join(this.#root, "projects", projectSegment(project), "artifacts");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${ownerId}.md`), content, "utf8");
  }

  readArtifact(project: string, ownerId: string): string | null {
    const path = this.#artifactPath(project, ownerId);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }

  // Requirements: JSON Gherkin da Issue, flat em requirements/<issueId>.json (keyed pela Issue).
  #requirementsPath(project: string, issueId: string): string {
    return join(this.#root, "projects", projectSegment(project), "requirements", `${issueId}.json`);
  }

  writeRequirements(project: string, issueId: string, content: string): void {
    const directory = join(this.#root, "projects", projectSegment(project), "requirements");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${issueId}.json`), content, "utf8");
  }

  readRequirements(project: string, issueId: string): string | null {
    const path = this.#requirementsPath(project, issueId);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }

  #attachmentPath(project: string, attachment: AttachmentData): string {
    return join(this.#root, "projects", projectSegment(project), "attachments",
      `${attachment.id}.${extForMediaType(attachment.mediaType)}`);
  }

  load(id: string): Issue | null {
    const file = this.#findPath(id);
    if (!file) return null;
    return Issue.fromJSON(JSON.parse(readFileSync(file, "utf8")) as IssueData);
  }

  loadRequired(id: string): Issue {
    const issue = this.load(id);
    if (!issue) throw new NotFoundError(`Issue not found: ${id}`);
    return issue;
  }

  list(filter: ListFilter = {}): Issue[] {
    const projects = filter.project ? [projectSegment(filter.project)] : this.#projects();
    const statuses = filter.status ? [filter.status] : Object.keys(FOLDERS) as IssueStatus[];
    return this.#readAll(projects, statuses).filter((issue) => matchesFilter(issue, filter));
  }

  oldestOpen(project?: string): Issue | null {
    const issues = this.list({ status: "OPEN", project });
    issues.sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at) || a.id.localeCompare(b.id));
    return issues[0] ?? null;
  }

  oldestOpenTicket(project?: string): TicketTarget | null {
    const targets = this.list({ status: "ON-GOING", project }).flatMap((issue) =>
      issue.readyTickets().map((ticket) => ({ issue, ticket: ticket.toJSON() })));
    targets.sort((a, b) => a.ticket.created_at.localeCompare(b.ticket.created_at) || a.ticket.id.localeCompare(b.ticket.id));
    return targets[0] ?? null;
  }

  writeAttachment(project: string, attachment: AttachmentData, bytes: Buffer): void {
    const directory = join(this.#root, "projects", projectSegment(project), "attachments");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${attachment.id}.${extForMediaType(attachment.mediaType)}`), bytes);
  }

  findAttachment(id: string): { path: string; mediaType: MediaType } | null {
    for (const project of this.#projects()) {
      const directory = join(this.#root, "projects", project, "attachments");
      if (!existsSync(directory)) continue;
      const file = readdirSync(directory).find((name) => name.startsWith(`${id}.`));
      const mediaType = file && mediaTypeForExt(file.slice(file.lastIndexOf(".") + 1));
      if (file && mediaType) return { path: join(directory, file), mediaType };
    }
    return null;
  }

  #guard(previous: string, issue: Issue): void {
    const disk = JSON.parse(readFileSync(previous, "utf8")) as IssueData;
    if (disk.revision !== issue.baseRevision || issue.revision === issue.baseRevision) {
      throw new ConflictError(`Stale Issue save: ${issue.id}`);
    }
  }

  #write(destination: string, issue: Issue): void {
    writeFileSync(destination, JSON.stringify(issue.toJSON(), null, 2));
    issue.baseRevision = issue.revision;
  }

  #readAll(projects: string[], statuses: IssueStatus[]): Issue[] {
    const issues: Issue[] = [];
    for (const project of projects) for (const status of statuses) {
      for (const file of this.#files(project, status)) issues.push(this.#read(file));
    }
    return issues;
  }

  #read(file: string): Issue {
    return Issue.fromJSON(JSON.parse(readFileSync(file, "utf8")) as IssueData);
  }

  #files(project: string, status: IssueStatus): string[] {
    const directory = join(this.#root, "projects", project, FOLDERS[status]);
    if (!existsSync(directory)) return [];
    return readdirSync(directory).filter((file) => file.endsWith(".json")).map((file) => join(directory, file));
  }

  #projects(): string[] {
    const directory = join(this.#root, "projects");
    return existsSync(directory) ? readdirSync(directory) : [];
  }

  #findPath(id: string): string | null {
    for (const project of this.#projects()) for (const status of Object.keys(FOLDERS) as IssueStatus[]) {
      const candidate = join(this.#root, "projects", project, FOLDERS[status], `${id}.json`);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  #ensureProject(project: string): void {
    for (const folder of Object.values(FOLDERS)) {
      mkdirSync(join(this.#root, "projects", projectSegment(project), folder), { recursive: true });
    }
  }

  #path(project: string, status: IssueStatus, id: string): string {
    return join(this.#root, "projects", projectSegment(project), FOLDERS[status], `${id}.json`);
  }
}

export function projectSegment(project: string): string {
  const encoded = encodeURIComponent(project);
  return encoded === "." ? "%2E" : encoded === ".." ? "%2E%2E" : encoded;
}

function matchesFilter(issue: Issue, filter: ListFilter): boolean {
  if (filter.project && issue.project !== filter.project) return false;
  if (filter.status && issue.status !== filter.status) return false;
  if (filter.type && issue.type !== filter.type) return false;
  return !filter.title || issue.title.toLowerCase().includes(filter.title.toLowerCase());
}

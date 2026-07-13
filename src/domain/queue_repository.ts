import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Issue, type IssueData } from "./issue_entity.js";
import type { Status, Tag } from "./value_objects.js";

export type ListFilter = { status?: Status; project?: string; title?: string; tag?: Tag };
const FOLDERS: Record<Status, string> = {
  OPEN: "open", CLAIMED: "claimed", AWAITING: "awaiting", CLOSED: "closed",
};

export class Queue {
  readonly #root: string;

  constructor(root = defaultRoot()) { this.#root = root; }

  save(issue: Issue): void {
    this.#ensureProject(issue.project);
    const previous = this.#findPath(issue.id);
    const destination = this.#path(issue.project, issue.status, issue.id);
    if (previous === destination) throw new Error(`Stale Issue save: ${issue.id}`);
    if (previous) this.#move(issue, previous, destination);
    else writeFileSync(destination, JSON.stringify(issue.toJSON(), null, 2));
  }

  load(id: string): Issue | null {
    const file = this.#findPath(id);
    if (!file) return null;
    return Issue.fromJSON(JSON.parse(readFileSync(file, "utf8")) as IssueData);
  }

  list(filter: ListFilter = {}): Issue[] {
    const projects = filter.project ? [projectSegment(filter.project)] : this.#projects();
    const statuses = filter.status ? [filter.status] : Object.keys(FOLDERS) as Status[];
    return this.#readAll(projects, statuses).filter((issue) => matches(issue, filter));
  }

  oldestOpen(project?: string): Issue | null {
    const issues = this.list({ status: "OPEN", project });
    issues.sort((a, b) => openOrder(a, b));
    return issues[0] ?? null;
  }

  #move(issue: Issue, previous: string, destination: string): void {
    this.#expectCurrent(previous, issue);
    execFileSync("mv", [previous, destination]);
    writeFileSync(destination, JSON.stringify(issue.toJSON(), null, 2));
  }

  #expectCurrent(previous: string, issue: Issue): void {
    const current = JSON.parse(readFileSync(previous, "utf8")) as IssueData;
    const expected = issue.phases.slice(0, -1);
    if (JSON.stringify(current.phases) !== JSON.stringify(expected)) {
      throw new Error(`Stale Issue save: ${issue.id}`);
    }
  }

  #readAll(projects: string[], statuses: Status[]): Issue[] {
    const issues: Issue[] = [];
    for (const project of projects) for (const status of statuses) {
      for (const file of this.#files(project, status)) issues.push(this.#read(file));
    }
    return issues;
  }

  #read(file: string): Issue {
    return Issue.fromJSON(JSON.parse(readFileSync(file, "utf8")) as IssueData);
  }

  #files(project: string, status: Status): string[] {
    const directory = join(this.#root, "projects", project, FOLDERS[status]);
    if (!existsSync(directory)) return [];
    return readdirSync(directory).filter((file) => file.endsWith(".json")).map((file) => join(directory, file));
  }

  #projects(): string[] {
    const directory = join(this.#root, "projects");
    return existsSync(directory) ? readdirSync(directory) : [];
  }

  #findPath(id: string): string | null {
    for (const project of this.#projects()) for (const status of Object.keys(FOLDERS) as Status[]) {
      const candidate = join(this.#root, "projects", project, FOLDERS[status], `${id}.json`);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  #ensureProject(project: string): void {
    for (const folder of Object.values(FOLDERS)) {
      execFileSync("mkdir", ["-p", join(this.#root, "projects", projectSegment(project), folder)]);
    }
  }

  #path(project: string, status: Status, id: string): string {
    return join(this.#root, "projects", projectSegment(project), FOLDERS[status], `${id}.json`);
  }
}

function openOrder(left: Issue, right: Issue): number {
  const timestamp = left.status_changed_at.localeCompare(right.status_changed_at);
  return timestamp || left.id.localeCompare(right.id);
}

function projectSegment(project: string): string {
  const encoded = encodeURIComponent(project);
  return encoded === "." ? "%2E" : encoded === ".." ? "%2E%2E" : encoded;
}

function matches(issue: Issue, filter: ListFilter): boolean {
  if (filter.project && issue.project !== filter.project) return false;
  if (filter.status && issue.status !== filter.status) return false;
  if (filter.tag && issue.tag !== filter.tag) return false;
  return !filter.title || issue.title.toLowerCase().includes(filter.title.toLowerCase());
}

function defaultRoot(): string {
  return process.env.ISSUES_ROOT ?? join(process.env.HOME ?? "~", "issues-manager");
}

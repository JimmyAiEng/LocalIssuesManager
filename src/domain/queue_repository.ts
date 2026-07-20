import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ArtifactStore } from "./artifacts/artifact_store.js";
import type { TextArtifactType } from "./artifacts/artifact.js";
import type { MediaArtifactData, MediaType } from "./artifacts/media_artifact.js";
import { ConflictError, NotFoundError } from "./domain_error.js";
import { Issue, type IssueData } from "./issue_entity.js";
import { defaultRoot } from "./root.js";
import type { IssueStatus, IssueType } from "./value_objects.js";

export type ListFilter = { status?: IssueStatus; project?: string; title?: string; type?: IssueType };
// Nível de preocupação do Projeto: piso de supervisão que governa autonomia e ordem de claim.
// LOW não muda nada; HIGH (fatias 2 e 3) impõe travas. Ausência na leitura = LOW (config legado).
export type ConcernLevel = "LOW" | "HIGH";
export const CONCERN_LEVELS: readonly ConcernLevel[] = ["LOW", "HIGH"];
// Projeto registrado: aponta o repositório git local. `repo` vai no prompt do agente; o issue-manager
// orquestra o harness, não executa checks. Configs antigos podem trazer campos extras (ex. `check`)
// ou faltar `concern`: a leitura ignora os extras e trata `concern` ausente como LOW.
export type ProjectConfig = { name: string; repo: string; concern: ConcernLevel };
const FOLDERS: Record<IssueStatus, string> = {
  OPEN: "open", CLAIMED: "claimed", AWAITING: "awaiting", APPROVED: "approved", CLOSED: "closed",
};

export class Queue {
  readonly #root: string;
  readonly artifacts: ArtifactStore;

  constructor(root = defaultRoot()) { this.#root = root; this.artifacts = new ArtifactStore(root); }

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
          this.purge(issue);
          purged.push(issue.id);
        }
      }
    }
    return purged;
  }

  // Apaga a Issue por completo: mídia, artefatos de texto (documento, requirements, design) e o JSON.
  purge(issue: Issue): void {
    for (const entry of issue.thread) for (const attachment of entry.attachments ?? []) {
      this.artifacts.purgeMedia(issue.project, attachment.id, attachment.mediaType);
    }
    this.artifacts.purgeIssue(issue.project, issue.id);
    const file = this.#findPath(issue.id);
    if (file) rmSync(file, { force: true }); // corrida entre closes concorrentes: ignora arquivo já removido
  }

  // Registro de projetos: project.json na pasta do projeto, criado por `issues project create`.
  writeProject(config: ProjectConfig): void {
    const directory = join(this.#root, "projects", projectSegment(config.name));
    for (const folder of Object.values(FOLDERS)) mkdirSync(join(directory, folder), { recursive: true });
    writeFileSync(join(directory, "project.json"), JSON.stringify(config, null, 2));
  }

  readProject(name: string): ProjectConfig | null {
    const path = join(this.#root, "projects", projectSegment(name), "project.json");
    return existsSync(path) ? readConfig(path) : null;
  }

  listProjects(): ProjectConfig[] {
    return this.#projects()
      .map((segment) => join(this.#root, "projects", segment, "project.json"))
      .filter((path) => existsSync(path))
      .map(readConfig);
  }

  // Compatibility façade: novos callers usam `queue.artifacts`; estes aliases preservam API local.
  writeArtifact(project: string, issueId: string, content: string): void {
    this.artifacts.writeText(project, { issueId, type: "document" }, content);
  }
  readArtifact(project: string, issueId: string): string | null {
    return this.artifacts.readText(project, { issueId, type: "document" });
  }
  writeDesign(project: string, issueId: string, name: string, content: string): void {
    this.artifacts.writeText(project, { issueId, type: designArtifactType(name), name }, content);
  }
  readDesign(project: string, issueId: string, name: string): string | null {
    return this.artifacts.readText(project, { issueId, type: designArtifactType(name), name });
  }
  listDesign(project: string, issueId: string): string[] { return this.artifacts.list(project, issueId, "uml"); }
  writeRequirements(project: string, issueId: string, content: string): void {
    this.artifacts.writeText(project, { issueId, type: "requirement" }, content);
  }
  readRequirements(project: string, issueId: string): string | null {
    return this.artifacts.readText(project, { issueId, type: "requirement" });
  }
  writeAttachment(project: string, attachment: MediaArtifactData, bytes: Buffer): void {
    this.artifacts.writeMedia(project, attachment, bytes);
  }
  findAttachment(id: string): { path: string; mediaType: MediaType } | null { return this.artifacts.findMedia(id); }

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

  // Elegível para claim = OPEN ou APPROVED: a aprovada reentra na fila para o handoff continuar.
  oldestOpen(project?: string): Issue | null {
    const issues = [...this.list({ status: "OPEN", project }), ...this.list({ status: "APPROVED", project })];
    issues.sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at) || a.id.localeCompare(b.id));
    return issues[0] ?? null;
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

// Config legado (sem `concern`) lê como LOW: concern é piso de supervisão, ausência = o mínimo.
function readConfig(path: string): ProjectConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as { name: string; repo: string; concern?: ConcernLevel };
  return { name: raw.name, repo: raw.repo, concern: raw.concern ?? "LOW" };
}

function designArtifactType(name: string): TextArtifactType {
  if (name === "plan.json") return "implementation-plan";
  return name.endsWith(".puml") ? "uml" : "document";
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

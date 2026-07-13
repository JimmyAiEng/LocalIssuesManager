import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESSES = ["claude-code", "cursor", "codex", "pi"] as const;
type Harness = (typeof HARNESSES)[number];
const PACK_MARKER = "<!-- issues-local pack";
const SKILLS_DIRECTORY = join(".agents", "skills");

export type InitInput = { harness?: string; target?: string; force?: boolean };
export type InitResult = { pack_version: string; installed: string[]; notes: string[] };

export class InitPackUseCase {
  readonly #packRoot: string;

  constructor(packRoot = defaultPackRoot()) { this.#packRoot = packRoot; }

  execute(input: InitInput = {}): InitResult {
    const target = input.target ?? process.cwd();
    const result: InitResult = { pack_version: packVersion(this.#packRoot), installed: [], notes: [] };
    this.#installAgentsFile(target, result, Boolean(input.force));
    this.#installSkills(target, result);
    for (const harness of parseHarnesses(input.harness)) wireHarness(harness, target, result);
    return result;
  }

  #installAgentsFile(target: string, result: InitResult, force: boolean): void {
    const destination = join(target, "AGENTS.md");
    if (existsSync(destination) && !force && !readFileSync(destination, "utf8").startsWith(PACK_MARKER)) {
      throw new Error("AGENTS.md already exists and is not managed by this pack; use --force to overwrite");
    }
    const body = readFileSync(join(this.#packRoot, "AGENTS.md"), "utf8");
    writeFileSync(destination, `${PACK_MARKER} v${result.pack_version} -->\n${body}`);
    result.installed.push(destination);
  }

  #installSkills(target: string, result: InitResult): void {
    const destination = join(target, SKILLS_DIRECTORY);
    cpSync(join(this.#packRoot, "skills"), destination, { recursive: true, force: true, filter: isSkillFile });
    result.installed.push(destination);
  }
}

function isSkillFile(source: string): boolean {
  return !["README.md", "INSTALL.md"].includes(basename(source));
}

function parseHarnesses(harness?: string): readonly Harness[] {
  if (!harness || harness === "all") return HARNESSES;
  if ((HARNESSES as readonly string[]).includes(harness)) return [harness as Harness];
  throw new Error(`--harness must be one of: ${HARNESSES.join("|")}|all`);
}

function wireHarness(harness: Harness, target: string, result: InitResult): void {
  if (harness === "codex") result.notes.push("codex: lê .agents/skills e AGENTS.md nativamente");
  if (harness === "pi") result.notes.push("pi: aponte o path de skills para .agents/skills");
  if (harness === "cursor") linkSkills(target, ".cursor", result);
  if (harness === "claude-code") {
    linkSkills(target, ".claude", result);
    ensureClaudeFile(target, result);
  }
}

function linkSkills(target: string, harnessDirectory: string, result: InitResult): void {
  const link = join(target, harnessDirectory, "skills");
  mkdirSync(join(target, harnessDirectory), { recursive: true });
  if (existsSync(link)) return void result.notes.push(`${harnessDirectory}/skills já existe; mantido`);
  try {
    symlinkSync(join("..", SKILLS_DIRECTORY), link, "junction");
  } catch {
    cpSync(join(target, SKILLS_DIRECTORY), link, { recursive: true });
    result.notes.push(`${harnessDirectory}/skills copiado (symlink indisponível)`);
  }
  result.installed.push(link);
}

function ensureClaudeFile(target: string, result: InitResult): void {
  const destination = join(target, "CLAUDE.md");
  if (existsSync(destination)) {
    if (!readFileSync(destination, "utf8").includes("AGENTS.md")) {
      result.notes.push("claude-code: adicione '@AGENTS.md' ao CLAUDE.md existente");
    }
    return;
  }
  writeFileSync(destination, "@AGENTS.md\n");
  result.installed.push(destination);
}

function packVersion(packRoot: string): string {
  const manifest = join(packRoot, "package.json");
  if (!existsSync(manifest)) return "0.0.0";
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version?: string }).version ?? "0.0.0";
}

function defaultPackRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth++) {
    if (existsSync(join(directory, "AGENTS.md")) && existsSync(join(directory, "skills"))) return directory;
    directory = dirname(directory);
  }
  throw new Error("Pack root not found (expected AGENTS.md + skills/)");
}

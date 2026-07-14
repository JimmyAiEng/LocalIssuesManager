import {
  cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync,
  rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESSES = ["claude-code", "cursor", "codex", "pi"] as const;
type Harness = (typeof HARNESSES)[number];
const PACK_MARKER = "<!-- issues-local pack";
const SKILLS_DIRECTORY = join(".agents", "skills");
/** Relative from `<harnessDir>/skills` → `.agents/skills`. */
const CANONICAL_SKILLS_LINK = join("..", SKILLS_DIRECTORY);

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
    const source = join(this.#packRoot, "skills");
    const destination = join(target, SKILLS_DIRECTORY);
    if (samePath(source, destination)) {
      result.notes.push(".agents/skills já aponta para o pack source (dogfood); cópia pulada");
      result.installed.push(destination);
      return;
    }
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true, force: true, filter: isSkillFile });
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
  if (harness === "codex") {
    linkSkills(target, ".codex", result);
    result.notes.push("codex: .codex/skills → .agents/skills (também lê .agents/skills nativamente)");
  }
  if (harness === "pi") {
    linkSkills(target, ".pi", result);
    result.notes.push("pi: .pi/skills → .agents/skills (também lê .agents/skills após trust do projeto)");
  }
  if (harness === "cursor") {
    linkSkills(target, ".cursor", result);
    result.notes.push("cursor: .cursor/skills → .agents/skills (também lê .agents/skills nativamente)");
  }
  if (harness === "claude-code") {
    linkSkills(target, ".claude", result);
    ensureClaudeFile(target, result);
  }
}

function linkSkills(target: string, harnessDirectory: string, result: InitResult): void {
  const link = join(target, harnessDirectory, "skills");
  mkdirSync(join(target, harnessDirectory), { recursive: true });
  if (existsSync(link) || isSymlink(link)) {
    if (isExpectedSkillsLink(link)) {
      result.notes.push(`${harnessDirectory}/skills já aponta para .agents/skills`);
      return;
    }
    result.notes.push(`${harnessDirectory}/skills já existe e não é o link do pack; mantido`);
    return;
  }
  try {
    symlinkSync(CANONICAL_SKILLS_LINK, link, "junction");
  } catch {
    cpSync(join(target, SKILLS_DIRECTORY), link, { recursive: true });
    result.notes.push(`${harnessDirectory}/skills copiado (symlink indisponível)`);
  }
  result.installed.push(link);
}

function isExpectedSkillsLink(link: string): boolean {
  try {
    if (!lstatSync(link).isSymbolicLink()) return false;
    const pointing = readlinkSync(link);
    return pointing === CANONICAL_SKILLS_LINK || pointing.replace(/\\/g, "/") === CANONICAL_SKILLS_LINK.replace(/\\/g, "/");
  } catch {
    return false;
  }
}

function isSymlink(path: string): boolean {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
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

function samePath(a: string, b: string): boolean {
  try {
    if (!existsSync(a) || !existsSync(b)) return resolve(a) === resolve(b);
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
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

/**
 * Recria os links de discovery no pack source (ou `--target`):
 * `skills/` → `.agents/skills` → `.cursor|.claude|.pi|.codex/skills`.
 * Não toca em AGENTS.md. Use no repo WorkflowDev: `issues init --dogfood`.
 */
export function linkPackSkillsForDogfood(repoRoot = defaultPackRoot()): string[] {
  const created: string[] = [];
  const agentsSkills = join(repoRoot, SKILLS_DIRECTORY);
  mkdirSync(dirname(agentsSkills), { recursive: true });
  ensureSymlink(join("..", "skills"), agentsSkills, created);
  for (const harnessDirectory of [".cursor", ".claude", ".pi", ".codex"]) {
    const link = join(repoRoot, harnessDirectory, "skills");
    mkdirSync(dirname(link), { recursive: true });
    ensureSymlink(CANONICAL_SKILLS_LINK, link, created);
  }
  return created;
}

function ensureSymlink(relativeTarget: string, linkPath: string, created: string[]): void {
  if (isExpectedLink(linkPath, relativeTarget)) return;
  if (existsSync(linkPath) || isSymlink(linkPath)) rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(relativeTarget, linkPath, "junction");
  created.push(`${relative(process.cwd(), linkPath) || linkPath} → ${relativeTarget}`);
}

function isExpectedLink(linkPath: string, relativeTarget: string): boolean {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return false;
    const pointing = readlinkSync(linkPath).replace(/\\/g, "/");
    return pointing === relativeTarget.replace(/\\/g, "/");
  } catch {
    return false;
  }
}

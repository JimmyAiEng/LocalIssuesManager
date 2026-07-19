import { initPack, linkPackSkillsForDogfood } from "./app/services/use_cases/init_pack_use_case.js";
import {
  addComment, artifactFromFile, assertNotOpen, attachmentFromFile, createIssue, decideIssue, getIssue,
  type IncomingAttachment, type IssueView, listIssues, nextIssue, relateIssues, resetClaim,
  setArtifact, statusIssue, updateTags,
} from "./app/services/use_cases/issue_use_cases.js";
import { decomposeIssue } from "./app/services/use_cases/decomposition_use_cases.js";
import { createProject, listProjects } from "./app/services/use_cases/project_use_cases.js";
import { getPlan, setPlan } from "./app/services/use_cases/plan_use_cases.js";
import { composePrompt } from "./app/services/use_cases/prompt_composition.js";
import { getRequirements, setRequirements } from "./app/services/use_cases/requirements_use_cases.js";
import { printDesignPackage, reportCliError, runDesign } from "./cli_design.js";
import { openBrowser, startWebServer } from "./web/server.js";

type Options = Record<string, string | boolean | string[]>;
type Result = object | object[] | null;

export function main(argv = process.argv.slice(2)): void | Promise<void> {
  try {
    const [command, ...raw] = argv;
    if (command === "project") return void runProject(raw);
    if (command === "requirements") return void runRequirements(raw);
    if (command === "plan") return void runPlan(raw);
    if (command === "design") return void runDesign(raw);
    if (command === "get" && raw[0] && !raw[0].startsWith("--")) raw.unshift("--target"); // get DESIGN|REQUIREMENTS posicional
    const options = parseOptions(raw);
    if (command === "web") return void launchWeb(options);
    if (command === "next" && options.prompt) return void nextPrompt(options);
    if (command === "get") assertNotOpen(value(options, "id")); // OPEN só pelo claim de `next`, com o contrato da action junto
    if (command === "get" && options.target === "DESIGN") return void printDesignPackage(value(options, "id"), Boolean(options.pretty));
    if (command === "status") return runStatus(options); // async pelo gate da action
    print(execute(command, options), Boolean(options.pretty));
  } catch (error) {
    reportCliError(error);
  }
}

// Gates de conclusão (requirements/design/check) falham como DomainError; DesignGateError
// sai como JSON {"errors":[...]}.
async function runStatus(options: Options): Promise<void> {
  try {
    print(await status(options), Boolean(options.pretty));
  } catch (error) {
    reportCliError(error);
  }
}

function runProject(raw: string[]): void {
  const options = parseOptions(raw.slice(1));
  print(project(raw[0], options), Boolean(options.pretty));
}

function project(sub: string | undefined, options: Options): Result {
  if (sub === "create") return createProject({ name: value(options, "name"), repo: value(options, "repo") });
  if (sub === "list") return listProjects();
  throw new Error("Usage: issues project <create|list> [--name <n> --repo <path>]");
}

function runRequirements(raw: string[]): void {
  const options = parseOptions(raw.slice(1));
  print(requirements(raw[0], options), Boolean(options.pretty));
}

function requirements(sub: string | undefined, options: Options): Result {
  if (sub === "set") return setRequirements({ issueId: value(options, "id"), file: value(options, "file") });
  throw new Error("Usage: issues requirements set --id <issueId> --file <req.jsonl>");
}

function runPlan(raw: string[]): void {
  const options = parseOptions(raw.slice(1));
  print(plan(raw[0], options), Boolean(options.pretty));
}

function plan(sub: string | undefined, options: Options): Result {
  if (sub === "set") return setPlan({ issueId: value(options, "id"), file: value(options, "file") });
  throw new Error("Usage: issues plan set --id <issueId> --file <plan.json>");
}

function execute(command: string | undefined, options: Options): Result {
  if (command === "create") return create(options);
  if (command === "next") return next(options);
  if (command === "comment") return comment(options);
  if (command === "tag") return tag(options);
  if (command === "decide") return decide(options);
  if (command === "reset") return reset(options);
  if (command === "relate") return relate(options);
  if (command === "decompose") return decompose(options);
  if (command === "get") return get(options);
  if (command === "list") return list(options);
  if (command === "artifact") return issueArtifact(options);
  if (command === "init") return init(options);
  throw new Error("Usage: issues <create|next|comment|tag|status|decide|reset|relate|decompose|get|list|artifact|requirements|plan|design|project|web|init> [flags]");
}

function create(options: Options): Result {
  const actor = actorFrom(options);
  return createIssue({ title: value(options, "title"),
    project: value(options, "project"), type: value(options, "type"), action: value(options, "action"),
    problem: value(options, "problem"), acceptance_criteria: optional(options, "acceptance-criteria"),
    artifact: artifactFile(options), relates: optionalList(options, "relates"),
    complexity: optional(options, "complexity"), human_need: optional(options, "human-need"),
    risk: optional(options, "risk"), attachments: readAttachments(options), actor }).toJSON();
}

function issueArtifact(options: Options): Result {
  const id = value(options, "id");
  setArtifact({ issueId: id, content: artifactFromFile(value(options, "file")), name: optional(options, "name") });
  return { ok: true, id };
}

// Lê o conteúdo do Artefato .md de --artifact-file (nome distinto do flag legado, string livre).
function artifactFile(options: Options): string | undefined {
  const path = optional(options, "artifact-file");
  return path ? artifactFromFile(path) : undefined;
}

function next(options: Options): Result {
  return claimNext(options); // view pronta (com artefato e relacionadas); só imprime
}

function claimNext(options: Options): IssueView | null {
  const id = optional(options, "id");
  const project = id ? optional(options, "project") : value(options, "project");
  return nextIssue({ agent: value(options, "agent"), project, id });
}

function nextPrompt(options: Options): void {
  const result = claimNext(options);
  process.stdout.write(result ? `${composePrompt(result)}\n` : "");
}

function comment(options: Options): Result {
  const actor = actorFrom(options);
  return addComment({ issueId: value(options, "id"),
    comment: optional(options, "comment") ?? "", attachments: readAttachments(options), actor,
    role: optional(options, "role") }).toJSON();
}

function tag(options: Options): Result {
  return updateTags({ issueId: value(options, "id"), actor: actorFrom(options),
    complexity: optional(options, "complexity"), human_need: optional(options, "human-need"),
    risk: optional(options, "risk") }).toJSON();
}

async function status(options: Options): Promise<Result> {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const agent = options.human ? undefined : value(options, "agent");
  return (await statusIssue({ id: value(options, "id"), agent,
    human: Boolean(options.human), status: value(options, "status"),
    comment: value(options, "comment"), closed_reason: optional(options, "reason"),
    role: optional(options, "role") })).toJSON();
}

function decide(options: Options): Result {
  return decideIssue({ id: value(options, "id"),
    human: Boolean(options.human), status: value(options, "status"),
    comment: value(options, "comment"), closed_reason: optional(options, "reason") }).toJSON();
}

function reset(options: Options): Result {
  return resetClaim({ id: value(options, "id"),
    human: Boolean(options.human), comment: value(options, "comment") }).toJSON();
}

function relate(options: Options): Result {
  const relates = optionalList(options, "relates");
  if (!relates?.length) throw new Error("--relates is required (ids separados por vírgula)");
  return relateIssues({ id: value(options, "id"), relates, kind: optional(options, "kind") }).toJSON();
}

// Fan-out: cria as filhas descritas em --into (JSON { mode, children }); o actor é quem decompõe.
function decompose(options: Options): Result {
  return decomposeIssue({ issueId: value(options, "id"), file: value(options, "into"), actor: actorFrom(options) });
}

function get(options: Options): Result {
  const id = value(options, "id");
  const target = optional(options, "target");
  if (target === "REQUIREMENTS") return getRequirements({ issueId: id });
  if (target === "PLAN") return getPlan({ issueId: id });
  return getIssue(id); // IssueView pronta (com artefato e relacionadas)
}

function list(options: Options): Result {
  return listIssues({ status: optional(options, "status"),
    project: optional(options, "project"), title: optional(options, "title"), type: optional(options, "type") });
}

function init(options: Options): Result {
  if (options.dogfood) {
    return { linked: linkPackSkillsForDogfood(optional(options, "target")) };
  }
  return initPack({ harness: optional(options, "harness"),
    target: optional(options, "target"), force: Boolean(options.force) });
}

function parseOptions(args: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const name = key.slice(2);
    if (["human", "pretty", "no-open", "force", "dogfood", "prompt"].includes(name)) options[name] = true;
    else if (name === "attach") {
      options.attach = (options.attach as string[] | undefined) ?? [];
      (options.attach as string[]).push(args[++index] ?? "");
    }
    else options[name] = args[++index] ?? "";
  }
  return options;
}

function readAttachments(options: Options): IncomingAttachment[] {
  const paths = Array.isArray(options.attach) ? options.attach : [];
  return paths.map(attachmentFromFile);
}

function actorFrom(options: Options): string {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  return options.human ? "human" : value(options, "agent");
}

function value(options: Options, name: string): string {
  const result = options[name];
  if (typeof result !== "string" || !result.trim()) throw new Error(`--${name} is required`);
  return result;
}

function optional(options: Options, name: string): string | undefined {
  const result = options[name];
  return typeof result === "string" && result ? result : undefined;
}

function optionalList(options: Options, name: string): string[] | undefined {
  const raw = optional(options, name);
  return raw?.split(",").map((item) => item.trim()).filter(Boolean);
}

function optionalNumber(options: Options, name: string): number | undefined {
  const raw = optional(options, name);
  if (raw === undefined) return undefined;
  const result = Number(raw);
  if (!Number.isInteger(result) || result < 0) throw new Error(`--${name} must be a non-negative integer`);
  return result;
}

function print(result: Result, pretty: boolean): void {
  process.stdout.write(`${JSON.stringify(result, null, pretty ? 2 : 0)}\n`);
}

async function launchWeb(options: Options): Promise<void> {
  try {
    const web = await startWebServer(optionalNumber(options, "port"));
    process.stdout.write(`Issues web disponível em ${web.url}\n`);
    if (!options["no-open"]) openBrowser(web.url);
  } catch (error) {
    reportCliError(error);
  }
}

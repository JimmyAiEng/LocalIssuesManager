import { initPack, linkPackSkillsForDogfood } from "./app/init_pack_use_case.js";
import {
  addComment, addWorktree, artifactFromFile, attachmentFromFile, createIssue, decideIssue, getIssue,
  type IncomingAttachment, listIssues, nextIssue, type NextResult, removeWorktree, resetClaim,
  setArtifact, statusIssue, updateTags,
} from "./app/issue_use_cases.js";
import { composePrompt } from "./app/prompt_composition.js";
import { getRequirements, setRequirements } from "./app/requirements_use_cases.js";
import { claimTicket, createTicket, decideTicket, getTicket, listTickets, statusTicket } from "./app/ticket_use_cases.js";
import { openBrowser, startWebServer } from "./web/server.js";

type Options = Record<string, string | boolean | string[]>;
type Result = object | object[] | null;

export function main(argv = process.argv.slice(2)): void {
  try {
    const [command, ...raw] = argv;
    if (command === "ticket") return void runTicket(raw);
    if (command === "worktree") return void runWorktree(raw);
    if (command === "requirements") return void runRequirements(raw);
    const options = parseOptions(raw);
    if (command === "web") return void launchWeb(options);
    if (command === "next" && options.prompt) return void nextPrompt(options);
    print(execute(command, options), Boolean(options.pretty));
  } catch (error) {
    reportError(error);
  }
}

function runTicket(raw: string[]): void {
  const options = parseOptions(raw.slice(1));
  print(ticket(raw[0], options), Boolean(options.pretty));
}

function runWorktree(raw: string[]): void {
  const options = parseOptions(raw.slice(1));
  print(worktree(raw[0], options), Boolean(options.pretty));
}

function worktree(sub: string | undefined, options: Options): Result {
  if (sub === "add") return addWorktree({ issueId: value(options, "id"), path: optional(options, "path") }).toJSON();
  if (sub === "remove") return removeWorktree({ issueId: value(options, "id") }).toJSON();
  throw new Error("Usage: issues worktree <add|remove> --id <issueId> [--path <p>]");
}

function runRequirements(raw: string[]): void {
  const options = parseOptions(raw.slice(1));
  print(requirements(raw[0], options), Boolean(options.pretty));
}

function requirements(sub: string | undefined, options: Options): Result {
  if (sub === "set") return setRequirements({ issueId: value(options, "id"), file: value(options, "file") });
  throw new Error("Usage: issues requirements set --id <issueId> --file <req.json>");
}

function execute(command: string | undefined, options: Options): Result {
  if (command === "create") return create(options);
  if (command === "next") return next(options);
  if (command === "comment") return comment(options);
  if (command === "tag") return tag(options);
  if (command === "status") return status(options);
  if (command === "decide") return decide(options);
  if (command === "reset") return reset(options);
  if (command === "get") return get(options);
  if (command === "list") return list(options);
  if (command === "artifact") return issueArtifact(options);
  if (command === "init") return init(options);
  throw new Error("Usage: issues <create|next|comment|tag|status|decide|reset|get|list|artifact|requirements|ticket|worktree|web|init> [flags]");
}

function ticket(sub: string | undefined, options: Options): Result {
  if (sub === "create") return ticketCreate(options);
  if (sub === "claim") return ticketClaim(options);
  if (sub === "comment") return ticketComment(options);
  if (sub === "tag") return ticketTag(options);
  if (sub === "status") return ticketStatus(options);
  if (sub === "decide") return ticketDecide(options);
  if (sub === "get") return ticketGet(options);
  if (sub === "list") return ticketList(options);
  if (sub === "artifact") return ticketArtifact(options);
  throw new Error("Usage: issues ticket <create|claim|comment|tag|status|decide|get|list|artifact> [flags]");
}

function create(options: Options): Result {
  const actor = actorFrom(options);
  return createIssue({ title: value(options, "title"),
    project: value(options, "project"), type: value(options, "type"),
    problem: value(options, "problem"), artifacts: optional(options, "artifacts"),
    acceptance_criteria: optional(options, "acceptance-criteria"), artifact: artifactFile(options), actor }).toJSON();
}

function issueArtifact(options: Options): Result {
  const id = value(options, "id");
  setArtifact({ issueId: id, content: artifactFromFile(value(options, "file")) });
  return { ok: true, id };
}

function ticketArtifact(options: Options): Result {
  const id = value(options, "id");
  setArtifact({ issueId: value(options, "issue"), ticketId: id, content: artifactFromFile(value(options, "file")) });
  return { ok: true, id };
}

// Lê o conteúdo do Artefato .md de --artifact-file (nome distinto de --artifacts legado, string livre).
function artifactFile(options: Options): string | undefined {
  const path = optional(options, "artifact-file");
  return path ? artifactFromFile(path) : undefined;
}

function next(options: Options): Result {
  return claimNext(options); // views prontas (issue+ticket com artefatos); só imprime
}

function claimNext(options: Options): NextResult | null {
  const id = optional(options, "id");
  const project = id ? optional(options, "project") : value(options, "project");
  return nextIssue({ agent: value(options, "agent"), project, id });
}

function nextPrompt(options: Options): void {
  const result = claimNext(options);
  process.stdout.write(result ? `${composePrompt(result.issue, result.ticket)}\n` : "");
}

function comment(options: Options): Result {
  const actor = actorFrom(options);
  return addComment({ issueId: value(options, "id"),
    comment: optional(options, "comment") ?? "", attachments: readAttachments(options), actor }).toJSON();
}

function tag(options: Options): Result {
  return updateTags({ issueId: value(options, "id"),
    complexity: optional(options, "complexity"), human_need: optional(options, "human-need"),
    risk: optional(options, "risk") }).toJSON();
}

function status(options: Options): Result {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const agent = options.human ? undefined : value(options, "agent");
  return statusIssue({ id: value(options, "id"), agent,
    human: Boolean(options.human), status: value(options, "status"),
    comment: value(options, "comment"), closed_reason: optional(options, "reason") }).toJSON();
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

function get(options: Options): Result {
  const id = value(options, "id");
  if (optional(options, "target") === "REQUIREMENTS") return getRequirements({ issueId: id });
  return getIssue(id); // IssueView pronta (com artifact)
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

function ticketCreate(options: Options): Result {
  const actor = actorFrom(options);
  return createTicket({ issueId: value(options, "issue"),
    type: value(options, "type"), objective: value(options, "objective"), task: value(options, "task"),
    acceptance_criteria: value(options, "acceptance-criteria"), artifacts: optional(options, "artifacts"),
    references: optional(options, "references"), depends_on: optionalList(options, "depends-on"),
    human_need: optional(options, "human-need"), artifact: artifactFile(options), actor }).toJSON();
}

function ticketClaim(options: Options): Result {
  const actor = actorFrom(options);
  return claimTicket({ issueId: value(options, "issue"), ticketId: value(options, "id"), actor }).toJSON();
}

function ticketComment(options: Options): Result {
  const actor = actorFrom(options);
  return addComment({ issueId: value(options, "issue"), ticketId: value(options, "id"),
    comment: optional(options, "comment") ?? "", attachments: readAttachments(options), actor }).toJSON();
}

function ticketTag(options: Options): Result {
  return updateTags({ issueId: value(options, "issue"), ticketId: value(options, "id"),
    complexity: optional(options, "complexity"), human_need: optional(options, "human-need"),
    risk: optional(options, "risk") }).toJSON();
}

function ticketStatus(options: Options): Result {
  const actor = actorFrom(options);
  return statusTicket({ issueId: value(options, "issue"),
    ticketId: value(options, "id"), actor, status: value(options, "status"),
    comment: value(options, "comment"), closed_reason: optional(options, "reason"), last: Boolean(options.last) }).toJSON();
}

function ticketDecide(options: Options): Result {
  return decideTicket({ issueId: value(options, "issue"),
    ticketId: value(options, "id"), human: Boolean(options.human), status: value(options, "status"),
    comment: value(options, "comment"), closed_reason: optional(options, "reason"), last: Boolean(options.last) }).toJSON();
}

function ticketGet(options: Options): Result {
  return getTicket({ issueId: value(options, "issue"), ticketId: value(options, "id") }); // TicketView pronta
}

function ticketList(options: Options): Result {
  return listTickets({ issueId: value(options, "issue"),
    type: optional(options, "type"), status: optional(options, "status") });
}

function parseOptions(args: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const name = key.slice(2);
    if (["human", "pretty", "no-open", "force", "dogfood", "last", "prompt"].includes(name)) options[name] = true;
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

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function launchWeb(options: Options): Promise<void> {
  try {
    const web = await startWebServer(optionalNumber(options, "port"));
    process.stdout.write(`Issues web disponível em ${web.url}\n`);
    if (!options["no-open"]) openBrowser(web.url);
  } catch (error) {
    reportError(error);
  }
}

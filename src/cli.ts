import { ClaimTicketUseCase } from "./app/claim_ticket_use_case.js";
import { attachmentFromFile, CommentUseCase, type IncomingAttachment } from "./app/comment_use_case.js";
import { CreateIssueUseCase } from "./app/create_issue_use_case.js";
import { CreateTicketUseCase } from "./app/create_ticket_use_case.js";
import { DecideIssueUseCase } from "./app/decide_issue_use_case.js";
import { DecideTicketUseCase } from "./app/decide_ticket_use_case.js";
import { GetIssueUseCase } from "./app/get_issue_use_case.js";
import { GetTicketUseCase } from "./app/get_ticket_use_case.js";
import { HarnessUseCase } from "./app/harness_use_case.js";
import { InitPackUseCase } from "./app/init_pack_use_case.js";
import { LoopUseCase } from "./app/loop_use_case.js";
import { ListIssuesUseCase } from "./app/list_issues_use_case.js";
import { ListTicketsUseCase } from "./app/list_tickets_use_case.js";
import { NextIssueUseCase } from "./app/next_issue_use_case.js";
import { ResetClaimUseCase } from "./app/reset_claim_use_case.js";
import { StatusIssueUseCase } from "./app/status_issue_use_case.js";
import { StatusTicketUseCase } from "./app/status_ticket_use_case.js";
import { TagUseCase } from "./app/tag_use_case.js";
import { WorktreeUseCase } from "./app/worktree_use_case.js";
import { openBrowser, startWebServer } from "./web/server.js";

type Options = Record<string, string | boolean | string[]>;
type Result = object | object[] | null;

export function main(argv = process.argv.slice(2)): void {
  try {
    const [command, ...raw] = argv;
    if (command === "ticket") return void runTicket(raw);
    if (command === "harness") return void runGroup(raw, harness);
    if (command === "worktree") return void runGroup(raw, worktree);
    if (command === "loop") return void runLoop(raw);
    const options = parseOptions(raw);
    if (command === "web") return void launchWeb(options);
    print(execute(command, options), Boolean(options.pretty));
  } catch (error) {
    reportError(error);
  }
}

function runTicket(raw: string[]): void {
  const options = parseOptions(raw.slice(1));
  print(ticket(raw[0], options), Boolean(options.pretty));
}

function runGroup(raw: string[], route: (sub: string | undefined, options: Options) => Result): void {
  const options = parseOptions(raw.slice(1));
  print(route(raw[0], options), Boolean(options.pretty));
}

function harness(sub: string | undefined, options: Options): Result {
  if (sub === "add") return new HarnessUseCase().add({ name: value(options, "name"),
    agent: value(options, "agent"), command: value(options, "command") });
  if (sub === "list") return new HarnessUseCase().list();
  if (sub === "remove") return new HarnessUseCase().remove(value(options, "name"));
  throw new Error("Usage: issues harness <add|list|remove> [flags]");
}

function worktree(sub: string | undefined, options: Options): Result {
  if (sub === "add") return new WorktreeUseCase().add({ issueId: value(options, "id"), path: optional(options, "path") }).toJSON();
  if (sub === "remove") return new WorktreeUseCase().remove({ issueId: value(options, "id") }).toJSON();
  throw new Error("Usage: issues worktree <add|remove> --id <issueId> [--path <p>]");
}

function runLoop(raw: string[]): void {
  const options = parseOptions(raw.slice(1));
  loop(raw[0], options).then((result) => print(result, Boolean(options.pretty)), reportError);
}

async function loop(sub: string | undefined, options: Options): Promise<Result> {
  if (sub === "add") return new LoopUseCase().add({ name: value(options, "name"),
    harness: value(options, "harness"), project: optional(options, "project"),
    interval: value(options, "interval"), concurrency: optionalNumber(options, "concurrency") });
  if (sub === "list") return new LoopUseCase().list();
  if (sub === "remove") return new LoopUseCase().remove(value(options, "name"));
  if (sub === "install") return new LoopUseCase().install({ name: value(options, "name"),
    cron: Boolean(options.cron), now: Boolean(options.now) });
  if (sub === "run") return new LoopUseCase().run({ name: value(options, "name") });
  throw new Error("Usage: issues loop <add|list|remove|install|run> [flags]");
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
  if (command === "init") return init(options);
  throw new Error("Usage: issues <create|next|comment|tag|status|decide|reset|get|list|ticket|harness|loop|web|init> [flags]");
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
  throw new Error("Usage: issues ticket <create|claim|comment|tag|status|decide|get|list> [flags]");
}

function create(options: Options): Result {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const actor = options.human ? "human" : value(options, "agent");
  return new CreateIssueUseCase().execute({ title: value(options, "title"),
    project: value(options, "project"), type: value(options, "type"),
    problem: value(options, "problem"), artifacts: optional(options, "artifacts"),
    acceptance_criteria: optional(options, "acceptance-criteria"), actor }).toJSON();
}

function next(options: Options): Result {
  const result = new NextIssueUseCase().execute({ agent: value(options, "agent"),
    project: value(options, "project") });
  if (!result) return null;
  return { issue: result.issue.toJSON(), ticket: result.ticket?.toJSON() ?? null };
}

function comment(options: Options): Result {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const actor = options.human ? "human" : value(options, "agent");
  return new CommentUseCase().execute({ issueId: value(options, "id"),
    comment: optional(options, "comment") ?? "", attachments: readAttachments(options), actor }).toJSON();
}

function tag(options: Options): Result {
  return new TagUseCase().execute({ issueId: value(options, "id"),
    complexity: optional(options, "complexity"), human_need: optional(options, "human-need"),
    risk: optional(options, "risk") }).toJSON();
}

function status(options: Options): Result {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const agent = options.human ? undefined : value(options, "agent");
  return new StatusIssueUseCase().execute({ id: value(options, "id"), agent,
    human: Boolean(options.human), status: value(options, "status"),
    comment: value(options, "comment"), closed_reason: optional(options, "reason") }).toJSON();
}

function decide(options: Options): Result {
  return new DecideIssueUseCase().execute({ id: value(options, "id"),
    human: Boolean(options.human), status: value(options, "status"),
    comment: value(options, "comment"), closed_reason: optional(options, "reason") }).toJSON();
}

function reset(options: Options): Result {
  return new ResetClaimUseCase().execute({ id: value(options, "id"),
    human: Boolean(options.human), comment: value(options, "comment") }).toJSON();
}

function get(options: Options): Result {
  return new GetIssueUseCase().execute(value(options, "id")).toJSON();
}

function list(options: Options): Result {
  return new ListIssuesUseCase().execute({ status: optional(options, "status"),
    project: optional(options, "project"), title: optional(options, "title"), type: optional(options, "type"),
    limit: optionalNumber(options, "limit"), offset: optionalNumber(options, "offset") });
}

function init(options: Options): Result {
  return new InitPackUseCase().execute({ harness: optional(options, "harness"),
    target: optional(options, "target"), force: Boolean(options.force) });
}

function ticketCreate(options: Options): Result {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const actor = options.human ? "human" : value(options, "agent");
  return new CreateTicketUseCase().execute({ issueId: value(options, "issue"),
    type: value(options, "type"), objective: value(options, "objective"), task: value(options, "task"),
    acceptance_criteria: value(options, "acceptance-criteria"), artifacts: optional(options, "artifacts"),
    references: optional(options, "references"), depends_on: optionalList(options, "depends-on"),
    human_need: optional(options, "human-need"), actor }).toJSON();
}

function ticketClaim(options: Options): Result {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const actor = options.human ? "human" : value(options, "agent");
  return new ClaimTicketUseCase().execute({ issueId: value(options, "issue"),
    ticketId: value(options, "id"), actor }).toJSON();
}

function ticketComment(options: Options): Result {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const actor = options.human ? "human" : value(options, "agent");
  return new CommentUseCase().execute({ issueId: value(options, "issue"), ticketId: value(options, "id"),
    comment: optional(options, "comment") ?? "", attachments: readAttachments(options), actor }).toJSON();
}

function ticketTag(options: Options): Result {
  return new TagUseCase().execute({ issueId: value(options, "issue"), ticketId: value(options, "id"),
    complexity: optional(options, "complexity"), human_need: optional(options, "human-need"),
    risk: optional(options, "risk") }).toJSON();
}

function ticketStatus(options: Options): Result {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const actor = options.human ? "human" : value(options, "agent");
  return new StatusTicketUseCase().execute({ issueId: value(options, "issue"),
    ticketId: value(options, "id"), actor, status: value(options, "status"),
    comment: value(options, "comment"), closed_reason: optional(options, "reason") }).toJSON();
}

function ticketDecide(options: Options): Result {
  return new DecideTicketUseCase().execute({ issueId: value(options, "issue"),
    ticketId: value(options, "id"), human: Boolean(options.human), status: value(options, "status"),
    comment: value(options, "comment"), closed_reason: optional(options, "reason") }).toJSON();
}

function ticketGet(options: Options): Result {
  return new GetTicketUseCase().execute({ issueId: value(options, "issue"),
    ticketId: value(options, "id") }).toJSON();
}

function ticketList(options: Options): Result {
  return new ListTicketsUseCase().execute({ issueId: value(options, "issue"),
    type: optional(options, "type"), status: optional(options, "status") });
}

function parseOptions(args: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const name = key.slice(2);
    if (["human", "pretty", "no-open", "force", "cron", "now"].includes(name)) options[name] = true;
    else if (name === "attach") (options.attach = (options.attach as string[] | undefined) ?? []).push(args[++index] ?? "");
    else options[name] = args[++index] ?? "";
  }
  return options;
}

function readAttachments(options: Options): IncomingAttachment[] {
  const paths = Array.isArray(options.attach) ? options.attach : [];
  return paths.map(attachmentFromFile);
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

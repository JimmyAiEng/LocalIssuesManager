import { CreateIssueUseCase } from "./app/create_issue_use_case.js";
import { DecideIssueUseCase } from "./app/decide_issue_use_case.js";
import { GetIssueUseCase } from "./app/get_issue_use_case.js";
import { InitPackUseCase } from "./app/init_pack_use_case.js";
import { ListIssuesUseCase } from "./app/list_issues_use_case.js";
import { NextIssueUseCase } from "./app/next_issue_use_case.js";
import { ResetClaimUseCase } from "./app/reset_claim_use_case.js";
import { StatusIssueUseCase } from "./app/status_issue_use_case.js";
import { openBrowser, startWebServer } from "./web/server.js";

type Options = Record<string, string | boolean>;
type Result = object | object[] | null;

export function main(argv = process.argv.slice(2)): void {
  try {
    const [command, ...raw] = argv;
    const options = parseOptions(raw);
    if (command === "web") return void launchWeb(options);
    const result = execute(command, options);
    print(result, Boolean(options.pretty));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function execute(command: string | undefined, options: Options): Result {
  if (command === "create") return create(options);
  if (command === "next") return next(options);
  if (command === "status") return status(options);
  if (command === "decide") return decide(options);
  if (command === "reset") return reset(options);
  if (command === "get") return get(options);
  if (command === "list") return list(options);
  if (command === "init") return init(options);
  throw new Error("Usage: issues <create|next|status|decide|reset|get|list|web|init> [flags]");
}

function create(options: Options): Result {
  if (options.human && options.agent) throw new Error("Choose --human or --agent");
  const actor = options.human ? "human" : value(options, "agent");
  return new CreateIssueUseCase().execute({ title: value(options, "title"),
    project: value(options, "project"), tag: value(options, "tag"),
    problem: value(options, "problem"), artifacts: value(options, "artifacts"),
    acceptance_criteria: value(options, "acceptance-criteria"), actor }).toJSON();
}

function next(options: Options): Result {
  const result = new NextIssueUseCase().execute({ agent: value(options, "agent"),
    project: optional(options, "project") });
  return result?.toJSON() ?? null;
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
    project: optional(options, "project"), title: optional(options, "title"), tag: optional(options, "tag"),
    limit: optionalNumber(options, "limit"), offset: optionalNumber(options, "offset") });
}

function init(options: Options): Result {
  return new InitPackUseCase().execute({ harness: optional(options, "harness"),
    target: optional(options, "target"), force: Boolean(options.force) });
}

function parseOptions(args: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const name = key.slice(2);
    if (name === "human" || name === "pretty" || name === "no-open" || name === "force") options[name] = true;
    else options[name] = args[++index] ?? "";
  }
  return options;
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
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

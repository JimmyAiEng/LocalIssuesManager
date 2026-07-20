import { CONCERN_LEVELS } from "../../../domain/queue_repository.js";
import {
  ACTION_TYPES, AGENT_IDS, CLOSED_REASONS, ISSUE_STATUSES, ISSUE_TYPES, RELATION_KINDS, ROLES, TAG_VALUES,
} from "../../../domain/value_objects.js";

// Usage por comando: `issues <cmd> --help` imprime a linha correspondente sem exigir flag alguma.
// Os enums vêm do domínio (não são literais aqui) — o texto do help não pode divergir do que o
// parser aceita, que era justamente como o agente descobria os valores: lendo o fonte.
const or = (values: readonly string[]): string => values.join("|");
const AGENT = `--agent ${or(AGENT_IDS)}`;
const TAGS = `[--complexity ${or(TAG_VALUES.complexity)}] [--risk ${or(TAG_VALUES.risk)}] [--human-need ${or(TAG_VALUES.human_need)}]`;

export const USAGE: Record<string, string> = {
  create: `issues create --title <t> --project <p> --type ${or(ISSUE_TYPES)} --action ${or(ACTION_TYPES)} --problem <txt> [--acceptance-criteria <c>] [--relates <id,id>] [--artifact-file <f>] ${TAGS} [--attach <f>] ${AGENT}`,
  next: `issues next (--project <p> | --id <id>) ${AGENT} [--prompt]`,
  handoff: "issues handoff --id <id>",
  comment: `issues comment --id <id> (${AGENT} | --human) [--comment <txt>] [--attach <f>] [--role ${or(ROLES)}]`,
  tag: `issues tag --id <id> (${AGENT} | --human) ${TAGS}`,
  status: `issues status --id <id> (${AGENT} | --human) --status AWAITING|CLOSED --comment <evidência> [--reason ${or(CLOSED_REASONS)}] [--role ${or(ROLES)}]`,
  decide: `issues decide --id <id> --human --status OPEN|APPROVED|CLOSED --comment <txt> [--reason ${or(CLOSED_REASONS)}]`,
  reset: "issues reset --id <id> --human --comment <txt>",
  relate: `issues relate --id <id> --relates <id,id> [--kind ${or(RELATION_KINDS)}]`,
  decompose: `issues decompose --id <id> --into <children.json> ${AGENT}`,
  get: "issues get [REQUIREMENTS|PLAN|DESIGN] --id <id> [--pretty]",
  list: `issues list [--status ${or(ISSUE_STATUSES)}] [--project <p>] [--type ${or(ISSUE_TYPES)}] [--title <t>] [--pretty]`,
  artifact: "issues artifact --id <id> --file <f> [--name handoff.md|intent.md|evidence-<x>.md]",
  requirements: "issues requirements set --id <id> --file <req.jsonl>",
  plan: "issues plan set --id <id> --file <plan.json>",
  design: "issues design <doc|add|changed> --issue <id> [--kind <kind>] [--file <path>] [--value true|false]",
  project: `issues project <create|list> [--name <n> --repo <path> --concern ${or(CONCERN_LEVELS)}]`,
  web: "issues web [--port <n>] [--no-open]",
  init: "issues init [--harness <h>] [--target <dir>] [--force] [--dogfood]",
};

export function usageFor(command?: string): string {
  const specific = command === undefined ? undefined : USAGE[command];
  if (specific) return `Usage: ${specific}`;
  return `Usage: issues <${Object.keys(USAGE).join("|")}> [flags]\n       issues <comando> --help para o usage do comando`;
}

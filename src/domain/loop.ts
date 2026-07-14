import { DomainError } from "./domain_error.js";
import type { Harness } from "./harness.js";

export type LoopData = { harness: string; project?: string; interval: string; concurrency: number };
export type DrainResult = Record<string, string>;
export type PulledItem = { json: string; issue: string; ticket: string; type?: string };
export type SpawnOutcome = { status: number | null; timedOut: boolean };
export type DrainIO = {
  pull(agent: string, project?: string): PulledItem | null;
  run(argv: string[]): Promise<SpawnOutcome>;
  log(line: string): void;
  clock(): Date;
};

const PROMPT_BASE = [
  "Você é um agente de código trabalhando a fila issues-local de forma autônoma.",
  "Siga AGENTS.md e a skill sdlc-workflow (camada 0) e, pelo tipo do Ticket, a",
  "skill de fase correspondente (camada 1). Trabalhe o item abaixo.",
  "",
  "Regras de fechamento (obrigatórias):",
  "- Ao concluir o Ticket, DECIDA: se o resultado está claro e seguro, feche o",
  "  próprio Ticket (issues ticket status … --status CLOSED); se houver ponto",
  "  obscuro/arriscado, mova-o para AWAITING pedindo revisão humana.",
  "- NUNCA feche a Issue. Quando todos os Tickets estiverem CLOSED, mova a Issue",
  "  para AWAITING (issues status … --status AWAITING) e pare; a decisão",
  "  OPEN|CLOSED da Issue é do humano (issues decide).",
].join("\n");

/** Entidade: agrupa um Harness e drena a fila em agentes concorrentes (até `concurrency`). */
export class Loop {
  readonly name: string;
  readonly harnessName: string;
  readonly harness: Harness;
  readonly project?: string;
  readonly interval: string;
  readonly concurrency: number;

  private constructor(name: string, harnessName: string, harness: Harness,
    project: string | undefined, interval: string, concurrency: number) {
    this.name = name; this.harnessName = harnessName; this.harness = harness;
    this.project = project; this.interval = interval; this.concurrency = concurrency;
  }

  static create(input: { name: string; harnessName: string; harness: Harness;
    project?: string; interval: string; concurrency?: number }): Loop {
    if (!input.name.trim()) throw new DomainError("name is required");
    parseIntervalSeconds(input.interval);
    return new Loop(input.name, input.harnessName, input.harness, input.project,
      input.interval, parseConcurrency(input.concurrency));
  }

  toData(): LoopData {
    return { harness: this.harnessName, project: this.project, interval: this.interval, concurrency: this.concurrency };
  }

  intervalSeconds(): number { return parseIntervalSeconds(this.interval); }

  prompt(item: string): string {
    return `${PROMPT_BASE}\n\nItem da fila:\n\`\`\`json\n${item}\n\`\`\`\n`;
  }

  /** Esvazia a fila: dispara agentes até `concurrency` simultâneos, repuxando conforme liberam,
   * até não haver mais item OPEN. Retorna o resumo do dreno. */
  async drain(io: DrainIO): Promise<DrainResult> {
    const active = new Set<Promise<void>>();
    const counts: Record<string, number> = { worked: 0, error: 0, timeout: 0 };
    let total = 0;
    for (;;) {
      let item = active.size < this.concurrency ? io.pull(this.harness.agent, this.project) : null;
      while (item) {
        total++;
        const promise = this.#dispatch(io, item, counts).finally(() => active.delete(promise));
        active.add(promise);
        item = active.size < this.concurrency ? io.pull(this.harness.agent, this.project) : null;
      }
      if (active.size === 0) break;
      await Promise.race(active);
    }
    return this.#summary(io, counts, total);
  }

  service(root: string): string {
    return ["[Unit]", `Description=issues-local loop ${this.name}`, "", "[Service]", "Type=oneshot",
      `Environment=ISSUES_ROOT=${root}`, `ExecStart=/usr/bin/env issues loop run --name ${this.name}`, ""].join("\n");
  }

  timer(): string {
    const seconds = this.intervalSeconds();
    return ["[Unit]", `Description=timer for issues-local loop ${this.name}`, "", "[Timer]",
      `OnBootSec=${seconds}`, `OnUnitActiveSec=${seconds}`, "Persistent=true", "",
      "[Install]", "WantedBy=timers.target", ""].join("\n");
  }

  cron(root: string): string {
    return `${cronExpr(this.interval)} ISSUES_ROOT=${root} issues loop run --name ${this.name} >> ${root}/loop/${this.name}.log 2>&1`;
  }

  async #dispatch(io: DrainIO, item: PulledItem, counts: Record<string, number>): Promise<void> {
    const outcome = await io.run(this.harness.argv(this.prompt(item.json)));
    const fields = this.#fields(item, outcome);
    counts[fields.result] = (counts[fields.result] ?? 0) + 1;
    io.log(logLine(io.clock(), this.name, fields));
  }

  #fields(pulled: PulledItem, outcome: SpawnOutcome): DrainResult {
    const result = outcome.timedOut ? "timeout" : outcome.status === 0 ? "worked" : "error";
    return { result, harness: this.harnessName, agent: this.harness.agent, issue: pulled.issue,
      ticket: pulled.ticket, ...(pulled.type ? { type: pulled.type } : {}), rc: String(outcome.status ?? -1) };
  }

  #summary(io: DrainIO, counts: Record<string, number>, total: number): DrainResult {
    const fields: DrainResult = total === 0 ? { result: "empty" }
      : { result: "drained", worked: String(counts.worked), error: String(counts.error),
        timeout: String(counts.timeout), total: String(total) };
    io.log(logLine(io.clock(), this.name, fields));
    return { loop: this.name, ...fields };
  }
}

export function parseIntervalSeconds(interval: string): number {
  const match = /^(\d+)(s|m|h)$/.exec(interval.trim());
  const value = match ? Number(match[1]) : 0;
  if (!match || value <= 0) throw new DomainError(`Invalid interval: ${interval} (use e.g. 30s, 30m, 1h)`);
  return value * { s: 1, m: 60, h: 3600 }[match[2] as "s" | "m" | "h"];
}

export function parseConcurrency(value?: number): number {
  const parsed = value ?? 3;
  if (!Number.isInteger(parsed) || parsed < 1) throw new DomainError(`Invalid concurrency: ${value} (integer >= 1)`);
  return parsed;
}

function logLine(now: Date, name: string, fields: DrainResult): string {
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(" ");
  return `${stamp} loop=${name} ${parts}`;
}

function cronExpr(interval: string): string {
  const seconds = parseIntervalSeconds(interval);
  if (seconds % 3600 === 0) { const hours = seconds / 3600; return hours === 1 ? "0 * * * *" : `0 */${hours} * * *`; }
  const minutes = seconds / 60;
  if (seconds % 60 === 0 && minutes < 60 && 60 % minutes === 0) return `*/${minutes} * * * *`;
  throw new DomainError(`No clean cron mapping for ${interval}; use systemd or a divisor of 60min/24h`);
}

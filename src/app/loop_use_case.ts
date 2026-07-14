import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Loop, type DrainResult, type LoopData, type PulledItem, type SpawnOutcome } from "../domain/loop.js";
import { LoopStore } from "../domain/loop_store.js";
import { Queue } from "../domain/queue_repository.js";
import { NextIssueUseCase } from "./next_issue_use_case.js";

export type LoopInput = { name: string; harness: string; project?: string; interval: string; concurrency?: number };

export class LoopUseCase {
  private readonly store: LoopStore;
  constructor(root?: string) { this.store = new LoopStore(root); }

  add(input: LoopInput): LoopData & { name: string } {
    const loop = Loop.create({ name: input.name, harnessName: input.harness,
      harness: this.store.harness(input.harness), project: input.project,
      interval: input.interval, concurrency: input.concurrency });
    this.store.saveLoop(loop);
    return { name: loop.name, ...loop.toData() };
  }

  list(): Record<string, LoopData> { return this.store.loops(); }

  remove(name: string): { removed: string } {
    this.store.removeLoop(name);
    return { removed: name };
  }

  install(input: { name: string; cron?: boolean; now?: boolean }): DrainResult {
    const loop = this.store.loop(input.name);
    if (input.cron) return { cron: loop.cron(this.store.root) };
    const dir = join(homedir(), ".config", "systemd", "user");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `issues-loop-${loop.name}.service`), loop.service(this.store.root));
    writeFileSync(join(dir, `issues-loop-${loop.name}.timer`), loop.timer());
    if (input.now) enable(loop.name);
    return { installed: loop.name, dir, enable: `systemctl --user enable --now issues-loop-${loop.name}.timer` };
  }

  run(input: { name: string; clock?: () => Date }): Promise<DrainResult> {
    const loop = this.store.loop(input.name);
    new Queue(this.store.root).purgeClosed(input.clock?.() ?? new Date()); // GC de CLOSED expirados: hook periódico, fora do caminho de escrita
    return loop.drain({
      pull: (agent, project) => this.#pull(agent, project),
      run: (argv) => spawnAsync(argv),
      log: (line) => this.store.appendLog(loop.name, line),
      clock: input.clock ?? (() => new Date()),
    });
  }

  #pull(agent: string, project?: string): PulledItem | null {
    const result = new NextIssueUseCase(this.store.root).execute({ agent, project });
    if (!result) return null;
    const json = JSON.stringify({ issue: result.issue.toJSON(), ticket: result.ticket?.toJSON() ?? null });
    return { json, issue: result.issue.id.slice(0, 8),
      ticket: result.ticket ? result.ticket.id.slice(0, 8) : "—", type: result.ticket?.type };
  }
}

function spawnAsync(argv: string[]): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: "inherit", timeout: timeoutMs() });
    child.on("error", () => resolve({ status: null, timedOut: false }));
    // ponytail: timeout mata com SIGTERM; morte por sinal é tratada como timeout
    child.on("close", (status, signal) => resolve({ status, timedOut: signal !== null }));
  });
}

function timeoutMs(): number { return Number(process.env.TICK_TIMEOUT ?? 1800) * 1000; }

function enable(name: string): void {
  spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
  spawnSync("systemctl", ["--user", "enable", "--now", `issues-loop-${name}.timer`], { stdio: "inherit" });
}

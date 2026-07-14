import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DomainError } from "./domain_error.js";
import { Harness, type HarnessData } from "./harness.js";
import { Loop, type LoopData } from "./loop.js";

/** Repositório: persiste Harness (VO) e Loop (entidade) e o log de auditoria. */
export class LoopStore {
  readonly #root: string;

  constructor(root = defaultRoot()) { this.#root = root; }

  get root(): string { return this.#root; }
  get dir(): string { return join(this.#root, "loop"); }
  logPath(name: string): string { return join(this.dir, `${name}.log`); }

  harnesses(): Record<string, HarnessData> { return this.#read("harnesses.json") as Record<string, HarnessData>; }

  harness(name: string): Harness {
    const data = this.harnesses()[name];
    if (!data) throw new DomainError(`Unknown harness: ${name}`);
    return Harness.fromJSON(data);
  }

  saveHarness(name: string, harness: Harness): void {
    this.#write("harnesses.json", { ...this.harnesses(), [name]: harness.toJSON() });
  }

  removeHarness(name: string): void { this.#drop("harnesses.json", name); }

  loops(): Record<string, LoopData> { return this.#read("loops.json") as Record<string, LoopData>; }

  loop(name: string): Loop {
    const data = this.loops()[name];
    if (!data) throw new DomainError(`Unknown loop: ${name}`);
    return Loop.create({ name, harnessName: data.harness, harness: this.harness(data.harness),
      project: data.project, interval: data.interval, concurrency: data.concurrency });
  }

  saveLoop(loop: Loop): void { this.#write("loops.json", { ...this.loops(), [loop.name]: loop.toData() }); }
  removeLoop(name: string): void { this.#drop("loops.json", name); }

  appendLog(name: string, line: string): void {
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(this.logPath(name), `${line}\n`);
  }

  #read(file: string): Record<string, unknown> {
    const path = join(this.dir, file);
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>) : {};
  }

  #write(file: string, data: unknown): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, file), JSON.stringify(data, null, 2));
  }

  #drop(file: string, name: string): void {
    const data = this.#read(file);
    if (!(name in data)) throw new DomainError(`Unknown entry: ${name}`);
    delete data[name];
    this.#write(file, data);
  }
}

function defaultRoot(): string {
  return process.env.ISSUES_ROOT ?? join(homedir(), "issues-manager");
}

import { DomainError } from "../domain/domain_error.js";
import { Harness, type HarnessData } from "../domain/harness.js";
import { LoopStore } from "../domain/loop_store.js";

export type HarnessInput = { name: string; agent: string; command: string };

export class HarnessUseCase {
  private readonly store: LoopStore;
  constructor(root?: string) { this.store = new LoopStore(root); }

  add(input: HarnessInput): HarnessData & { name: string } {
    if (!input.name.trim()) throw new DomainError("--name is required");
    const harness = Harness.create(input.agent, input.command);
    this.store.saveHarness(input.name, harness);
    return { name: input.name, ...harness.toJSON() };
  }

  list(): Record<string, HarnessData> { return this.store.harnesses(); }

  remove(name: string): { removed: string } {
    this.store.removeHarness(name);
    return { removed: name };
  }
}

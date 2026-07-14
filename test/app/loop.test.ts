import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CreateIssueUseCase } from "../../src/app/create_issue_use_case.js";
import { HarnessUseCase } from "../../src/app/harness_use_case.js";
import { LoopUseCase } from "../../src/app/loop_use_case.js";
import { Harness } from "../../src/domain/harness.js";
import { type DrainIO, Loop, parseIntervalSeconds } from "../../src/domain/loop.js";

const root = () => mkdtempSync(join(tmpdir(), "issues-loop-"));
const node = process.execPath;
const pi = () => Harness.create("pi", `${node} -e 0 {prompt}`);
const clock = () => new Date("2026-07-14T09:00:00Z");

test("Harness VO valida agent e exige {prompt}, argv injeta como um único elemento", () => {
  assert.throws(() => Harness.create("gemini", "g {prompt}"), /Invalid IA/);
  assert.throws(() => Harness.create("pi", "pi -p"), /\{prompt\}/);
  const prompt = 'a b; rm -rf / $(x) "q"';
  assert.deepEqual(Harness.create("pi", "claude -p {prompt}").argv(prompt), ["claude", "-p", prompt]);
});

test("Loop entidade: valida intervalo/concorrência, embute item e renderiza agendamento", () => {
  const loop = Loop.create({ name: "l", harnessName: "pi", harness: pi(), project: "demo", interval: "30m" });
  assert.equal(loop.intervalSeconds(), 1800);
  assert.equal(loop.concurrency, 3);
  assert.match(loop.prompt('{"x":1}'), /NUNCA feche a Issue[\s\S]*```json\n\{"x":1\}\n```/);
  assert.match(loop.service("/r"), /Type=oneshot[\s\S]*ExecStart=.*issues loop run --name l/);
  assert.match(loop.timer(), /OnUnitActiveSec=1800[\s\S]*WantedBy=timers.target/);
  assert.match(loop.cron("/r"), /^\*\/30 \* \* \* \* .*issues loop run --name l/);
  assert.throws(() => Loop.create({ name: "l", harnessName: "p", harness: pi(), interval: "banana" }), /Invalid interval/);
  assert.throws(() => Loop.create({ name: "l", harnessName: "p", harness: pi(), interval: "1h", concurrency: 0 }), /concurrency/);
});

test("parseIntervalSeconds cobre s/m/h e rejeita lixo", () => {
  assert.deepEqual([parseIntervalSeconds("30s"), parseIntervalSeconds("30m"), parseIntervalSeconds("2h")], [30, 1800, 7200]);
  assert.throws(() => parseIntervalSeconds("0m"), /Invalid/);
  assert.throws(() => parseIntervalSeconds("5d"), /Invalid/);
});

test("Loop.drain respeita o limite de concorrência e drena a fila inteira", async () => {
  const items = 7, concurrency = 3;
  let pulled = 0, inFlight = 0, maxInFlight = 0, done = 0;
  const io: DrainIO = {
    pull: () => (pulled < items ? { json: "{}", issue: String(++pulled), ticket: "—" } : null),
    run: async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve(); await Promise.resolve();
      inFlight--; done++; return { status: 0, timedOut: false };
    },
    log: () => undefined,
    clock,
  };
  const summary = await Loop.create({ name: "l", harnessName: "h", harness: pi(), interval: "1h", concurrency }).drain(io);
  assert.equal(maxInFlight, concurrency);
  assert.equal(done, items);
  assert.deepEqual([summary.result, summary.total, summary.worked], ["drained", "7", "7"]);
});

test("Loop.drain classifica erro/timeout e resume", async () => {
  const outcomes = [{ status: 0, timedOut: false }, { status: 1, timedOut: false }, { status: null, timedOut: true }];
  let i = 0;
  const lines: string[] = [];
  const io: DrainIO = {
    pull: () => (i < outcomes.length ? { json: "{}", issue: `x${i}`, ticket: "—" } : null),
    run: async () => outcomes[i++],
    log: (line) => lines.push(line),
    clock,
  };
  const summary = await Loop.create({ name: "l", harnessName: "h", harness: pi(), interval: "1h", concurrency: 1 }).drain(io);
  assert.deepEqual([summary.worked, summary.error, summary.timeout, summary.total], ["1", "1", "1", "3"]);
  assert.equal(lines.filter((l) => l.includes("result=drained")).length, 1);
});

test("use-cases: add persiste concorrência (default 3) e valida harness inexistente", () => {
  const r = root();
  assert.throws(() => new LoopUseCase(r).add({ name: "l", harness: "missing", interval: "30m" }), /Unknown harness/);
  new HarnessUseCase(r).add({ name: "pi", agent: "pi", command: "pi -p {prompt}" });
  assert.equal(new LoopUseCase(r).add({ name: "d3", harness: "pi", interval: "30m" }).concurrency, 3);
  assert.equal(new LoopUseCase(r).add({ name: "d2", harness: "pi", interval: "30m", concurrency: 2 }).concurrency, 2);
});

test("run: fila vazia registra result=empty", async () => {
  const r = root();
  new HarnessUseCase(r).add({ name: "pi", agent: "pi", command: `${node} -e 0 {prompt}` });
  new LoopUseCase(r).add({ name: "l", harness: "pi", project: "vazio", interval: "30m" });
  const summary = await new LoopUseCase(r).run({ name: "l", clock });
  assert.equal(summary.result, "empty");
  assert.match(readFileSync(join(r, "loop", "l.log"), "utf8"), /loop=l result=empty/);
});

test("run: drena os itens reais despachando ao harness", async () => {
  const r = root();
  new CreateIssueUseCase(r).execute({ title: "t", project: "demo", type: "Feat", problem: "p", actor: "human" });
  new HarnessUseCase(r).add({ name: "pi", agent: "pi", command: `${node} -e 0 {prompt}` });
  new LoopUseCase(r).add({ name: "l", harness: "pi", project: "demo", interval: "30m" });
  const summary = await new LoopUseCase(r).run({ name: "l", clock });
  assert.deepEqual([summary.result, summary.total, summary.worked], ["drained", "1", "1"]);
  const log = readFileSync(join(r, "loop", "l.log"), "utf8");
  assert.match(log, /result=worked harness=pi agent=pi/);
  assert.match(log, /result=drained worked=1/);
});

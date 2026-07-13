import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const bin = resolve("bin/issues");
const env = () => ({ ...process.env, ISSUES_ROOT: mkdtempSync(join(tmpdir(), "issues-cli-")) });
const run = (args: string[], vars: NodeJS.ProcessEnv) =>
  execFileSync(bin, args, { env: vars, encoding: "utf8" });

const createArgs = [
  "create", "--title", "CLI issue", "--project", "demo", "--tag", "Implement",
  "--problem", "problem", "--artifacts", "src", "--acceptance-criteria", "done", "--agent", "pi",
];

test("CLI retorna JSON por padrão e suporta fluxo create/next/get", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  assert.equal(created.status, "OPEN");
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.id, created.id);
  const fetched = JSON.parse(run(["get", "--id", created.id], vars));
  assert.equal(fetched.owner, "pi");
});

test("CLI exige --human em comandos humanos e devolve erro claro", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "pi"], vars);
  const result = spawnSync(bin, ["reset", "--id", created.id, "--comment", "x"], {
    env: vars,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /human/i);
});

test("CLI --pretty mantém JSON legível", () => {
  const vars = env();
  run(createArgs, vars);
  run(createArgs, vars);
  const output = run(["list", "--project", "demo", "--limit", "1", "--offset", "1", "--pretty"], vars);
  assert.match(output, /\n  \{/);
  assert.equal(JSON.parse(output).length, 1);
  assert.equal(JSON.parse(output)[0].status, "OPEN");
});

test("CLI lista por TAG sem alterar filtros existentes", () => {
  const vars = env();
  run(createArgs, vars);
  run(createArgs.map((arg) => arg === "Implement" ? "QA" : arg), vars);
  const issues = JSON.parse(run(["list", "--project", "demo", "--tag", "QA"], vars));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].tag, "QA");
});

test("e2e UC-01 e UC-02: validação, rejeição e novo claim", () => {
  const vars = env();
  const humanArgs = createArgs.slice(0, -2).concat("--human");
  const created = JSON.parse(run(humanArgs, vars));
  run(["next", "--agent", "codex", "--project", "demo"], vars);
  run(["status", "--id", created.id, "--agent", "codex", "--status", "AWAITING", "--comment", "feito"], vars);
  const rejected = JSON.parse(run(["decide", "--id", created.id, "--human", "--status", "OPEN", "--comment", "corrigir"], vars));
  assert.equal(rejected.owner, null);
  assert.equal(rejected.claimed_at, null);
  const reclaimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(reclaimed.id, created.id);
  run(["status", "--id", created.id, "--agent", "pi", "--status", "AWAITING", "--comment", "corrigido"], vars);
  const closed = JSON.parse(run(["decide", "--id", created.id, "--human", "--status", "CLOSED",
    "--comment", "aceito", "--reason", "concluido"], vars));
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.thread.length, 5);
});

test("e2e UC-03 e UC-04: fechamento por IA respeita presença humana", () => {
  const vars = env();
  const machine = JSON.parse(run(createArgs, vars));
  const closed = JSON.parse(run(["status", "--id", machine.id, "--agent", "pi", "--status", "CLOSED",
    "--comment", "incorreta", "--reason", "errado"], vars));
  assert.equal(closed.closed_reason, "errado");

  const human = JSON.parse(run(createArgs.slice(0, -2).concat("--human"), vars));
  const denied = spawnSync(bin, ["status", "--id", human.id, "--agent", "pi", "--status", "CLOSED",
    "--comment", "cancelar", "--reason", "errado"], { env: vars, encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.equal(JSON.parse(run(["get", "--id", human.id], vars)).status, "OPEN");
});

test("e2e UC-05 e UC-06: matriz inválida e reset humano", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "cursor"], vars);
  const closeClaimed = spawnSync(bin, ["status", "--id", created.id, "--agent", "cursor", "--status", "CLOSED",
    "--comment", "cancelar", "--reason", "errado"], { env: vars, encoding: "utf8" });
  assert.notEqual(closeClaimed.status, 0);
  const reset = JSON.parse(run(["reset", "--id", created.id, "--human", "--comment", "liberar"], vars));
  assert.equal(reset.owner, null);
  assert.equal(reset.claimed_at, null);

  run(["next", "--agent", "cursor"], vars);
  run(["status", "--id", created.id, "--agent", "cursor", "--status", "AWAITING", "--comment", "feito"], vars);
  const decide = spawnSync(bin, ["status", "--id", created.id, "--agent", "cursor", "--status", "CLOSED",
    "--comment", "aceitar", "--reason", "concluido"], { env: vars, encoding: "utf8" });
  assert.notEqual(decide.status, 0);
});

test("e2e UC-08: filtro de projeto isola filas", () => {
  const vars = env();
  run(createArgs.map((arg) => arg === "demo" ? "alpha" : arg), vars);
  const beta = JSON.parse(run(createArgs.map((arg) => arg === "demo" ? "beta" : arg), vars));
  const claimed = JSON.parse(run(["next", "--project", "beta", "--agent", "cursor"], vars));
  assert.equal(claimed.id, beta.id);
  assert.equal(JSON.parse(run(["list", "--project", "alpha", "--status", "OPEN"], vars)).length, 1);
});

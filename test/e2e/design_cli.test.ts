import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createIssue } from "../../src/app/issue_use_cases.js";
import { createProject } from "../../src/app/project_use_cases.js";
import { main } from "../../src/cli.js";
import { printDesignPackage, runDesign } from "../../src/cli_design.js";
import { Queue } from "../../src/domain/queue_repository.js";

// E2E do gate de Design pela superfície real: o binário `issues` como processo.
const bin = resolve("bin/issues");
const freshEnv = (): NodeJS.ProcessEnv => {
  const root = mkdtempSync(join(tmpdir(), "issues-design-e2e-"));
  const vars = { ...process.env, ISSUES_ROOT: root };
  execFileSync(bin, ["project", "create", "--name", "demo", "--repo", root], { env: vars, encoding: "utf8" });
  return vars;
};
const run = (args: string[], vars: NodeJS.ProcessEnv): string => execFileSync(bin, args, { env: vars, encoding: "utf8" });
const attempt = (args: string[], vars: NodeJS.ProcessEnv) => spawnSync(bin, args, { env: vars, encoding: "utf8" });
const json = (args: string[], vars: NodeJS.ProcessEnv) => JSON.parse(run(args, vars));

const VALID_CLASS = "@startuml\nclass A\n@enduml";
const INVALID = "@startuml\nthis is !! broken\n@enduml";
const PLAN = JSON.stringify({ objetivo: "o", passos: ["p"], arquivos: ["a"], criterio_pronto: "c" });

// O engine PlantUML loga no stderr; o contrato JSON de erros é a última linha.
const lastLine = (text: string): string => text.trim().split("\n").at(-1) ?? "";

const fixture = (name: string, content: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), "design-fixture-")), name);
  writeFileSync(path, content);
  return path;
};

// Cria uma Issue action=Design via CLI e devolve o id.
function designSetup(vars: NodeJS.ProcessEnv): string {
  const created = json(["create", "--title", "Design gate", "--project", "demo", "--type", "Feat",
    "--action", "Design", "--problem", "p", "--agent", "pi"], vars);
  return created.id;
}

test("e2e: design doc + add + get DESIGN felizes fecham o gate (ready true)", () => {
  const vars = freshEnv();
  const issueId = designSetup(vars);
  const doc = json(["design", "doc", "--issue", issueId, "--file", fixture("design.md", "# Design")], vars);
  assert.deepEqual(doc, { ok: true, issue: issueId, path: "design.md" });
  const added = json(["design", "add", "--issue", issueId, "--kind", "class",
    "--file", fixture("c.puml", VALID_CLASS)], vars);
  assert.deepEqual(added, { ok: true, issue: issueId, path: "class.puml" });
  const changed = json(["design", "changed", "--issue", issueId, "--value", "false"], vars);
  assert.deepEqual(changed, { ok: true, issue: issueId, architecture_changed: false });
  const queue = new Queue(vars.ISSUES_ROOT);
  assert.equal(queue.artifacts.readText("demo", { issueId, type: "document", name: "design.md" }), "# Design");
  assert.equal(queue.artifacts.readText("demo", { issueId, type: "uml", name: "class.puml" }), VALID_CLASS);

  const pack = json(["get", "DESIGN", "--id", issueId], vars);
  assert.equal(pack.issueId, issueId);
  assert.equal(pack.design_md, "# Design");
  assert.equal(pack.architecture_changed, false);
  assert.equal(pack.diagrams.class, VALID_CLASS);
  assert.deepEqual(pack.validation, { ready: true, errors: [] }); // sem mudança: diagramas dispensados
});

test("e2e: design doc vazio falha com JSON {errors:[empty_doc]}, exit 1 e nada gravado", () => {
  const vars = freshEnv();
  const issueId = designSetup(vars);
  const denied = attempt(["design", "doc", "--issue", issueId, "--file", fixture("vazio.md", "  \n")], vars);
  assert.equal(denied.status, 1);
  const errors = JSON.parse(lastLine(denied.stderr)).errors;
  assert.equal(errors[0].code, "empty_doc");
  assert.equal(new Queue(vars.ISSUES_ROOT).artifacts.readText("demo", { issueId, type: "document", name: "design.md" }), null);
});

test("e2e: design add inválido e kind incompatível falham com o contrato JSON e nada gravado", () => {
  const vars = freshEnv();
  const issueId = designSetup(vars);
  const invalid = attempt(["design", "add", "--issue", issueId, "--kind", "class",
    "--file", fixture("bad.puml", INVALID)], vars);
  assert.equal(invalid.status, 1);
  const invalidError = JSON.parse(lastLine(invalid.stderr)).errors[0];
  assert.equal(invalidError.code, "plantuml_invalid");
  assert.equal(invalidError.path, "class.puml");
  assert.equal(invalidError.line, 2);

  const mismatch = attempt(["design", "add", "--issue", issueId, "--kind", "state",
    "--file", fixture("c.puml", VALID_CLASS)], vars);
  assert.equal(mismatch.status, 1);
  const mismatchError = JSON.parse(lastLine(mismatch.stderr)).errors[0];
  assert.equal(mismatchError.code, "kind_mismatch");
  assert.match(mismatchError.message, /state/);
  assert.deepEqual(new Queue(vars.ISSUES_ROOT).artifacts.list("demo", issueId, "uml"), []);
});

test("e2e: get DESIGN incompleto reporta ready false; erro fora do gate sai cru", () => {
  const vars = freshEnv();
  const issueId = designSetup(vars);
  run(["design", "doc", "--issue", issueId, "--file", fixture("design.md", "# Design")], vars); // doc sem diagrama
  run(["design", "changed", "--issue", issueId, "--value", "true"], vars); // mudança exige os 4 níveis
  const pack = json(["get", "DESIGN", "--id", issueId], vars);
  assert.equal(pack.validation.ready, false);
  assert.deepEqual(pack.validation.errors.map((error: { code: string }) => error.code), ["missing_level"]);

  const denied = attempt(["design", "doc", "--issue", "nope", "--file", fixture("design.md", "# Design")], vars);
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /Issue not found/);
  assert.throws(() => JSON.parse(denied.stderr)); // erro de domínio segue o padrão cru do CLI
});

test("e2e: gate bloqueia a conclusão da Issue Design sem pacote (JSON errors, exit 1) e libera com pacote", () => {
  const vars = freshEnv();
  const issueId = designSetup(vars);
  run(["next", "--id", issueId, "--agent", "pi"], vars);
  const denied = attempt(["status", "--id", issueId, "--agent", "pi",
    "--status", "AWAITING", "--comment", "fim"], vars);
  assert.equal(denied.status, 1);
  const errors = JSON.parse(lastLine(denied.stderr)).errors;
  assert.deepEqual(errors.map((error: { code: string }) => error.code), ["decision_required"]); // sem a decisão de arquitetura
  assert.equal(json(["get", "--id", issueId], vars).status, "CLAIMED"); // permanece

  run(["design", "doc", "--issue", issueId, "--file", fixture("design.md", "# Design")], vars);
  run(["design", "add", "--issue", issueId, "--kind", "class",
    "--file", fixture("c.puml", VALID_CLASS)], vars);
  run(["design", "changed", "--issue", issueId, "--value", "false"], vars); // atalho ao plano, sem diagramas
  run(["plan", "set", "--id", issueId, "--file", fixture("plan.json", PLAN)], vars);
  assert.deepEqual(json(["get", "PLAN", "--id", issueId], vars), JSON.parse(PLAN));
  const into = fixture("decomp.json", JSON.stringify({ children: [
    { title: "Implementar fatia", type: "Feat", action: "Implement", problem: "p", plan: JSON.parse(PLAN) }] }));
  run(["decompose", "--id", issueId, "--into", into, "--agent", "pi"], vars); // trava: filha Implement
  const issue = json(["status", "--id", issueId, "--agent", "pi",
    "--status", "AWAITING", "--comment", "fim"], vars);
  assert.equal(issue.status, "AWAITING");
});

// --- Testes in-process: cobertura de linha do cli.ts/cli_design.ts (mesmo processo).
// Sem capturar stdout: o runner TAP também escreve em process.stdout (async) e a captura
// engoliria o relato dos testes; o contrato exato de saída já é garantido pelos e2e acima.
// As asserções aqui são por estado em disco + process.exitCode.

async function withIssuesRoot(root: string, fn: () => Promise<void>): Promise<void> {
  const previous = process.env.ISSUES_ROOT;
  process.env.ISSUES_ROOT = root;
  try {
    await fn(); // await: restaurar o env só depois do corpo async inteiro
  } finally {
    if (previous === undefined) delete process.env.ISSUES_ROOT;
    else process.env.ISSUES_ROOT = previous;
  }
}

// Roda a ação (fire-and-forget no caso de main), drena as microtasks pendentes e
// devolve o exitCode resultante. setImmediate roda após TODAS as microtasks: os
// caminhos de design sem engine resolvem só em promises, então o dreno é determinístico.
async function exitCodeAfter(action: () => unknown): Promise<number | string | undefined> {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    await action();
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
    return process.exitCode;
  } finally {
    process.exitCode = previous;
  }
}

function inprocSetup(root: string): { issueId: string; queue: Queue } {
  createProject({ name: "demo", repo: root }, root);
  const issue = createIssue({ title: "d", project: "demo", type: "Feat", action: "Design",
    problem: "p", actor: "pi" }, root);
  return { issueId: issue.id, queue: new Queue(root) };
}

test("in-process: runDesign cobre doc/add/erros e printDesignPackage", async () => {
  const root = mkdtempSync(join(tmpdir(), "issues-design-inproc-"));
  await withIssuesRoot(root, async () => {
    const { issueId, queue } = inprocSetup(root);

    const doc = await exitCodeAfter(() => runDesign(["doc", "--issue", issueId,
      "--file", fixture("design.md", "# Design")]));
    assert.equal(doc, undefined);
    assert.equal(queue.artifacts.readText("demo", { issueId, type: "document", name: "design.md" }), "# Design");

    const added = await exitCodeAfter(() => runDesign(["add", "--issue", issueId,
      "--kind", "class", "--file", fixture("c.puml", VALID_CLASS), "--pretty"]));
    assert.equal(added, undefined);
    assert.equal(queue.artifacts.readText("demo", { issueId, type: "uml", name: "class.puml" }), VALID_CLASS);

    const empty = await exitCodeAfter(() => runDesign(["doc", "--issue", issueId,
      "--file", fixture("vazio.md", " ")]));
    assert.equal(empty, 1);
    assert.equal(queue.artifacts.readText("demo", { issueId, type: "document", name: "design.md" }), "# Design"); // nada regravado

    const changed = await exitCodeAfter(() => runDesign(["changed", "--issue", issueId, "--value", "true"]));
    assert.equal(changed, undefined);
    assert.equal(queue.loadRequired(issueId).architecture_changed, true);
    assert.equal(await exitCodeAfter(() => runDesign(["changed", "--issue", issueId, "--value", "sim"])), 1); // valor inválido

    assert.equal(await exitCodeAfter(() => runDesign(["bogus"])), 1); // usage
    assert.equal(await exitCodeAfter(() => runDesign(["doc", "solto"])), 1); // argumento posicional
    assert.equal(await exitCodeAfter(() => runDesign(["doc", "--issue", issueId])), 1); // --file faltando

    assert.equal(await exitCodeAfter(() => printDesignPackage(issueId, true)), undefined);
    assert.equal(await exitCodeAfter(() => printDesignPackage("nope", false)), 1); // NotFound cru
  });
});

test("in-process: gate de Design em main(['status'…]) sai com exit 1 e nada muda", async () => {
  const root = mkdtempSync(join(tmpdir(), "issues-design-gate-"));
  await withIssuesRoot(root, async () => {
    const { issueId } = inprocSetup(root);
    await exitCodeAfter(() => main(["next", "--id", issueId, "--agent", "pi"]));
    const denied = await exitCodeAfter(() => main(["status", "--id", issueId,
      "--agent", "pi", "--status", "AWAITING", "--comment", "fim"])); // runStatus() -> reportCliError()
    assert.equal(denied, 1);
    assert.equal(new Queue(root).loadRequired(issueId).status, "CLAIMED"); // permanece
  });
});

test("in-process: main() roteia design e normaliza get DESIGN posicional", async () => {
  const root = mkdtempSync(join(tmpdir(), "issues-design-main-"));
  await withIssuesRoot(root, async () => {
    const { issueId, queue } = inprocSetup(root);

    const doc = await exitCodeAfter(() => main(["design", "doc", "--issue", issueId,
      "--file", fixture("design.md", "# Design")]));
    assert.equal(doc, undefined);
    assert.equal(queue.artifacts.readText("demo", { issueId, type: "document", name: "design.md" }), "# Design"); // rota design de main()

    assert.equal(await exitCodeAfter(() => main(["get", "DESIGN", "--id", issueId])), undefined); // posicional ok
    assert.equal(await exitCodeAfter(() => main(["get", "DESIGN", "--id", "nope"])), 1); // NotFound via dispatch
    assert.equal(await exitCodeAfter(() => main(["design", "bogus"])), 1); // usage via rota de main()
  });
});

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { main } from "../../src/cli.js";
import { Queue } from "../../src/domain/queue_repository.js";

const bin = resolve("bin/issues");
const env = () => ({ ...process.env, ISSUES_ROOT: mkdtempSync(join(tmpdir(), "issues-cli-")) });
const run = (args: string[], vars: NodeJS.ProcessEnv) =>
  execFileSync(bin, args, { env: vars, encoding: "utf8" });

const createArgs = [
  "create", "--title", "CLI issue", "--project", "demo", "--type", "Feat",
  "--problem", "problem", "--artifacts", "src", "--acceptance-criteria", "done", "--agent", "pi",
];

// A criação de Ticket exige uma Issue classificada (risk+complexity) para derivar a autonomia.
// `issues create` não recebe tags: quem classifica é `issues tag`. Feat·BAIXO·BAIXA → Implement AFK.
const classify = (id: string, vars: NodeJS.ProcessEnv) =>
  run(["tag", "--id", id, "--complexity", "BAIXA", "--risk", "BAIXO", "--human"], vars);

const ticketArgs = (issueId: string) => [
  "ticket", "create", "--issue", issueId, "--type", "Implement", "--objective", "o",
  "--task", "t", "--acceptance-criteria", "c", "--agent", "pi",
];

test("CLI retorna JSON por padrão e next devolve { issue, ticket }", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  assert.equal(created.status, "OPEN");
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.issue.id, created.id);
  assert.equal(claimed.ticket, null);
  const fetched = JSON.parse(run(["get", "--id", created.id], vars));
  assert.equal(fetched.owner, "pi");
});

test("CLI next --id reivindica Issue específica sem --project; sem id nem project falha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const claimed = JSON.parse(run(["next", "--id", created.id, "--agent", "pi"], vars));
  assert.equal(claimed.issue.id, created.id);
  assert.equal(claimed.issue.status, "CLAIMED");
  assert.equal(claimed.ticket, null);
  const missing = spawnSync(bin, ["next", "--agent", "pi"], { env: vars, encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /project is required/);
});

test("CLI exige --human em comandos humanos e devolve erro claro", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const result = spawnSync(bin, ["reset", "--id", created.id, "--comment", "x"], { env: vars, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /human/i);
});

test("CLI --pretty mantém JSON legível", () => {
  const vars = env();
  run(createArgs, vars);
  run(createArgs, vars);
  const output = run(["list", "--project", "demo", "--pretty"], vars);
  assert.match(output, /\n {2}\{/);
  assert.equal(JSON.parse(output).length, 2);
});

test("CLI lista por tipo sem alterar filtros existentes", () => {
  const vars = env();
  run(createArgs, vars);
  run(createArgs.map((arg) => arg === "Feat" ? "Fix" : arg), vars);
  const issues = JSON.parse(run(["list", "--project", "demo", "--type", "Fix"], vars));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, "Fix");
});

test("e2e: ciclo Issue+Ticket via CLI até CLOSED", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  classify(created.id, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const ongoing = JSON.parse(run(ticketArgs(created.id), vars));
  assert.equal(ongoing.status, "ON-GOING");
  const tid = ongoing.tickets[0].id;
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.ticket.id, tid);
  assert.equal(claimed.ticket.status, "CLAIMED");
  run(["ticket", "status", "--issue", created.id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido", "--last"], vars);
  const cid = JSON.parse(run(["get", "--id", created.id], vars)).tickets
    .find((ticket: { type: string }) => ticket.type === "Confirmation").id;
  run(["ticket", "claim", "--issue", created.id, "--id", cid, "--agent", "pi"], vars);
  run(["ticket", "status", "--issue", created.id, "--id", cid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "verificado", "--reason", "concluido"], vars); // avança a Issue para AWAITING
  const closed = JSON.parse(run(["decide", "--id", created.id, "--human", "--status", "CLOSED",
    "--comment", "aceito", "--reason", "concluido"], vars));
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.tickets[0].status, "CLOSED");
});

test("e2e: grupo ticket suporta claim humano, get, list e decisão", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  classify(created.id, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = JSON.parse(run(ticketArgs(created.id), vars)).tickets[0].id;
  run(["ticket", "claim", "--issue", created.id, "--id", tid, "--human"], vars);
  const got = JSON.parse(run(["ticket", "get", "--issue", created.id, "--id", tid], vars));
  assert.equal(got.owner, "human");
  run(["ticket", "status", "--issue", created.id, "--id", tid, "--human",
    "--status", "AWAITING", "--comment", "revisar"], vars);
  const decided = JSON.parse(run(["ticket", "decide", "--issue", created.id, "--id", tid, "--human",
    "--status", "OPEN", "--comment", "corrigir"], vars));
  assert.equal(decided.tickets[0].status, "OPEN");
  const list = JSON.parse(run(["ticket", "list", "--issue", created.id, "--status", "OPEN"], vars));
  assert.equal(list.length, 1);
});

test("e2e: fechamento por IA respeita presença humana", () => {
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

test("e2e: comment --attach anexa mídia na Thread (repetível)", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const dir = mkdtempSync(join(tmpdir(), "issues-attach-"));
  const png = join(dir, "shot.png");
  const mp4 = join(dir, "clip.mp4");
  writeFileSync(png, Buffer.from([137, 80, 78, 71, 1, 2]));
  writeFileSync(mp4, Buffer.from([0, 0, 0, 24]));
  const result = JSON.parse(run(["comment", "--id", created.id, "--agent", "pi",
    "--comment", "evidência", "--attach", png, "--attach", mp4], vars));
  const attachments = result.thread.at(-1).attachments;
  assert.equal(attachments.length, 2);
  assert.equal(attachments[0].kind, "image");
  assert.equal(attachments[1].kind, "video");
  assert.equal(attachments[0].filename, "shot.png");
});

test("e2e: tag insere complexidade/humano/risco em Issue e Ticket; valor inválido falha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  classify(created.id, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = JSON.parse(run(ticketArgs(created.id), vars)).tickets[0].id;
  const tagged = JSON.parse(run(["tag", "--id", created.id,
    "--complexity", "ALTA", "--human-need", "AFK", "--risk", "BAIXO", "--human"], vars));
  assert.deepEqual(tagged.tags, { complexity: "ALTA", human_need: "AFK", risk: "BAIXO" });
  const ticketTagged = JSON.parse(run(["ticket", "tag", "--issue", created.id, "--id", tid,
    "--complexity", "MEDIA", "--risk", "ALTO"], vars));
  // human_need não vem do comando: é derivado da Issue (Feat·BAIXO·ALTA → Implement AFK)
  assert.deepEqual(ticketTagged.tickets[0].tags, { human_need: "AFK", complexity: "MEDIA", risk: "ALTO" });
  const derived = spawnSync(bin, ["ticket", "tag", "--issue", created.id, "--id", tid,
    "--human-need", "HITL"], { env: vars, encoding: "utf8" });
  assert.notEqual(derived.status, 0);
  assert.match(derived.stderr, /derivado/);
  const bad = spawnSync(bin, ["tag", "--id", created.id, "--risk", "ENORME", "--human"], { env: vars, encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Invalid risk: ENORME/);
});

test("CLI next --prompt (fila) retorna Markdown apontando sdlc-workflow, não JSON", () => {
  const vars = env();
  run(createArgs, vars);
  const output = run(["next", "--prompt", "--agent", "pi", "--project", "demo"], vars);
  assert.match(output, /sdlc-workflow/);
  assert.throws(() => JSON.parse(output));
});

test("CLI next --prompt --id reivindica Issue específica como Markdown", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const output = run(["next", "--prompt", "--id", created.id, "--agent", "pi"], vars);
  assert.match(output, /sdlc-workflow/);
  assert.match(output, /## Issue/);
  assert.throws(() => JSON.parse(output));
});

test("CLI next --prompt com Ticket claimado inclui ## Ticket com o tipo", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  classify(created.id, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  run(ticketArgs(created.id), vars);
  const output = run(["next", "--prompt", "--agent", "pi", "--project", "demo"], vars);
  assert.match(output, /## Ticket/);
  assert.match(output, /- Tipo: /);
});

test("CLI next sem --prompt mantém JSON { issue, ticket } (regressão)", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.issue.id, created.id);
  assert.equal(claimed.ticket, null);
});

test("CLI next --prompt com fila vazia = stdout vazio e exit 0", () => {
  const vars = env();
  const result = spawnSync(bin, ["next", "--prompt", "--agent", "pi", "--project", "demo"], { env: vars, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("e2e: artifact grava .md da Issue/Ticket e create --artifact-file grava no id novo", () => {
  const vars = env();
  const dir = mkdtempSync(join(tmpdir(), "issues-art-"));
  const md = join(dir, "doc.md");
  writeFileSync(md, "# artefato");
  const queue = new Queue(vars.ISSUES_ROOT);

  const created = JSON.parse(run(createArgs.concat("--artifact-file", md), vars));
  assert.equal(queue.readArtifact("demo", created.id), "# artefato");

  const updated = join(dir, "up.md");
  writeFileSync(updated, "# issue atualizado");
  const ok = JSON.parse(run(["artifact", "--id", created.id, "--file", updated], vars));
  assert.deepEqual(ok, { ok: true, id: created.id });
  assert.equal(queue.readArtifact("demo", created.id), "# issue atualizado");

  classify(created.id, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = JSON.parse(run(ticketArgs(created.id).concat("--artifact-file", md), vars)).tickets[0].id;
  assert.equal(queue.readArtifact("demo", tid), "# artefato");
  const tmd = join(dir, "t.md");
  writeFileSync(tmd, "# ticket doc");
  run(["ticket", "artifact", "--issue", created.id, "--id", tid, "--file", tmd], vars);
  assert.equal(queue.readArtifact("demo", tid), "# ticket doc");
});

test("e2e: get/next/ticket get imprimem os campos de artefato no JSON", () => {
  const vars = env();
  const dir = mkdtempSync(join(tmpdir(), "issues-view-"));
  const md = join(dir, "doc.md");
  writeFileSync(md, "# art issue");
  const created = JSON.parse(run(createArgs.concat("--artifact-file", md), vars));

  assert.equal(JSON.parse(run(["get", "--id", created.id], vars)).artifact, "# art issue");
  classify(created.id, vars);
  const queued = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(queued.issue.artifact, "# art issue"); // só-issue: artifact presente, ticket null
  assert.equal(queued.ticket, null);

  const tmd = join(dir, "t.md");
  writeFileSync(tmd, "# art ticket");
  const tid = JSON.parse(run(ticketArgs(created.id).concat("--artifact-file", tmd), vars)).tickets[0].id;
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.ticket.id, tid);
  assert.equal(claimed.ticket.artifact, "# art ticket");
  assert.equal(claimed.ticket.issue_artifact, "# art issue");

  const got = JSON.parse(run(["ticket", "get", "--issue", created.id, "--id", tid], vars));
  assert.equal(got.artifact, "# art ticket");
  assert.equal(got.issue_artifact, "# art issue");
});

test("e2e: reset humano libera Issue CLAIMED e subcomando ticket inválido falha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "cursor", "--project", "demo"], vars);
  const reset = JSON.parse(run(["reset", "--id", created.id, "--human", "--comment", "liberar"], vars));
  assert.equal(reset.owner, null);
  const bogus = spawnSync(bin, ["ticket", "bogus", "--issue", created.id], { env: vars, encoding: "utf8" });
  assert.notEqual(bogus.status, 0);
  assert.match(bogus.stderr, /Usage: issues ticket/);
});

// --- Testes in-process: cobertura de linha (--experimental-test-coverage) só é registrada
// para código executado no mesmo processo; execFileSync/spawnSync acima cobre o comportamento
// e2e mas não a instrumentação de linha do próprio cli.ts. Chamamos main() diretamente aqui.

async function withIssuesRoot<T>(root: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.env.ISSUES_ROOT;
  process.env.ISSUES_ROOT = root;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.ISSUES_ROOT;
    else process.env.ISSUES_ROOT = previous;
  }
}

// async: a rota `ticket` de main() devolve Promise (gate de Design); await captura a saída completa.
async function captureMain(argv: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | string | undefined }> {
  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: unknown) => { outChunks.push(String(chunk)); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => { errChunks.push(String(chunk)); return true; }) as typeof process.stderr.write;
  process.exitCode = undefined;
  try {
    await main(argv);
    return { stdout: outChunks.join(""), stderr: errChunks.join(""), exitCode: process.exitCode };
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
}

const inprocRoot = () => mkdtempSync(join(tmpdir(), "issues-inproc-"));

// Mesma classificação do `classify` acima, pela via in-process (captureMain).
const classifyMain = (id: string) => captureMain(["tag", "--id", id, "--complexity", "BAIXA", "--risk", "BAIXO", "--human"]);

test("in-process: main() cobre ticket/worktree/requirements fora do execute() principal", async () => {
  const root = inprocRoot();
  await withIssuesRoot(root, async () => {
    const created = JSON.parse((await captureMain(createArgs)).stdout);
    await classifyMain(created.id);
    await captureMain(["next", "--agent", "pi", "--project", "demo"]);
    const ongoing = JSON.parse((await captureMain(ticketArgs(created.id))).stdout);
    assert.equal(ongoing.status, "ON-GOING"); // passou por runTicket() -> ticket() -> ticketCreate()
    const tid = ongoing.tickets[0].id;
    const commented = JSON.parse((await captureMain(["ticket", "comment", "--issue", created.id, "--id", tid,
      "--agent", "pi", "--comment", "nota"])).stdout); // ticketComment()
    assert.equal(commented.tickets[0].thread.at(-1).comment, "nota");

    const repo = mkdtempSync(join(tmpdir(), "issues-inproc-repo-"));
    execFileSync("git", ["init", "-b", "main"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
    execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: repo });
    const previousCwd = process.cwd();
    process.chdir(repo);
    try {
      const added = JSON.parse((await captureMain(["worktree", "add", "--id", created.id])).stdout);
      assert.ok(added.worktree); // runWorktree() -> worktree("add")
      const removed = JSON.parse((await captureMain(["worktree", "remove", "--id", created.id])).stdout);
      assert.equal(removed.worktree, null); // worktree("remove")
    } finally {
      process.chdir(previousCwd);
    }

    const reqFile = join(mkdtempSync(join(tmpdir(), "issues-inproc-req-")), "req.json");
    writeFileSync(reqFile, JSON.stringify({
      features: ["Feature: Login\n  Como um usuário\n  Eu quero poder entrar\n  Para que eu acesse\n\n  Scenario: ok\n    Given a tela\n    When entro\n    Then vejo o painel"],
    }));
    const saved = await captureMain(["requirements", "set", "--id", created.id, "--file", reqFile]);
    assert.equal(JSON.parse(saved.stdout).features.length, 1); // runRequirements() -> requirements("set")

    const badWorktree = await captureMain(["worktree", "bogus", "--id", created.id]);
    assert.match(badWorktree.stderr, /Usage: issues worktree/);
    const badRequirements = await captureMain(["requirements", "bogus", "--id", created.id]);
    assert.match(badRequirements.stderr, /Usage: issues requirements/);
  });
});

test("in-process: main() cobre status/decide/reset/ticket decide e get --target REQUIREMENTS", async () => {
  const root = inprocRoot();
  await withIssuesRoot(root, async () => {
    // status (execute() "status" branch, já parcialmente coberto via spawn) + decide + reset
    const forStatus = JSON.parse((await captureMain(createArgs)).stdout);
    const closed = JSON.parse((await captureMain(["status", "--id", forStatus.id, "--agent", "pi",
      "--status", "CLOSED", "--comment", "x", "--reason", "concluido"])).stdout);
    assert.equal(closed.status, "CLOSED");

    const forReset = JSON.parse((await captureMain(createArgs)).stdout);
    await captureMain(["next", "--id", forReset.id, "--agent", "pi"]);
    const afterReset = JSON.parse((await captureMain(["reset", "--id", forReset.id, "--human", "--comment", "liberar"])).stdout);
    assert.equal(afterReset.owner, null);

    const forDecide = JSON.parse((await captureMain(createArgs)).stdout);
    await classifyMain(forDecide.id);
    await captureMain(["next", "--id", forDecide.id, "--agent", "pi"]);
    const ticket = JSON.parse((await captureMain(ticketArgs(forDecide.id))).stdout);
    const tid = ticket.tickets[0].id;
    await captureMain(["next", "--id", forDecide.id, "--agent", "pi"]); // claim o Ticket
    await captureMain(["ticket", "status", "--issue", forDecide.id, "--id", tid, "--agent", "pi",
      "--status", "CLOSED", "--comment", "feito", "--reason", "concluido", "--last"]);
    const confId = JSON.parse((await captureMain(["get", "--id", forDecide.id])).stdout).tickets
      .find((t: { type: string }) => t.type === "Confirmation").id;
    // ticket claim/status humano cobre actorFrom() com --human (linha 246)
    await captureMain(["ticket", "claim", "--issue", forDecide.id, "--id", confId, "--human"]);
    await captureMain(["ticket", "status", "--issue", forDecide.id, "--id", confId, "--human",
      "--status", "AWAITING", "--comment", "para decisão"]);
    await captureMain(["ticket", "decide", "--issue", forDecide.id, "--id", confId, "--human",
      "--status", "CLOSED", "--comment", "verificado", "--reason", "concluido"]);
    const decided = JSON.parse((await captureMain(["decide", "--id", forDecide.id, "--human",
      "--status", "CLOSED", "--comment", "aceito", "--reason", "concluido"])).stdout);
    assert.equal(decided.status, "CLOSED");

    const reqFile = join(mkdtempSync(join(tmpdir(), "issues-inproc-req2-")), "req.json");
    writeFileSync(reqFile, JSON.stringify({
      features: ["Feature: X\n  Como um usuário\n  Eu quero poder entrar\n  Para que eu acesse\n\n  Scenario: ok\n    Given a\n    When b\n    Then c"],
    }));
    await captureMain(["requirements", "set", "--id", forDecide.id, "--file", reqFile]);
    const reqs = await captureMain(["get", "--id", forDecide.id, "--target", "REQUIREMENTS"]);
    assert.equal(JSON.parse(reqs.stdout).features.length, 1); // get() branch --target REQUIREMENTS
  });
});

test("in-process: main() cobre next sem --prompt, init com/sem --dogfood, --attach e conflito --human/--agent", async () => {
  const root = inprocRoot();
  await withIssuesRoot(root, async () => {
    const created = JSON.parse((await captureMain(createArgs)).stdout);
    const claimed = await captureMain(["next", "--agent", "pi", "--project", "demo"]); // claimNext()/next() sem --prompt
    assert.equal(JSON.parse(claimed.stdout).issue.id, created.id);

    const dogfoodTarget = mkdtempSync(join(tmpdir(), "issues-inproc-dogfood-"));
    const dogfood = await captureMain(["init", "--dogfood", "--target", dogfoodTarget]);
    assert.ok(JSON.parse(dogfood.stdout).linked.length >= 1); // init() branch --dogfood

    const plainTarget = mkdtempSync(join(tmpdir(), "issues-inproc-plain-"));
    const plain = await captureMain(["init", "--target", plainTarget]);
    assert.ok(JSON.parse(plain.stdout).installed.length >= 1); // init() branch sem --dogfood

    const dir = mkdtempSync(join(tmpdir(), "issues-inproc-att-"));
    const png = join(dir, "shot.png");
    writeFileSync(png, Buffer.from([137, 80, 78, 71, 9]));
    const commented = await captureMain(["comment", "--id", created.id, "--agent", "pi",
      "--comment", "evidência", "--attach", png]); // parseOptions: --attach (linhas 230-232)
    assert.equal(JSON.parse(commented.stdout).thread.at(-1).attachments[0].kind, "image");

    const conflict = await captureMain(["create", "--title", "x", "--project", "demo", "--type", "Feat",
      "--problem", "p", "--human", "--agent", "pi"]); // actorFrom(): --human e --agent juntos
    assert.match(conflict.stderr, /Choose --human or --agent/);
    assert.equal(conflict.exitCode, 1);
  });
  process.exitCode = undefined; // captureMain simula erro (--human --agent); não deixa vazar pro processo de teste
});

test("in-process: parseOptions cobre --attach/flag no fim dos args (sem valor) e comment sem --comment", async () => {
  const root = inprocRoot();
  await withIssuesRoot(root, async () => {
    const created = JSON.parse((await captureMain(createArgs)).stdout);
    const dir = mkdtempSync(join(tmpdir(), "issues-inproc-attonly-"));
    const png = join(dir, "shot.png");
    writeFileSync(png, Buffer.from([137, 80, 78, 71, 3]));
    // comment sem --comment: optional(options,"comment") ?? "" cai no fallback (só anexo)
    const commented = JSON.parse((await captureMain(["comment", "--id", created.id, "--agent", "pi", "--attach", png])).stdout);
    const lastEntry = commented.thread.at(-1);
    assert.equal(lastEntry.comment, "");
    assert.equal(lastEntry.attachments[0].kind, "image");

    // --title no fim dos args sem valor: args[++index] ?? "" cai no fallback -> value() rejeita string vazia
    const missingValue = await captureMain(["create", "--project", "demo", "--type", "Feat", "--problem", "p", "--agent", "pi", "--title"]);
    assert.match(missingValue.stderr, /--title is required/);

    // --attach no fim dos args sem valor: mesmo fallback, mas dentro do ramo dedicado de --attach
    const missingAttach = await captureMain(["comment", "--id", created.id, "--agent", "pi", "--comment", "x", "--attach"]);
    assert.match(missingAttach.stderr, /Unsupported attachment extension/);
  });
  process.exitCode = undefined; // as duas últimas chamadas simulam erro; não deixa vazar pro processo de teste
});

test("in-process: --port negativo é rejeitado por optionalNumber antes de subir o servidor (result < 0)", async () => {
  // optionalNumber(options,"port") é avaliado (e lança) antes de startWebServer ser chamado:
  // nenhum servidor chega a subir aqui, diferente de um --port válido.
  const negative = await captureMain(["web", "--port", "-1", "--no-open"]);
  assert.match(negative.stderr, /--port must be a non-negative integer/);
  process.exitCode = undefined;
});

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { main } from "../../src/cli.js";
import { Queue } from "../../src/domain/queue_repository.js";

const bin = resolve("bin/issues");
const run = (args: string[], vars: NodeJS.ProcessEnv) =>
  execFileSync(bin, args, { env: vars, encoding: "utf8" });

// Toda raiz nasce com o projeto "demo" registrado: Issues só existem em projeto registrado.
const env = () => {
  const root = mkdtempSync(join(tmpdir(), "issues-cli-"));
  const vars = { ...process.env, ISSUES_ROOT: root };
  run(["project", "create", "--name", "demo", "--repo", root], vars);
  return vars;
};

// Os fluxos genéricos usam a action Review; seu gate exige intent + 2 evidence + veredito, semeados
// via seedReview nos testes que concluem a Issue.
const createArgs = [
  "create", "--title", "CLI issue", "--project", "demo", "--type", "Feat", "--action", "Review",
  "--problem", "problem", "--acceptance-criteria", "done", "--agent", "pi",
];
const qaDir = mkdtempSync(join(tmpdir(), "issues-cli-qa-"));
const qaFile = (name: string, content: string): string => { const p = join(qaDir, name); writeFileSync(p, content); return p; };
const intentFile = qaFile("intent.md", "# intenção");
const evAFile = qaFile("evidence-a.md", "# evidência a");
const evBFile = qaFile("evidence-b.md", "# evidência b");
const verdictFile = qaFile("verdict.md", "APROVADO revisão ok");
const handoffFile = qaFile("handoff.md", "# handoff"); // obrigatório ao enviar para AWAITING
const seedReview = (vars: NodeJS.ProcessEnv, id: string): void => {
  run(["artifact", "--id", id, "--name", "intent.md", "--file", intentFile], vars);
  run(["artifact", "--id", id, "--name", "evidence-a.md", "--file", evAFile], vars);
  run(["artifact", "--id", id, "--name", "evidence-b.md", "--file", evBFile], vars);
  run(["artifact", "--id", id, "--file", verdictFile], vars);
  run(["artifact", "--id", id, "--name", "handoff.md", "--file", handoffFile], vars);
};

test("CLI retorna JSON por padrão e next devolve a IssueView reivindicada", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  assert.equal(created.status, "OPEN");
  assert.equal(created.action, "Review");
  const claimed = JSON.parse(run(["next", "--agent", "pi", "--project", "demo"], vars));
  assert.equal(claimed.id, created.id);
  assert.equal(claimed.status, "CLAIMED");
  const fetched = JSON.parse(run(["get", "--id", created.id], vars));
  assert.equal(fetched.owner, "pi");
});

// Observado no HomeInventory: o agente pulou `next`, achou a Issue com `list`, leu tudo com `get` e
// implementou — a Issue seguiu OPEN e sem dono, e ele nunca viu o contrato da action.
test("CLI get recusa Issue OPEN e aponta o claim; depois de reivindicada, lê normalmente", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const denied = spawnSync(bin, ["get", "--id", created.id], { env: vars, encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, new RegExp(`Issue ${created.id} está OPEN`));
  assert.match(denied.stderr, new RegExp(`issues next --id ${created.id} --agent <ia>`));
  // A trava cobre todos os alvos de get, não só a view padrão.
  for (const target of ["REQUIREMENTS", "PLAN", "DESIGN"]) {
    const blocked = spawnSync(bin, ["get", target, "--id", created.id], { env: vars, encoding: "utf8" });
    assert.notEqual(blocked.status, 0, `get ${target} deveria recusar OPEN`);
    assert.match(blocked.stderr, /está OPEN/, `get ${target}`);
  }
  run(["next", "--id", created.id, "--agent", "pi"], vars);
  assert.equal(JSON.parse(run(["get", "--id", created.id], vars)).status, "CLAIMED");
});

test("CLI create sem projeto registrado falha com orientação", () => {
  const root = mkdtempSync(join(tmpdir(), "issues-cli-noproj-"));
  const vars = { ...process.env, ISSUES_ROOT: root };
  const denied = spawnSync(bin, createArgs, { env: vars, encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /Projeto não registrado.*project create/);
});

test("CLI project create/list registram repo", () => {
  const vars = env();
  const created = JSON.parse(run(["project", "create", "--name", "outro",
    "--repo", vars.ISSUES_ROOT as string], vars));
  assert.equal(created.repo, vars.ISSUES_ROOT);
  assert.equal(created.concern, "LOW"); // sem --concern: default LOW
  const alta = JSON.parse(run(["project", "create", "--name", "alta",
    "--repo", vars.ISSUES_ROOT as string, "--concern", "HIGH"], vars));
  assert.equal(alta.concern, "HIGH");
  const invalido = spawnSync(bin, ["project", "create", "--name", "x",
    "--repo", vars.ISSUES_ROOT as string, "--concern", "MEDIUM"], { env: vars, encoding: "utf8" });
  assert.notEqual(invalido.status, 0);
  assert.match(invalido.stderr, /concern inválido/);
  const listed = JSON.parse(run(["project", "list"], vars));
  assert.deepEqual(listed.map((project: { name: string }) => project.name).sort(), ["alta", "demo", "outro"]);
  const bogus = spawnSync(bin, ["project", "bogus"], { env: vars, encoding: "utf8" });
  assert.notEqual(bogus.status, 0);
  assert.match(bogus.stderr, /Usage: issues project/);
});

test("CLI next --id reivindica Issue específica sem --project; sem id nem project falha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const claimed = JSON.parse(run(["next", "--id", created.id, "--agent", "pi"], vars));
  assert.equal(claimed.id, created.id);
  assert.equal(claimed.status, "CLAIMED");
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

test("e2e: ciclo AFK via CLI — IA reivindica, entrega evidência e fecha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  seedReview(vars, created.id);
  const closed = JSON.parse(run(["status", "--id", created.id, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito: passos e decisões", "--reason", "concluido"], vars));
  assert.equal(closed.status, "CLOSED");
});

test("e2e: ciclo HITL via CLI — AWAITING pela IA, decisão humana fecha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs.concat("--human-need", "HITL"), vars));
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  seedReview(vars, created.id);
  const denied = spawnSync(bin, ["status", "--id", created.id, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido"], { env: vars, encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /decisão humana/);
  run(["status", "--id", created.id, "--agent", "pi", "--status", "AWAITING", "--comment", "evidência"], vars);
  // Aprovar gera APPROVED; o agente reivindica a aprovada e a fecha (fluxo novo).
  const approved = JSON.parse(run(["decide", "--id", created.id, "--human", "--status", "APPROVED", "--comment", "aceito"], vars));
  assert.equal(approved.status, "APPROVED");
  run(["next", "--id", created.id, "--agent", "pi"], vars);
  const closed = JSON.parse(run(["status", "--id", created.id, "--agent", "pi", "--status", "CLOSED",
    "--comment", "handoff executado", "--reason", "concluido"], vars));
  assert.equal(closed.status, "CLOSED");
});

test("e2e: relate liga Issues e get devolve a linhagem com artefatos", () => {
  const vars = env();
  const dir = mkdtempSync(join(tmpdir(), "issues-rel-"));
  const md = join(dir, "spec.md");
  writeFileSync(md, "# spec congelada");
  const design = JSON.parse(run(["create", "--title", "design", "--project", "demo", "--type", "Feat",
    "--action", "Design", "--problem", "p", "--artifact-file", md, "--agent", "pi"], vars));
  const impl = JSON.parse(run(createArgs, vars));
  const related = JSON.parse(run(["relate", "--id", impl.id, "--relates", design.id, "--kind", "child"], vars));
  assert.deepEqual(related.relates, [{ id: design.id, kind: "child" }]);
  for (const id of [impl.id, design.id]) run(["next", "--id", id, "--agent", "pi"], vars); // get recusa OPEN
  const view = JSON.parse(run(["get", "--id", impl.id], vars));
  assert.equal(view.related[0].artifact, "# spec congelada");
  const target = JSON.parse(run(["get", "--id", design.id], vars));
  assert.deepEqual(target.relates, [{ id: impl.id, kind: "parent" }]); // par recíproco na alvo
  const missing = spawnSync(bin, ["relate", "--id", impl.id], { env: vars, encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--relates is required/);
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

test("e2e: comment --role grava o papel na Thread e rejeita papel fora do enum", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const result = JSON.parse(run(["comment", "--id", created.id, "--agent", "pi",
    "--comment", "revisei o design", "--role", "architect"], vars));
  assert.equal(result.thread.at(-1).role, "architect");
  const bad = spawnSync(bin, ["comment", "--id", created.id, "--agent", "pi",
    "--comment", "x", "--role", "wizard"], { env: vars, encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Invalid role: wizard/);
});

test("e2e: tag insere complexidade/humano/risco; valor inválido falha", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const tagged = JSON.parse(run(["tag", "--id", created.id,
    "--complexity", "ALTA", "--human-need", "AFK", "--risk", "BAIXO", "--human"], vars));
  assert.deepEqual(tagged.tags, { complexity: "ALTA", human_need: "AFK", risk: "BAIXO" });
  const bad = spawnSync(bin, ["tag", "--id", created.id, "--risk", "ENORME", "--human"], { env: vars, encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Invalid risk: ENORME/);
});

test("CLI next --prompt (fila) retorna Markdown apontando sdlc-workflow, não JSON", () => {
  const vars = env();
  run(createArgs, vars);
  const output = run(["next", "--prompt", "--agent", "pi", "--project", "demo"], vars);
  assert.match(output, /sdlc-workflow/);
  assert.match(output, /action `Review`/);
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

test("CLI next --prompt com fila vazia = stdout vazio e exit 0", () => {
  const vars = env();
  const result = spawnSync(bin, ["next", "--prompt", "--agent", "pi", "--project", "demo"], { env: vars, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("e2e: artifact grava .md da Issue e create --artifact-file grava no id novo", () => {
  const vars = env();
  const dir = mkdtempSync(join(tmpdir(), "issues-art-"));
  const md = join(dir, "doc.md");
  writeFileSync(md, "# artefato");
  const queue = new Queue(vars.ISSUES_ROOT);

  const created = JSON.parse(run(createArgs.concat("--artifact-file", md), vars));
  assert.equal(queue.artifacts.readText("demo", { issueId: created.id, type: "document" }), "# artefato");

  const updated = join(dir, "up.md");
  writeFileSync(updated, "# issue atualizado");
  const ok = JSON.parse(run(["artifact", "--id", created.id, "--file", updated], vars));
  assert.deepEqual(ok, { ok: true, id: created.id });
  assert.equal(queue.artifacts.readText("demo", { issueId: created.id, type: "document" }), "# issue atualizado");
  run(["next", "--id", created.id, "--agent", "pi"], vars); // get recusa OPEN
  assert.equal(JSON.parse(run(["get", "--id", created.id], vars)).artifact, "# issue atualizado");
});

test("e2e: artefato grande é rejeitado com orientação de decomposição", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  const dir = mkdtempSync(join(tmpdir(), "issues-artbig-"));
  const md = join(dir, "big.md");
  writeFileSync(md, Array(301).fill("palavra").join(" "));
  const denied = spawnSync(bin, ["artifact", "--id", created.id, "--file", md], { env: vars, encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /limite 300/);
  assert.match(denied.stderr, /Issues menores relacionadas/);
});

test("e2e: reset humano libera Issue CLAIMED e comando inválido falha com usage", () => {
  const vars = env();
  const created = JSON.parse(run(createArgs, vars));
  run(["next", "--agent", "cursor", "--project", "demo"], vars);
  const reset = JSON.parse(run(["reset", "--id", created.id, "--human", "--comment", "liberar"], vars));
  assert.equal(reset.owner, null);
  const bogus = spawnSync(bin, ["bogus"], { env: vars, encoding: "utf8" });
  assert.notEqual(bogus.status, 0);
  assert.match(bogus.stderr, /Usage: issues/);
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

// async: a rota `status` de main() devolve Promise (gate da action); await captura a saída completa.
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

const inprocRoot = async () => {
  const root = mkdtempSync(join(tmpdir(), "issues-inproc-"));
  await withIssuesRoot(root, () => captureMain(["project", "create", "--name", "demo", "--repo", root]));
  return root;
};

test("in-process: main() cobre project/requirements/relate fora do execute() principal", async () => {
  const root = await inprocRoot();
  await withIssuesRoot(root, async () => {
    const created = JSON.parse((await captureMain(createArgs)).stdout);
    const listed = JSON.parse((await captureMain(["project", "list"])).stdout);
    assert.equal(listed[0].name, "demo"); // runProject() -> project("list")

    const other = JSON.parse((await captureMain(createArgs)).stdout);
    const related = JSON.parse((await captureMain(["relate", "--id", created.id, "--relates", other.id])).stdout);
    assert.deepEqual(related.relates, [{ id: other.id, kind: "see-also" }]); // relate() default see-also

    const reqIssue = JSON.parse((await captureMain(["create", "--title", "req", "--project", "demo",
      "--type", "Feat", "--action", "Planning", "--problem", "p", "--agent", "pi"])).stdout);
    const reqFile = join(mkdtempSync(join(tmpdir(), "issues-inproc-req-")), "req.jsonl");
    writeFileSync(reqFile, JSON.stringify({ feature: "Login", como: "usuário", quero: "entrar",
      para: "acesse o painel", scenarios: [{ nome: "ok", steps: ["Given a tela", "When entro", "Then vejo o painel"] }] }));
    const saved = await captureMain(["requirements", "set", "--id", reqIssue.id, "--file", reqFile]);
    assert.equal(JSON.parse(saved.stdout).features.length, 1); // runRequirements() -> requirements("set")
    await captureMain(["next", "--id", reqIssue.id, "--agent", "pi"]); // get recusa OPEN
    const reqs = await captureMain(["get", "--id", reqIssue.id, "--target", "REQUIREMENTS"]);
    assert.equal(JSON.parse(reqs.stdout).features.length, 1); // get() branch --target REQUIREMENTS

    const badRequirements = await captureMain(["requirements", "bogus", "--id", created.id]);
    assert.match(badRequirements.stderr, /Usage: issues requirements/);
  });
  process.exitCode = undefined;
});

test("in-process: main() cobre status/decide/reset e o gate assíncrono de status", async () => {
  const root = await inprocRoot();
  await withIssuesRoot(root, async () => {
    const forStatus = JSON.parse((await captureMain(createArgs)).stdout);
    await captureMain(["next", "--id", forStatus.id, "--agent", "pi"]);
    await captureMain(["artifact", "--id", forStatus.id, "--name", "intent.md", "--file", intentFile]); // gate Review
    await captureMain(["artifact", "--id", forStatus.id, "--name", "evidence-a.md", "--file", evAFile]);
    await captureMain(["artifact", "--id", forStatus.id, "--name", "evidence-b.md", "--file", evBFile]);
    await captureMain(["artifact", "--id", forStatus.id, "--file", verdictFile]);
    const closed = JSON.parse((await captureMain(["status", "--id", forStatus.id, "--agent", "pi",
      "--status", "CLOSED", "--comment", "feito", "--reason", "concluido"])).stdout);
    assert.equal(closed.status, "CLOSED"); // runStatus() assíncrono

    const forReset = JSON.parse((await captureMain(createArgs)).stdout);
    await captureMain(["next", "--id", forReset.id, "--agent", "pi"]);
    const afterReset = JSON.parse((await captureMain(["reset", "--id", forReset.id, "--human", "--comment", "liberar"])).stdout);
    assert.equal(afterReset.owner, null);

    const forDecide = JSON.parse((await captureMain(createArgs.concat("--human-need", "HITL"))).stdout);
    await captureMain(["next", "--id", forDecide.id, "--agent", "pi"]);
    await captureMain(["artifact", "--id", forDecide.id, "--name", "intent.md", "--file", intentFile]); // gate Review
    await captureMain(["artifact", "--id", forDecide.id, "--name", "evidence-a.md", "--file", evAFile]);
    await captureMain(["artifact", "--id", forDecide.id, "--name", "evidence-b.md", "--file", evBFile]);
    await captureMain(["artifact", "--id", forDecide.id, "--file", verdictFile]);
    await captureMain(["artifact", "--id", forDecide.id, "--name", "handoff.md", "--file", handoffFile]);
    await captureMain(["status", "--id", forDecide.id, "--agent", "pi", "--status", "AWAITING", "--comment", "evidência"]);
    const decided = JSON.parse((await captureMain(["decide", "--id", forDecide.id, "--human",
      "--status", "APPROVED", "--comment", "aceito"])).stdout);
    assert.equal(decided.status, "APPROVED");
    await captureMain(["next", "--id", forDecide.id, "--agent", "pi"]);
    const doneDecide = JSON.parse((await captureMain(["status", "--id", forDecide.id, "--agent", "pi",
      "--status", "CLOSED", "--comment", "handoff executado", "--reason", "concluido"])).stdout);
    assert.equal(doneDecide.status, "CLOSED");

    const gateFail = await captureMain(["status", "--id", forStatus.id, "--agent", "pi",
      "--status", "CLOSED", "--comment", "x", "--reason", "concluido"]);
    assert.match(gateFail.stderr, /Expected CLAIMED/); // runStatus() reporta erro com exit 1
    assert.equal(gateFail.exitCode, 1);
  });
  process.exitCode = undefined;
});

test("in-process: main() cobre next sem --prompt, init com/sem --dogfood, --attach e conflito --human/--agent", async () => {
  const root = await inprocRoot();
  await withIssuesRoot(root, async () => {
    const created = JSON.parse((await captureMain(createArgs)).stdout);
    const claimed = await captureMain(["next", "--agent", "pi", "--project", "demo"]); // claimNext()/next() sem --prompt
    assert.equal(JSON.parse(claimed.stdout).id, created.id);

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
      "--comment", "evidência", "--attach", png]); // parseOptions: --attach
    assert.equal(JSON.parse(commented.stdout).thread.at(-1).attachments[0].kind, "image");

    const conflict = await captureMain(["create", "--title", "x", "--project", "demo", "--type", "Feat",
      "--action", "Review", "--problem", "p", "--human", "--agent", "pi"]); // actorFrom(): --human e --agent juntos
    assert.match(conflict.stderr, /Choose --human or --agent/);
    assert.equal(conflict.exitCode, 1);
  });
  process.exitCode = undefined; // captureMain simula erro (--human --agent); não deixa vazar pro processo de teste
});

test("in-process: parseOptions cobre --attach/flag no fim dos args (sem valor) e comment sem --comment", async () => {
  const root = await inprocRoot();
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
    const missingValue = await captureMain(["create", "--project", "demo", "--type", "Feat", "--action", "Review", "--problem", "p", "--agent", "pi", "--title"]);
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

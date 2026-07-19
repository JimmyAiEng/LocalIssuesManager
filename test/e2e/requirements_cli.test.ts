import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// E2E do workflow pela superfície real do usuário-IA: o binário `issues` como processo.
// Cada teste isola seu ISSUES_ROOT num diretório temporário registrando o projeto "demo".
const bin = resolve("bin/issues");
const freshEnv = (): NodeJS.ProcessEnv => {
  const root = mkdtempSync(join(tmpdir(), "issues-e2e-"));
  const vars = { ...process.env, ISSUES_ROOT: root };
  execFileSync(bin, ["project", "create", "--name", "demo", "--repo", root], { env: vars, encoding: "utf8" });
  return vars;
};
const run = (args: string[], vars: NodeJS.ProcessEnv): string => execFileSync(bin, args, { env: vars, encoding: "utf8" });
const attempt = (args: string[], vars: NodeJS.ProcessEnv) => spawnSync(bin, args, { env: vars, encoding: "utf8" });
const json = (args: string[], vars: NodeJS.ProcessEnv) => JSON.parse(run(args, vars));

const createRequired = ["create", "--title", "Bug X", "--project", "demo", "--type", "Fix",
  "--action", "Review", "--problem", "quebra ao salvar", "--agent", "pi"];
const createFull = createRequired.concat("--acceptance-criteria", "salva sem erro");

// createRequired cria Issues Review: o gate exige intent + 2 evidence + veredito. Semeia o conjunto
// nos testes que transicionam a Issue (AWAITING/CLOSED) pela IA.
const qaDir = mkdtempSync(join(tmpdir(), "issues-e2e-qa-"));
const qaFile = (name: string, content: string): string => { const p = join(qaDir, name); writeFileSync(p, content); return p; };
const intentFile = qaFile("intent.md", "# intenção");
const evAFile = qaFile("evidence-a.md", "# evidência a");
const evBFile = qaFile("evidence-b.md", "# evidência b");
const verdictFile = qaFile("verdict.md", "APROVADO revisão ok");
const handoffFile = qaFile("handoff.md", "# handoff"); // obrigatório ao enviar para AWAITING
const seedQa = (vars: NodeJS.ProcessEnv, id: string): void => {
  run(["artifact", "--id", id, "--name", "intent.md", "--file", intentFile], vars);
  run(["artifact", "--id", id, "--name", "evidence-a.md", "--file", evAFile], vars);
  run(["artifact", "--id", id, "--name", "evidence-b.md", "--file", evBFile], vars);
  run(["artifact", "--id", id, "--file", verdictFile], vars);
  run(["artifact", "--id", id, "--name", "handoff.md", "--file", handoffFile], vars);
};
const diskPath = (vars: NodeJS.ProcessEnv, folder: string, id: string) =>
  join(vars.ISSUES_ROOT as string, "projects", "demo", folder, `${id}.json`);

// --- RF-01: criar Issue -------------------------------------------------------
test("RF-01: cria Issue com type+action e problema (AC opcional) e grava em open/", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  assert.equal(created.status, "OPEN");
  assert.equal(created.type, "Fix");
  assert.equal(created.action, "Review");
  assert.equal(created.problem, "quebra ao salvar");
  assert.equal(created.owner, null);
  assert.deepEqual(created.relates, []);
  assert.ok(existsSync(diskPath(vars, "open", created.id)), "Issue OPEN persiste em projects/demo/open");
});

test("RF-01: cria Issue com critérios de aceite opcionais", () => {
  const vars = freshEnv();
  const created = json(createFull, vars);
  assert.equal(created.acceptance_criteria, "salva sem erro");
});

// --- RF-02: next --------------------------------------------------------------
test("RF-02: next reivindica a Issue OPEN mais antiga e devolve a view", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  const claimed = json(["next", "--agent", "pi", "--project", "demo"], vars);
  assert.equal(claimed.id, created.id);
  assert.equal(claimed.status, "CLAIMED");
  assert.equal(json(["get", "--id", created.id], vars).owner, "pi");
});

test("RF-02: next com fila vazia devolve null sem efeito colateral (exit 0)", () => {
  const vars = freshEnv();
  const result = attempt(["next", "--agent", "pi", "--project", "demo"], vars);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout), null);
});

// --- RF-03: conclusão pela IA com evidência -----------------------------------
test("RF-03: IA conclui Issue AFK com evidência (CLAIMED -> CLOSED)", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  seedQa(vars, created.id);
  const closed = json(["status", "--id", created.id, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito: verificado o conjunto, decisões registradas", "--reason", "concluido"], vars);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.thread.at(-1).comment, "feito: verificado o conjunto, decisões registradas");
});

// --- RF-04: HITL exige decisão humana -----------------------------------------
test("RF-04: Issue HITL vai a AWAITING pela IA e o humano decide", () => {
  const vars = freshEnv();
  const created = json(createRequired.concat("--human-need", "HITL"), vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  seedQa(vars, created.id);
  const awaiting = json(["status", "--id", created.id, "--agent", "pi",
    "--status", "AWAITING", "--comment", "evidência para decisão"], vars);
  assert.equal(awaiting.status, "AWAITING");
  assert.ok(existsSync(diskPath(vars, "awaiting", created.id)));
  // Aprovar gera APPROVED; o agente reivindica a aprovada e a fecha (fluxo novo).
  const approved = json(["decide", "--id", created.id, "--human", "--status", "APPROVED", "--comment", "aceito"], vars);
  assert.equal(approved.status, "APPROVED");
  run(["next", "--id", created.id, "--agent", "pi"], vars);
  const closed = json(["status", "--id", created.id, "--agent", "pi",
    "--status", "CLOSED", "--comment", "handoff executado", "--reason", "concluido"], vars);
  assert.equal(closed.status, "CLOSED");
});

test("RF-04: humano devolve a Issue AWAITING -> OPEN (limpa owner)", () => {
  const vars = freshEnv();
  const created = json(createRequired.concat("--human-need", "HITL"), vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  seedQa(vars, created.id);
  run(["status", "--id", created.id, "--agent", "pi", "--status", "AWAITING", "--comment", "evidência"], vars);
  const reopened = json(["decide", "--id", created.id, "--human", "--status", "OPEN", "--comment", "faltou algo"], vars);
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.owner, null);
});

// --- RF-05: reset só em CLAIMED -----------------------------------------------
test("RF-05: reset humano libera Issue CLAIMED -> OPEN e rejeita em OPEN", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "cursor", "--project", "demo"], vars);
  const reset = json(["reset", "--id", created.id, "--human", "--comment", "liberar"], vars);
  assert.equal(reset.status, "OPEN");
  assert.equal(reset.owner, null);
  const denied = attempt(["reset", "--id", created.id, "--human", "--comment", "de novo"], vars);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /Expected CLAIMED, got OPEN/);
});

// --- RF-06: get/list ----------------------------------------------------------
test("RF-06: get e list refletem o estado, com filtro por tipo", () => {
  const vars = freshEnv();
  const a = json(createRequired, vars);
  json(createRequired.map((arg) => (arg === "Fix" ? "Feat" : arg)), vars); // outra Issue, tipo Feat
  json(["next", "--id", a.id, "--agent", "pi"], vars); // get recusa OPEN; list continua mostrando a fila
  assert.equal(json(["get", "--id", a.id], vars).id, a.id);
  assert.equal(json(["list", "--project", "demo"], vars).length, 2);
  const fixOnly = json(["list", "--project", "demo", "--type", "Fix"], vars);
  assert.equal(fixOnly.length, 1);
  assert.equal(fixOnly[0].type, "Fix");
  assert.equal(fixOnly[0].action, "Review");
});

// --- RF-07: comment com anexos; tags ------------------------------------------
test("RF-07: comment --attach anexa mídia na thread e tag grava complexity/human_need/risk", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  const dir = mkdtempSync(join(tmpdir(), "issues-e2e-att-"));
  const png = join(dir, "erro.png");
  writeFileSync(png, Buffer.from([137, 80, 78, 71, 1, 2]));
  const commented = json(["comment", "--id", created.id, "--agent", "pi", "--comment", "evidência", "--attach", png], vars);
  const attachment = commented.thread.at(-1).attachments[0];
  assert.equal(attachment.kind, "image");
  assert.equal(attachment.filename, "erro.png");
  const tagged = json(["tag", "--id", created.id, "--complexity", "ALTA", "--human-need", "AFK", "--risk", "BAIXO", "--human"], vars);
  assert.deepEqual(tagged.tags, { complexity: "ALTA", human_need: "AFK", risk: "BAIXO" });
});

// --- RF-08: linhagem de Issues -------------------------------------------------
test("RF-08: Issues relacionadas herdam contexto — o prompt da nova sessão carrega o artefato da anterior", () => {
  const vars = freshEnv();
  const dir = mkdtempSync(join(tmpdir(), "issues-e2e-rel-"));
  const md = join(dir, "spec.md");
  writeFileSync(md, "# Spec congelada\n\nfila unica com retries");
  const design = json(["create", "--title", "Design fila", "--project", "demo", "--type", "Feat",
    "--action", "Design", "--problem", "desenhar fila", "--artifact-file", md, "--agent", "pi"], vars);
  const impl = json(["create", "--title", "Implementar fila", "--project", "demo", "--type", "Feat",
    "--action", "Implement", "--problem", "implementar fila", "--relates", design.id, "--agent", "pi"], vars);
  const prompt = run(["next", "--prompt", "--id", impl.id, "--agent", "pi"], vars);
  assert.match(prompt, /## Issues relacionadas/);
  assert.match(prompt, /Spec congelada/);
  assert.match(prompt, /fila unica com retries/);
});

// --- RF-09: complexidade elevada exige humano ----------------------------------
test("RF-09: risco/complexidade ALTA barra o fechamento pela IA (vai a AWAITING)", () => {
  const vars = freshEnv();
  const created = json(createRequired.concat("--complexity", "ALTA"), vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  seedQa(vars, created.id);
  const denied = attempt(["status", "--id", created.id, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido"], vars);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /decisão humana/);
  const awaiting = json(["status", "--id", created.id, "--agent", "pi",
    "--status", "AWAITING", "--comment", "evidência"], vars);
  assert.equal(awaiting.status, "AWAITING");
});

// --- RF-10: Issue CLOSED imutável, sem delete ----------------------------------
test("RF-10: Issue CLOSED é imutável (comment rejeitado) e não é deletada do disco", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  seedQa(vars, created.id);
  run(["status", "--id", created.id, "--agent", "pi", "--status", "CLOSED",
    "--comment", "incorreta", "--reason", "errado"], vars);
  const denied = attempt(["comment", "--id", created.id, "--agent", "pi", "--comment", "mais um"], vars);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /CLOSED aggregate is immutable/);
  assert.ok(existsSync(diskPath(vars, "closed", created.id)), "CLOSED persiste (sem delete físico)");
  assert.equal(json(["get", "--id", created.id], vars).status, "CLOSED");
});

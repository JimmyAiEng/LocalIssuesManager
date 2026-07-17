import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// E2E de REQUISITOS pela superfície real do usuário-IA: o binário `issues` como processo.
// Cada teste isola seu ISSUES_ROOT num diretório temporário. Ver PRD §7/§11 e DESIGN.
const bin = resolve("bin/issues");
const freshEnv = (): NodeJS.ProcessEnv => ({ ...process.env, ISSUES_ROOT: mkdtempSync(join(tmpdir(), "issues-e2e-")) });
const run = (args: string[], vars: NodeJS.ProcessEnv): string => execFileSync(bin, args, { env: vars, encoding: "utf8" });
const attempt = (args: string[], vars: NodeJS.ProcessEnv) => spawnSync(bin, args, { env: vars, encoding: "utf8" });
const json = (args: string[], vars: NodeJS.ProcessEnv) => JSON.parse(run(args, vars));

// Issue já classificada: a criação de Ticket exige risk+complexity para derivar a autonomia.
const createRequired = ["create", "--title", "Bug X", "--project", "demo", "--type", "Fix",
  "--problem", "quebra ao salvar", "--complexity", "BAIXA", "--risk", "BAIXO", "--agent", "pi"];
const createFull = createRequired.concat("--artifacts", "src/save.ts", "--acceptance-criteria", "salva sem erro");
const ticketArgs = (issueId: string) => [
  "ticket", "create", "--issue", issueId, "--type", "Implement",
  "--objective", "corrigir", "--task", "editar save", "--acceptance-criteria", "verde", "--agent", "pi",
];
const diskPath = (vars: NodeJS.ProcessEnv, folder: string, id: string) =>
  join(vars.ISSUES_ROOT as string, "projects", "demo", folder, `${id}.json`);

// --- RF-01: criar Issue -------------------------------------------------------
test("RF-01: cria Issue só com type e problema (artefatos/AC opcionais) e grava em open/", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  assert.equal(created.status, "OPEN");
  assert.equal(created.type, "Fix");
  assert.equal(created.problem, "quebra ao salvar");
  assert.equal(created.artifacts, ""); // opcional ausente vira string vazia
  assert.equal(created.owner, null);
  assert.ok(existsSync(diskPath(vars, "open", created.id)), "Issue OPEN persiste em projects/demo/open");
});

test("RF-01: cria Issue com artefatos e critérios de aceite opcionais", () => {
  const vars = freshEnv();
  const created = json(createFull, vars);
  assert.equal(created.artifacts, "src/save.ts");
  assert.equal(created.acceptance_criteria, "salva sem erro");
});

// --- RF-02: next unificado ----------------------------------------------------
test("RF-02: next devolve { issue, ticket:null } ao reivindicar Issue OPEN", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  const claimed = json(["next", "--agent", "pi", "--project", "demo"], vars);
  assert.equal(claimed.issue.id, created.id);
  assert.equal(claimed.issue.status, "CLAIMED");
  assert.equal(claimed.ticket, null);
  assert.equal(json(["get", "--id", created.id], vars).owner, "pi");
});

test("RF-02/CA-02: next prioriza Ticket de Issue ON-GOING antes de nova Issue OPEN", () => {
  const vars = freshEnv();
  const ongoing = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars); // ongoing -> CLAIMED
  const tid = json(ticketArgs(ongoing.id), vars).tickets[0].id; // ongoing -> ON-GOING, ticket OPEN
  json(createRequired, vars); // segunda Issue OPEN, mais nova
  const next = json(["next", "--agent", "pi", "--project", "demo"], vars);
  assert.equal(next.issue.id, ongoing.id);
  assert.equal(next.ticket.id, tid); // Ticket-first, não a Issue OPEN
  assert.equal(next.ticket.status, "CLAIMED");
});

test("RF-02: next com fila vazia devolve null sem efeito colateral (exit 0)", () => {
  const vars = freshEnv();
  const result = attempt(["next", "--agent", "pi", "--project", "vazio"], vars);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout), null);
});

// --- RF-03: criar Ticket ------------------------------------------------------
test("RF-03: criar Ticket exige Issue CLAIMED/ON-GOING (rejeita em OPEN)", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  const denied = attempt(ticketArgs(created.id), vars);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /CLAIMED or ON-GOING/);
});

test("RF-03: primeiro Ticket move a Issue para ON-GOING", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const ongoing = json(ticketArgs(created.id), vars);
  assert.equal(ongoing.status, "ON-GOING");
  assert.equal(ongoing.tickets.length, 1);
  assert.equal(ongoing.tickets[0].status, "OPEN");
  assert.ok(existsSync(diskPath(vars, "ongoing", created.id)), "Issue migra para projects/demo/ongoing");
});

// --- RF-04: owner muda status do Ticket --------------------------------------
test("RF-04: owner (IA) transiciona o Ticket CLAIMED -> AWAITING", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = json(ticketArgs(created.id), vars).tickets[0].id;
  run(["next", "--agent", "pi", "--project", "demo"], vars); // claim do Ticket pelo owner pi
  const changed = json(["ticket", "status", "--issue", created.id, "--id", tid, "--agent", "pi",
    "--status", "AWAITING", "--comment", "para decisão"], vars);
  assert.equal(changed.tickets[0].status, "AWAITING");
});

// --- RF-05: decisão humana no Ticket -----------------------------------------
test("RF-05: humano decide Ticket AWAITING -> OPEN", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = json(ticketArgs(created.id), vars).tickets[0].id;
  run(["ticket", "claim", "--issue", created.id, "--id", tid, "--agent", "pi"], vars);
  run(["ticket", "status", "--issue", created.id, "--id", tid, "--agent", "pi",
    "--status", "AWAITING", "--comment", "revisar"], vars);
  const decided = json(["ticket", "decide", "--issue", created.id, "--id", tid, "--human",
    "--status", "OPEN", "--comment", "corrigir"], vars);
  assert.equal(decided.tickets[0].status, "OPEN");
  const denied = attempt(["ticket", "decide", "--issue", created.id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "x", "--reason", "concluido"], vars);
  assert.notEqual(denied.status, 0); // decisão é exclusivamente humana
});

// --- RF-06 / CA-03: Issue só AWAITING com todos os Tickets CLOSED + Confirmation
test("RF-06: fechar um de dois Tickets mantém a Issue ON-GOING (não vai a AWAITING)", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const t1 = json(ticketArgs(created.id), vars).tickets[0].id;
  const t2 = json(ticketArgs(created.id), vars).tickets[1].id;
  run(["ticket", "claim", "--issue", created.id, "--id", t1, "--agent", "pi"], vars);
  const afterFirst = json(["ticket", "status", "--issue", created.id, "--id", t1, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido"], vars); // sem --last
  assert.equal(afterFirst.status, "ON-GOING"); // ainda há Ticket aberto
  assert.equal(afterFirst.tickets.some((t: { type: string }) => t.type === "Confirmation"), false);
  run(["ticket", "claim", "--issue", created.id, "--id", t2, "--agent", "pi"], vars);
  const afterLast = json(["ticket", "status", "--issue", created.id, "--id", t2, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido", "--last"], vars);
  assert.equal(afterLast.status, "ON-GOING"); // Confirmation injetado, Issue ainda não AWAITING
  assert.ok(afterLast.tickets.find((t: { type: string }) => t.type === "Confirmation"));
});

test("CA-03: fechar o Confirmation leva a Issue a AWAITING e não gera novo loop", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = json(ticketArgs(created.id), vars).tickets[0].id;
  run(["ticket", "claim", "--issue", created.id, "--id", tid, "--agent", "pi"], vars);
  run(["ticket", "status", "--issue", created.id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido", "--last"], vars);
  const withConfirmation = json(["get", "--id", created.id], vars);
  const confirmations = withConfirmation.tickets.filter((t: { type: string }) => t.type === "Confirmation");
  assert.equal(confirmations.length, 1);
  const cid = confirmations[0].id;
  run(["ticket", "claim", "--issue", created.id, "--id", cid, "--agent", "pi"], vars);
  const awaiting = json(["ticket", "status", "--issue", created.id, "--id", cid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "verificado", "--reason", "concluido"], vars);
  assert.equal(awaiting.status, "AWAITING"); // destravou
  // fechar o Confirmation não injeta outro Confirmation (sem loop)
  assert.equal(awaiting.tickets.filter((t: { type: string }) => t.type === "Confirmation").length, 1);
});

// --- RF-07: decisão humana na Issue ------------------------------------------
test("RF-07: humano decide a Issue AWAITING -> CLOSED", () => {
  const vars = freshEnv();
  const id = drivenToAwaiting(vars);
  const closed = json(["decide", "--id", id, "--human", "--status", "CLOSED",
    "--comment", "aceito", "--reason", "concluido"], vars);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closed_reason, "concluido");
});

test("RF-07: humano devolve a Issue AWAITING -> OPEN (limpa owner)", () => {
  const vars = freshEnv();
  const id = drivenToAwaiting(vars);
  const reopened = json(["decide", "--id", id, "--human", "--status", "OPEN", "--comment", "faltou algo"], vars);
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.owner, null);
});

// --- RF-08 / CA-04: reset só em CLAIMED --------------------------------------
test("RF-08/CA-04: reset humano libera Issue CLAIMED -> OPEN", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "cursor", "--project", "demo"], vars);
  const reset = json(["reset", "--id", created.id, "--human", "--comment", "liberar"], vars);
  assert.equal(reset.status, "OPEN");
  assert.equal(reset.owner, null);
});

test("RF-08/CA-04: reset é rejeitado numa Issue ON-GOING", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  run(ticketArgs(created.id), vars); // -> ON-GOING
  const denied = attempt(["reset", "--id", created.id, "--human", "--comment", "liberar"], vars);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /Expected CLAIMED, got ON-GOING/);
});

// --- RF-09: get/list ----------------------------------------------------------
test("RF-09: get e list de Issues e Tickets refletem o estado", () => {
  const vars = freshEnv();
  const a = json(createRequired, vars);
  json(createRequired.map((arg) => (arg === "Fix" ? "Feat" : arg)), vars); // outra Issue, tipo Feat
  assert.equal(json(["get", "--id", a.id], vars).id, a.id);
  assert.equal(json(["list", "--project", "demo"], vars).length, 2);
  const fixOnly = json(["list", "--project", "demo", "--type", "Fix"], vars);
  assert.equal(fixOnly.length, 1);
  assert.equal(fixOnly[0].type, "Fix");
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = json(ticketArgs(a.id), vars).tickets[0].id;
  assert.equal(json(["ticket", "get", "--issue", a.id, "--id", tid], vars).id, tid);
  assert.equal(json(["ticket", "list", "--issue", a.id, "--status", "OPEN"], vars).length, 1);
});

// --- RF-10: comment com anexos; tags -----------------------------------------
test("RF-10: comment --attach anexa mídia na thread e tag grava complexity/human_need/risk", () => {
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

// --- RF-11: human_presence, sem delete, CLOSED imutável ----------------------
test("RF-11: presença humana bloqueia fechamento por IA; IA fecha Issue sem presença", () => {
  const vars = freshEnv();
  const machine = json(createRequired, vars);
  const closed = json(["status", "--id", machine.id, "--agent", "pi", "--status", "CLOSED",
    "--comment", "incorreta", "--reason", "errado"], vars);
  assert.equal(closed.status, "CLOSED");
  const human = json(createRequired.slice(0, -2).concat("--human"), vars);
  const denied = attempt(["status", "--id", human.id, "--agent", "pi", "--status", "CLOSED",
    "--comment", "cancelar", "--reason", "errado"], vars);
  assert.notEqual(denied.status, 0);
  assert.equal(json(["get", "--id", human.id], vars).status, "OPEN"); // human_presence preservado
});

test("RF-11: Issue CLOSED é imutável (comment rejeitado) e não é deletada do disco", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["status", "--id", created.id, "--agent", "pi", "--status", "CLOSED",
    "--comment", "incorreta", "--reason", "errado"], vars);
  const denied = attempt(["comment", "--id", created.id, "--agent", "pi", "--comment", "mais um"], vars);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /CLOSED aggregate is immutable/);
  assert.ok(existsSync(diskPath(vars, "closed", created.id)), "CLOSED persiste (sem delete físico)");
  assert.equal(json(["get", "--id", created.id], vars).status, "CLOSED");
});

// --- CA-01: ciclo completo Issue+Ticket até CLOSED via CLI + decisão humana --
test("CA-01: ciclo completo Issue+Ticket até CLOSED via CLI e decisão humana", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = json(ticketArgs(created.id), vars).tickets[0].id;
  run(["next", "--agent", "pi", "--project", "demo"], vars); // claim do Ticket
  run(["ticket", "status", "--issue", created.id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido", "--last"], vars);
  const cid = json(["get", "--id", created.id], vars).tickets
    .find((t: { type: string }) => t.type === "Confirmation").id;
  run(["ticket", "claim", "--issue", created.id, "--id", cid, "--agent", "pi"], vars);
  run(["ticket", "status", "--issue", created.id, "--id", cid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "verificado", "--reason", "concluido"], vars);
  const closed = json(["decide", "--id", created.id, "--human", "--status", "CLOSED",
    "--comment", "aceito", "--reason", "concluido"], vars);
  assert.equal(closed.status, "CLOSED");
  assert.ok(closed.tickets.every((t: { status: string }) => t.status === "CLOSED"));
});

// --- CA-07: a autonomia do Ticket é derivada da Issue, não declarada ---------
test("CA-07: override HITL da Issue força Planning; Implement segue AFK e não se autodeclara", () => {
  const vars = freshEnv();
  const created = json(createRequired, vars); // Fix·BAIXO·BAIXA
  run(["tag", "--id", created.id, "--human-need", "HITL", "--human"], vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);

  // A caneta não é do agente: --human-need saiu de `ticket create`, e o valor declarado é irrelevante.
  // Implement é a fase mais reversível: segue AFK mesmo com HITL pedido e sob override HITL da Issue.
  const ok = json(ticketArgs(created.id).concat("--human-need", "HITL"), vars);
  assert.equal(ok.status, "ON-GOING");
  assert.equal(ok.tickets.at(-1).tags.human_need, "AFK");

  // Planning é fase de decisão: o override força HITL sem ninguém declarar nada.
  const planning = json(["ticket", "create", "--issue", created.id, "--type", "Planning",
    "--objective", "o", "--task", "t", "--acceptance-criteria", "c", "--agent", "pi"], vars);
  assert.equal(planning.tickets.at(-1).tags.human_need, "HITL");

  // Nem depois da criação: a tag é derivada, não settável.
  const marca = attempt(["ticket", "tag", "--issue", created.id, "--id", ok.tickets.at(-1).id,
    "--human-need", "HITL"], vars);
  assert.notEqual(marca.status, 0);
  assert.match(marca.stderr, /derivado/);
});

// Conduz uma Issue nova até AWAITING (Ticket + Confirmation fechados), como uma IA faria.
function drivenToAwaiting(vars: NodeJS.ProcessEnv): string {
  const created = json(createRequired, vars);
  run(["next", "--agent", "pi", "--project", "demo"], vars);
  const tid = json(ticketArgs(created.id), vars).tickets[0].id;
  run(["ticket", "claim", "--issue", created.id, "--id", tid, "--agent", "pi"], vars);
  run(["ticket", "status", "--issue", created.id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido", "--last"], vars);
  const cid = json(["get", "--id", created.id], vars).tickets
    .find((t: { type: string }) => t.type === "Confirmation").id;
  run(["ticket", "claim", "--issue", created.id, "--id", cid, "--agent", "pi"], vars);
  run(["ticket", "status", "--issue", created.id, "--id", cid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "verificado", "--reason", "concluido"], vars);
  return created.id as string;
}

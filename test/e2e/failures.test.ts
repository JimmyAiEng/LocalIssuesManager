import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createIssue, nextIssue } from "../../src/app/issue_use_cases.js";
import { claimTicket, createTicket, statusTicket } from "../../src/app/ticket_use_cases.js";
import { ConflictError } from "../../src/domain/domain_error.js";
import { MAX_ATTACHMENT_SIZE } from "../../src/domain/attachment_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

// Suíte E2E de FALHAS de DOMÍNIO/WORKFLOW. Cada modo de falha é provocado pela
// superfície externa: CLI como processo real (exit code ≠ 0 + stderr) ou HTTP
// real (status code + corpo JSON de erro). Erros de camada HTTP (JSON inválido,
// campos ausentes, 404 de rota) são cobertos por outra suíte — não duplicados aqui.

const bin = resolve("bin/issues");
const newRoot = (): string => mkdtempSync(join(tmpdir(), "issues-fail-"));
const run = (args: string[], root: string): string =>
  execFileSync(bin, args, { env: { ...process.env, ISSUES_ROOT: root }, encoding: "utf8" });
const fail = (args: string[], root: string): { status: number | null; stderr: string } => {
  const result = spawnSync(bin, args, { env: { ...process.env, ISSUES_ROOT: root }, encoding: "utf8" });
  return { status: result.status, stderr: result.stderr };
};

// Issue classificada: a criação de Ticket exige risk+complexity para derivar a autonomia.
const createArgs = [
  "create", "--title", "Falha issue", "--project", "demo", "--type", "Feat",
  "--problem", "problema", "--agent", "pi", "--complexity", "BAIXA", "--risk", "BAIXO",
];
const ticketArgs = (issueId: string, extra: string[] = []): string[] => [
  "ticket", "create", "--issue", issueId, "--type", "Implement", "--objective", "o",
  "--task", "t", "--acceptance-criteria", "c", "--agent", "pi", ...extra,
];

function createIssueCLI(root: string, extra: string[] = []): string {
  return (JSON.parse(run([...createArgs, ...extra], root)) as { id: string }).id;
}
function claimedIssueCLI(root: string, extra: string[] = []): string {
  const id = createIssueCLI(root, extra);
  run(["next", "--id", id, "--agent", "pi"], root);
  return id;
}
function claimedTicketCLI(root: string, extra: string[] = []): { id: string; tid: string } {
  const id = claimedIssueCLI(root);
  const tid = (JSON.parse(run(ticketArgs(id, extra), root)) as { tickets: { id: string }[] }).tickets[0].id;
  run(["ticket", "claim", "--issue", id, "--id", tid, "--agent", "pi"], root);
  return { id, tid };
}
function awaitingTicketCLI(root: string): { id: string; tid: string } {
  const { id, tid } = claimedTicketCLI(root);
  run(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi", "--status", "AWAITING", "--comment", "revisar"], root);
  return { id, tid };
}

// ─────────────────────────── Máquina de estados Issue ───────────────────────────

test("falha: addTicket em Issue OPEN (fora de CLAIMED/ON-GOING) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root); // OPEN, não reivindicada
  const { status, stderr } = fail(ticketArgs(id), root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Expected CLAIMED or ON-GOING, got OPEN/);
});

test("falha: addTicket de Design com Planning ainda aberto (phaseBlocker) — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root);
  run(["ticket", "create", "--issue", id, "--type", "Planning", "--objective", "o", "--task", "t", "--acceptance-criteria", "c", "--agent", "pi"], root);
  const { status, stderr } = fail(["ticket", "create", "--issue", id, "--type", "Design", "--objective", "o", "--task", "t", "--acceptance-criteria", "c", "--agent", "pi"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Ticket de Design bloqueado: Planning da fase anterior não está CLOSED/);
});

test("falha: addTicket com depends_on inexistente — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root);
  const { status, stderr } = fail(ticketArgs(id, ["--depends-on", "nao-existe"]), root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Dependency not found: nao-existe/);
});

test("falha: reset em Issue OPEN (não-CLAIMED) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const { status, stderr } = fail(["reset", "--id", id, "--human", "--comment", "x"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Expected CLAIMED, got OPEN/);
});

test("falha: decide em Issue OPEN (não-AWAITING) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const { status, stderr } = fail(["decide", "--id", id, "--human", "--status", "CLOSED", "--comment", "x", "--reason", "concluido"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Expected AWAITING, got OPEN/);
});

test("falha: closeByAgent em Issue não-OPEN (CLAIMED) — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root); // CLAIMED por IA
  const { status, stderr } = fail(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "x", "--reason", "errado"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Expected OPEN, got CLAIMED/);
});

test("falha: closeByAgent com presença humana (Human presence prevents IA closure) — CLI", () => {
  const root = newRoot();
  const id = (JSON.parse(run(["create", "--title", "H", "--project", "demo", "--type", "Feat", "--problem", "p", "--human"], root)) as { id: string }).id;
  const { status, stderr } = fail(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "x", "--reason", "errado"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Human presence prevents IA closure/);
});

test("falha: comment e tag em Issue CLOSED (imutável) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  run(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "fim", "--reason", "errado"], root);
  const c = fail(["comment", "--id", id, "--agent", "pi", "--comment", "oi"], root);
  assert.notEqual(c.status, 0);
  assert.match(c.stderr, /CLOSED aggregate is immutable/);
  const t = fail(["tag", "--id", id, "--risk", "ALTO", "--human"], root);
  assert.notEqual(t.status, 0);
  assert.match(t.stderr, /CLOSED aggregate is immutable/);
});

test("falha: comment vazio sem anexo (comment or attachment is required) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const { status, stderr } = fail(["comment", "--id", id, "--agent", "pi"], root); // sem --comment nem --attach
  assert.notEqual(status, 0);
  assert.match(stderr, /comment or attachment is required/);
});

// ─────────────────────────── Máquina de estados Ticket ───────────────────────────

test("falha: claim de Ticket não-OPEN (já CLAIMED) — CLI", () => {
  const root = newRoot();
  const { id, tid } = claimedTicketCLI(root);
  const { status, stderr } = fail(["ticket", "claim", "--issue", id, "--id", tid, "--agent", "pi"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Expected OPEN, got CLAIMED/);
});

test("falha: changeStatus por quem não é owner — CLI", () => {
  const root = newRoot();
  const { id, tid } = claimedTicketCLI(root); // owner = pi
  const { status, stderr } = fail(["ticket", "status", "--issue", id, "--id", tid, "--human", "--status", "AWAITING", "--comment", "x"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Only the Owner may change status/);
});

test("falha: changeStatus para CLAIMED (transição inválida) — CLI", () => {
  const root = newRoot();
  const { id, tid } = claimedTicketCLI(root);
  const { status, stderr } = fail(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi", "--status", "CLAIMED", "--comment", "x"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Invalid ticket transition/);
});

test("falha: Ticket HITL fechado direto pela IA (exige AWAITING) — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root);
  // A autonomia não é declarada: numa Issue Feat o Planning deriva HITL (gatilho de superfície nova).
  const tid = (JSON.parse(run(["ticket", "create", "--issue", id, "--type", "Planning", "--objective", "o",
    "--task", "t", "--acceptance-criteria", "c", "--agent", "pi"], root)) as { tickets: { id: string; tags: { human_need: string } }[] }).tickets[0].id;
  run(["ticket", "claim", "--issue", id, "--id", tid, "--agent", "pi"], root);
  const { status, stderr } = fail(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi", "--status", "CLOSED", "--comment", "x", "--reason", "concluido"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Ticket HITL: IA não pode fechar direto/);
});

test("falha: CLOSED sem reason e OPEN com reason — CLI", () => {
  const root = newRoot();
  const { id, tid } = claimedTicketCLI(root);
  const a = fail(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi", "--status", "CLOSED", "--comment", "x"], root);
  assert.notEqual(a.status, 0);
  assert.match(a.stderr, /Closed reason is required/);
  const b = fail(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi", "--status", "OPEN", "--comment", "x", "--reason", "concluido"], root);
  assert.notEqual(b.status, 0);
  assert.match(b.stderr, /OPEN cannot have a closed reason/);
});

test("falha: decide em Ticket não-AWAITING (OPEN) — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root);
  const tid = (JSON.parse(run(ticketArgs(id), root)) as { tickets: { id: string }[] }).tickets[0].id;
  const { status, stderr } = fail(["ticket", "decide", "--issue", id, "--id", tid, "--human", "--status", "OPEN", "--comment", "x"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Expected AWAITING, got OPEN/);
});

test("falha: criar Ticket type=Confirmation manualmente — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root);
  const { status, stderr } = fail(["ticket", "create", "--issue", id, "--type", "Confirmation", "--objective", "o", "--task", "t", "--acceptance-criteria", "c", "--agent", "pi"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Confirmation Tickets são gerados pelo sistema/);
});

test("falha: autonomia — Issue sem classificação não recebe Ticket e human_need não é settável — CLI", () => {
  const root = newRoot();
  // Sem risk/complexity a heurística não tem entrada: o guard é de domínio, não do browser.
  const semTags = (JSON.parse(run(["create", "--title", "Sem tags", "--project", "demo", "--type", "Feat",
    "--problem", "problema", "--agent", "pi"], root)) as { id: string }).id;
  run(["next", "--id", semTags, "--agent", "pi"], root);
  const semClass = fail(ticketArgs(semTags), root);
  assert.notEqual(semClass.status, 0);
  assert.match(semClass.stderr, /risk e complexity/);

  // A caneta da autonomia não é do agente: human_need do Ticket é derivado, não marcável.
  const { id, tid } = claimedTicketCLI(root);
  const setNeed = fail(["ticket", "tag", "--issue", id, "--id", tid, "--human-need", "HITL"], root);
  assert.notEqual(setNeed.status, 0);
  assert.match(setNeed.stderr, /derivado/);
});

// ─────────────────────────── Decisões e status ───────────────────────────

test("falha: decisão de Ticket CLOSED sem reason e OPEN com reason — CLI", () => {
  const root = newRoot();
  const semReason = awaitingTicketCLI(root);
  const a = fail(["ticket", "decide", "--issue", semReason.id, "--id", semReason.tid, "--human", "--status", "CLOSED", "--comment", "ok"], root);
  assert.notEqual(a.status, 0);
  assert.match(a.stderr, /Closed reason is required/);
  const comReason = awaitingTicketCLI(root);
  const b = fail(["ticket", "decide", "--issue", comReason.id, "--id", comReason.tid, "--human", "--status", "OPEN", "--comment", "ok", "--reason", "concluido"], root);
  assert.notEqual(b.status, 0);
  assert.match(b.stderr, /OPEN cannot have a closed reason/);
});

test("falha: statusIssue com --human e --agent simultâneos — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const { status, stderr } = fail(["status", "--id", id, "--human", "--agent", "pi", "--status", "CLOSED", "--comment", "x", "--reason", "errado"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Choose --human or --agent/);
});

test("falha: IA fechando Issue sem reason (IA status supports CLOSED with reason) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const { status, stderr } = fail(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "x"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /IA status supports CLOSED with reason/);
});

test("falha: humano fechando Issue com status ≠ CLOSED (Human status supports CLOSED with reason) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const { status, stderr } = fail(["status", "--id", id, "--human", "--status", "OPEN", "--comment", "x"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Human status supports CLOSED with reason/);
});

test("falha: decide sem --human e decisão com status fora de OPEN/CLOSED — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const semHuman = fail(["decide", "--id", id, "--status", "CLOSED", "--comment", "x", "--reason", "concluido"], root);
  assert.notEqual(semHuman.status, 0);
  assert.match(semHuman.stderr, /Decide requires --human/);
  const badStatus = fail(["decide", "--id", id, "--human", "--status", "AWAITING", "--comment", "x"], root);
  assert.notEqual(badStatus.status, 0);
  assert.match(badStatus.stderr, /Invalid decision/);
});

test("falha: ticket decide sem --human e com status inválido — CLI", () => {
  const root = newRoot();
  const { id, tid } = awaitingTicketCLI(root);
  const semHuman = fail(["ticket", "decide", "--issue", id, "--id", tid, "--status", "CLOSED", "--comment", "x", "--reason", "concluido"], root);
  assert.notEqual(semHuman.status, 0);
  assert.match(semHuman.stderr, /Decide requires --human/);
  const badStatus = fail(["ticket", "decide", "--issue", id, "--id", tid, "--human", "--status", "AWAITING", "--comment", "x"], root);
  assert.notEqual(badStatus.status, 0);
  assert.match(badStatus.stderr, /Invalid decision/);
});

test("falha: next sem project e sem id — CLI", () => {
  const root = newRoot();
  const { status, stderr } = fail(["next", "--agent", "pi"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /project is required/);
});

test("falha: next --id de Issue sem trabalho reivindicável — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root); // CLAIMED, sem tickets prontos
  const { status, stderr } = fail(["next", "--id", id, "--agent", "pi"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /não tem trabalho reivindicável/);
});

// ─────────────────────────── Requisitos Gherkin ───────────────────────────

test("falha: Planning → AWAITING sem requisitos válidos persistidos — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root);
  const tid = (JSON.parse(run(["ticket", "create", "--issue", id, "--type", "Planning", "--objective", "o", "--task", "t", "--acceptance-criteria", "c", "--agent", "pi"], root)) as { tickets: { id: string }[] }).tickets[0].id;
  run(["ticket", "claim", "--issue", id, "--id", tid, "--agent", "pi"], root);
  const { status, stderr } = fail(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi", "--status", "AWAITING", "--comment", "pronto"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Planning não pode ir para AWAITING sem requisitos/);
});

test("falha: requirements set com cada violação de Gherkin — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const story = "Como um a\n  Eu quero poder b\n  Para que eu c";
  const cases: { json: string; expected: RegExp }[] = [
    { json: "{isto nao e json", expected: /Requirements deve ser um arquivo JSON válido/ },
    { json: JSON.stringify({ features: [] }), expected: /ao menos uma Feature/ },
    { json: JSON.stringify({ features: ["Scenario: x\n  Given a"] }), expected: /deve começar com o cabeçalho "Feature/ },
    { json: JSON.stringify({ features: [`Feature: X\n  Eu quero poder b\n  Como um a\n  Para que eu c\n  Scenario: s\n  Given a`] }), expected: /user story deve conter/ },
    { json: JSON.stringify({ features: [`Feature: X\n  ${story}\n  Scenario: s\n  Foobar`] }), expected: /step inválido/ },
    { json: JSON.stringify({ features: [`Feature: X\n  ${story}\n  Scenario: s`] }), expected: /todo Scenario deve ter ao menos um step/ },
  ];
  for (const [index, { json, expected }] of cases.entries()) {
    const file = join(root, `req-${index}.json`);
    writeFileSync(file, json, "utf8");
    const { status, stderr } = fail(["requirements", "set", "--id", id, "--file", file], root);
    assert.notEqual(status, 0, `caso ${index} deveria falhar`);
    assert.match(stderr, expected, `caso ${index}`);
  }
});

test("falha: get --target REQUIREMENTS sem arquivo persistido (NotFoundError) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const { status, stderr } = fail(["get", "--id", id, "--target", "REQUIREMENTS"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Requirements não encontrado/);
});

// ─────────────────────────── Persistência ───────────────────────────

test("falha: Issue inexistente → NotFoundError — CLI", () => {
  const root = newRoot();
  const { status, stderr } = fail(["get", "--id", "nao-existe"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Issue not found: nao-existe/);
});

test("falha: stale save → ConflictError (determinístico só in-process)", () => {
  const root = newRoot();
  const id = createIssue({ title: "C", project: "demo", type: "Feat", problem: "p", actor: "pi" }, root).id;
  const queue = new Queue(root);
  const first = queue.loadRequired(id);
  const second = queue.loadRequired(id); // mesmo snapshot/revisão
  first.tag({ complexity: "ALTA" }, "human");
  queue.save(first); // ok: bump da revisão em disco
  second.tag({ risk: "ALTO" }, "human"); // muta sobre snapshot obsoleto
  assert.throws(() => queue.save(second), ConflictError);
});

// ─────────────────────────── CLI parsing ───────────────────────────

test("falha: comando desconhecido → usage + exit ≠ 0", () => {
  const root = newRoot();
  const { status, stderr } = fail(["bogus"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Usage: issues </);
});

test("falha: flag obrigatória ausente (--title) — CLI", () => {
  const root = newRoot();
  const { status, stderr } = fail(["create", "--project", "demo", "--type", "Feat", "--problem", "p", "--agent", "pi"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /--title is required/);
});

test("falha: argumento sem `--` → Unexpected argument", () => {
  const root = newRoot();
  const { status, stderr } = fail(["create", "titulo-solto"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Unexpected argument: titulo-solto/);
});

test("falha: valor não inteiro em flag numérica (--port) — CLI", () => {
  const root = newRoot();
  const { status, stderr } = fail(["web", "--port", "abc", "--no-open"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /--port must be a non-negative integer/);
});

test("falha: --human e --agent juntos no create — CLI", () => {
  const root = newRoot();
  const { status, stderr } = fail([...createArgs, "--human"], root); // createArgs já traz --agent pi
  assert.notEqual(status, 0);
  assert.match(stderr, /Choose --human or --agent/);
});

// ─────────────────────────── HTTP (status + corpo de erro) ───────────────────────────

test("falha HTTP: claim de Issue não-OPEN → 400", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", issueBody)).body.id as string;
  assert.equal((await request(url, "POST", `/api/issues/${id}/claim`, {})).status, 200);
  const again = await request(url, "POST", `/api/issues/${id}/claim`, {});
  assert.equal(again.status, 400);
  assert.match(again.body.error as string, /Expected OPEN, got CLAIMED/);
}));

test("falha HTTP: reset sem comment (comment is required) → 400", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", issueBody)).body.id as string;
  await request(url, "POST", `/api/issues/${id}/claim`, {}); // OPEN -> CLAIMED
  const result = await request(url, "POST", `/api/issues/${id}/reset`, { comment: "" });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /comment is required/);
}));

test("falha HTTP: decisão de Ticket OPEN sem comment → 400", async () => withWeb(async (url, root) => {
  const id = createIssue({ title: "W", project: "web", type: "Fix", problem: "p", actor: "pi",
    complexity: "BAIXA", risk: "BAIXO" }, root).id; // classificada: o Ticket exige risk+complexity
  nextIssue({ agent: "pi", project: "web" }, root);
  const tid = createTicket({ issueId: id, type: "Implement", objective: "o", task: "t", acceptance_criteria: "c", actor: "pi" }, root).tickets[0].id;
  claimTicket({ issueId: id, ticketId: tid, actor: "pi" }, root);
  await statusTicket({ issueId: id, ticketId: tid, actor: "pi", status: "AWAITING", comment: "revisar" }, root);
  const result = await request(url, "POST", `/api/issues/${id}/tickets/${tid}/decision`, { status: "OPEN", comment: "" });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /comment is required/);
}));

test("falha HTTP: anexo com filename vazio → 400", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", issueBody)).body.id as string;
  const result = await request(url, "POST", `/api/issues/${id}/comment`,
    { comment: "x", attachments: [{ filename: "", mediaType: "image/png", data: "AA==" }] });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /filename is required/);
}));

test("falha HTTP: anexo com mediaType não suportado → 400", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", issueBody)).body.id as string;
  const result = await request(url, "POST", `/api/issues/${id}/comment`,
    { comment: "x", attachments: [{ filename: "a.txt", mediaType: "text/plain", data: "AA==" }] });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /Unsupported mediaType: text\/plain/);
}));

test("falha HTTP: anexo com size 0 (data vazia) → 400", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", issueBody)).body.id as string;
  const result = await request(url, "POST", `/api/issues/${id}/comment`,
    { comment: "x", attachments: [{ filename: "a.png", mediaType: "image/png", data: "" }] });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /Attachment size must be positive/);
}));

test("falha HTTP: anexo acima de 25MB → 400", async () => withWeb(async (url) => {
  const id = (await request(url, "POST", "/api/issues", issueBody)).body.id as string;
  const data = Buffer.alloc(MAX_ATTACHMENT_SIZE + 1).toString("base64"); // único caminho externo: size = bytes.length
  const result = await request(url, "POST", `/api/issues/${id}/comment`,
    { comment: "x", attachments: [{ filename: "big.png", mediaType: "image/png", data }] });
  assert.equal(result.status, 400);
  assert.match(result.body.error as string, /Attachment exceeds 25MB/);
}));

test("falha HTTP: atomicidade — anexo inválido no lote não deixa órfão em disco", async () => withWeb(async (url, root) => {
  const id = (await request(url, "POST", "/api/issues", issueBody)).body.id as string;
  const valid = Buffer.from([137, 80, 78, 71]).toString("base64");
  const result = await request(url, "POST", `/api/issues/${id}/comment`, { comment: "x", attachments: [
    { filename: "ok.png", mediaType: "image/png", data: valid },
    { filename: "ruim.png", mediaType: "image/png", data: "" }, // size 0 → inválido
  ] });
  assert.equal(result.status, 400);
  const dir = join(root, "projects", "web", "attachments");
  assert.ok(!existsSync(dir) || readdirSync(dir).length === 0, "nenhum byte deve ter sido persistido");
}));

test("falha HTTP: CLI --attach com extensão sem mediaType (Unsupported attachment extension) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const txt = join(root, "nota.txt");
  writeFileSync(txt, "conteudo", "utf8");
  const { status, stderr } = fail(["comment", "--id", id, "--agent", "pi", "--comment", "x", "--attach", txt], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Unsupported attachment extension/);
});

// REPRO do QA: a IA recuperava a caneta sobre a própria supervisão pela porta dos fundos —
// `issues tag` era a única mutação sem actor, e rebaixar a Issue recomputava o Ticket para AFK.
// Fix·ALTO·ALTA → Implement HITL (combo tóxico). O caminho todo pela CLI, como o agente roda.
test("falha: IA não rebaixa a tag da Issue para destravar o próprio Ticket HITL — CLI", () => {
  const root = newRoot();
  const id = (JSON.parse(run(["create", "--title", "Repro", "--project", "demo", "--type", "Fix",
    "--problem", "p", "--agent", "pi", "--complexity", "ALTA", "--risk", "ALTO"], root)) as { id: string }).id;
  run(["next", "--id", id, "--agent", "pi"], root);
  const tid = (JSON.parse(run(ticketArgs(id), root)) as { tickets: { id: string; tags: { human_need: string } }[] }).tickets[0].id;
  run(["ticket", "claim", "--issue", id, "--id", tid, "--agent", "pi"], root);

  // A IA está barrada de fechar: o Ticket nasceu HITL, derivado da Issue.
  const barred = fail(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--reason", "concluido", "--comment", "feito"], root);
  assert.notEqual(barred.status, 0);
  assert.match(barred.stderr, /IA não pode fechar direto/);

  // A fuga original: tag sem actor nenhum. Agora a CLI exige declarar quem está mexendo.
  const semActor = fail(["tag", "--id", id, "--risk", "BAIXO"], root);
  assert.notEqual(semActor.status, 0);
  assert.match(semActor.stderr, /--agent is required/);

  // E declarando-se IA, o rebaixamento é rejeitado no domínio.
  const comoIA = fail(["tag", "--id", id, "--risk", "BAIXO", "--agent", "pi"], root);
  assert.notEqual(comoIA.status, 0);
  assert.match(comoIA.stderr, /rebaixar risk/);

  // O Ticket segue HITL e a IA segue barrada: a caneta não voltou.
  const after = JSON.parse(run(["get", "--id", id], root)) as { tags: object; tickets: { tags: { human_need: string } }[] };
  assert.deepEqual(after.tags, { complexity: "ALTA", risk: "ALTO" });
  assert.equal(after.tickets[0].tags.human_need, "HITL");
  assert.notEqual(fail(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--reason", "concluido", "--comment", "feito"], root).status, 0);

  // Escalar segue livre para a IA (pedir mais supervisão nunca é ataque).
  run(["tag", "--id", id, "--human-need", "HITL", "--agent", "pi"], root);

  // Só o humano rebaixa — e aí a autonomia derivada recomputa, como projetado.
  run(["tag", "--id", id, "--risk", "BAIXO", "--complexity", "BAIXA", "--human-need", "AFK", "--human"], root);
  const freed = JSON.parse(run(["get", "--id", id], root)) as { tickets: { tags: { human_need: string } }[] };
  assert.equal(freed.tickets[0].tags.human_need, "AFK");
  run(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--reason", "concluido", "--comment", "feito"], root);
});

const issueBody = { title: "Web falha", project: "web", type: "Fix", problem: "p" };

async function withWeb(fn: (url: string, root: string) => Promise<void>): Promise<void> {
  const root = newRoot();
  const web = await startWebServer(0, root);
  try { await fn(web.url, root); } finally { await close(web); }
}

async function request(url: string, method: string, path: string, body?: object): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function close(web: WebServer): Promise<void> {
  return new Promise((resolve, reject) => web.server.close((error) => error ? reject(error) : resolve()));
}

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { ConflictError } from "../../src/domain/domain_error.js";
import { MAX_MEDIA_SIZE } from "../../src/domain/artifacts/media_artifact.js";
import { Queue } from "../../src/domain/queue_repository.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

// Suíte E2E de FALHAS de DOMÍNIO/WORKFLOW. Cada modo de falha é provocado pela
// superfície externa: CLI como processo real (exit code ≠ 0 + stderr) ou HTTP
// real (status code + corpo JSON de erro). Erros de camada HTTP (JSON inválido,
// campos ausentes, 404 de rota) são cobertos por outra suíte — não duplicados aqui.

const bin = resolve("bin/issues");
const newRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "issues-fail-"));
  createProject({ name: "demo", repo: root }, root);
  createProject({ name: "web", repo: root }, root);
  return root;
};
const run = (args: string[], root: string): string =>
  execFileSync(bin, args, { env: { ...process.env, ISSUES_ROOT: root }, encoding: "utf8" });
const fail = (args: string[], root: string): { status: number | null; stderr: string } => {
  const result = spawnSync(bin, args, { env: { ...process.env, ISSUES_ROOT: root }, encoding: "utf8" });
  return { status: result.status, stderr: result.stderr };
};

const createArgs = [
  "create", "--title", "Falha issue", "--project", "demo", "--type", "Feat", "--action", "Review",
  "--problem", "problema", "--agent", "pi",
];

// Artefato de Review fixo: createArgs cria Issues Review, cujo gate de conclusão exige o .md persistido.
// Semeá-lo aqui deixa as falhas testadas (estado, owner, reason) aflorarem — e é inócuo para os
// gates de Planning/Implement quando `extra` troca a action.
const qaArtifactFile = join(mkdtempSync(join(tmpdir(), "issues-fail-qa-")), "qa.md");
writeFileSync(qaArtifactFile, "# Review ok");

function createIssueCLI(root: string, extra: string[] = []): string {
  const id = (JSON.parse(run([...createArgs, ...extra], root)) as { id: string }).id;
  run(["artifact", "--id", id, "--file", qaArtifactFile], root);
  return id;
}
function claimedIssueCLI(root: string, extra: string[] = []): string {
  const id = createIssueCLI(root, extra);
  run(["next", "--id", id, "--agent", "pi"], root);
  return id;
}

// ─────────────────────────── Máquina de estados Issue ───────────────────────────

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

test("falha: IA fechando Issue OPEN sem claim (Expected CLAIMED) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const { status, stderr } = fail(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "x", "--reason", "errado"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Expected OPEN, got CLAIMED|Expected CLAIMED, got OPEN/);
});

test("falha: só o Owner transiciona (outra IA é barrada) — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root); // owner = pi
  const { status, stderr } = fail(["status", "--id", id, "--agent", "codex", "--status", "AWAITING", "--comment", "x"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Only the Owner may change status/);
});

test("falha: Issue HITL fechada direto pela IA (exige AWAITING) — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root, ["--human-need", "HITL"]);
  const { status, stderr } = fail(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "x", "--reason", "concluido"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /decisão humana/);
});

test("falha: comment e tag em Issue CLOSED (imutável) — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root);
  run(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "fim", "--reason", "errado"], root);
  const c = fail(["comment", "--id", id, "--agent", "pi", "--comment", "oi"], root);
  assert.notEqual(c.status, 0);
  assert.match(c.stderr, /CLOSED aggregate is immutable/);
  const t = fail(["tag", "--id", id, "--risk", "ALTO", "--human"], root);
  assert.notEqual(t.status, 0);
  assert.match(t.stderr, /CLOSED aggregate is immutable/);
});

test("falha: comment vazio sem anexo e comment acima do limite — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const empty = fail(["comment", "--id", id, "--agent", "pi"], root); // sem --comment nem --attach
  assert.notEqual(empty.status, 0);
  assert.match(empty.stderr, /comment or attachment is required/);
  const long = fail(["comment", "--id", id, "--agent", "pi", "--comment", Array(301).fill("x").join(" ")], root);
  assert.notEqual(long.status, 0);
  assert.match(long.stderr, /limite 300/);
});

test("falha: problem acima de 300 palavras na criação — CLI", () => {
  const root = newRoot();
  const { status, stderr } = fail(["create", "--title", "Grande", "--project", "demo", "--type", "Feat",
    "--action", "Review", "--problem", Array(301).fill("x").join(" "), "--agent", "pi"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /problem tem 301 palavras/);
  assert.match(stderr, /Issues menores relacionadas/);
});

test("falha: relate com id inexistente e relate para si mesma — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const ghost = fail(["relate", "--id", id, "--relates", "nao-existe"], root);
  assert.notEqual(ghost.status, 0);
  assert.match(ghost.stderr, /Issue not found: nao-existe/);
  const self = fail(["relate", "--id", id, "--relates", id], root);
  assert.notEqual(self.status, 0);
  assert.match(self.stderr, /Nenhuma relação nova/);
});

// ─────────────────────────── Gates por action ───────────────────────────

test("falha: Issue Planning não conclui sem requisitos válidos persistidos — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root, ["--action", "Planning"]);
  const { status, stderr } = fail(["status", "--id", id, "--agent", "pi", "--status", "AWAITING", "--comment", "pronto"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /não pode ser concluída sem requisitos/);
});

// Contraponto do gate acima: abandonar (reason ≠ concluido) não cobra a entrega que não existirá,
// senão o agente que criou a Issue errada não teria como se corrigir e a deixaria órfã.
test("abandono: IA fecha Issue Planning sem requisitos com reason obsoleto — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root, ["--action", "Planning"]);
  const closed = JSON.parse(run(["status", "--id", id, "--agent", "pi", "--status", "CLOSED",
    "--reason", "obsoleto", "--comment", "criada errada, abandonando"], root)) as { status: string };
  assert.equal(closed.status, "CLOSED");
});

test("falha: abandono com reason fora do enum — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root, ["--action", "Planning"]);
  const { status, stderr } = fail(["status", "--id", id, "--agent", "pi", "--status", "CLOSED",
    "--reason", "porque-sim", "--comment", "x"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Invalid closed reason: porque-sim/);
});

test("falha: Issue Implement não conclui sem worktree — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root, ["--action", "Implement"]);
  const { status, stderr } = fail(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "feito", "--reason", "concluido"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /exige worktree/);
});

test("falha: check do projeto reprovado bloqueia a conclusão de Implement — CLI", () => {
  const root = newRoot();
  run(["project", "create", "--name", "demo", "--repo", root, "--check", "exit 7"], root); // upsert com check que falha
  const id = claimedIssueCLI(root, ["--action", "Implement"]);
  const queue = new Queue(root);
  const issue = queue.loadRequired(id);
  issue.setWorktree({ path: root, branch: "issue/x" });
  queue.save(issue);
  const { status, stderr } = fail(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "feito", "--reason", "concluido"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Check do projeto falhou \(exit 7\)/);
});

// ─────────────────────────── Decisões e status ───────────────────────────

test("falha: statusIssue com --human e --agent simultâneos — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root);
  const { status, stderr } = fail(["status", "--id", id, "--human", "--agent", "pi", "--status", "CLOSED", "--comment", "x", "--reason", "errado"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Choose --human or --agent/);
});

test("falha: IA fechando Issue sem reason e com status inválido — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root);
  const semReason = fail(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "x"], root);
  assert.notEqual(semReason.status, 0);
  assert.match(semReason.stderr, /Closed reason is required/);
  const badStatus = fail(["status", "--id", id, "--agent", "pi", "--status", "OPEN", "--comment", "x"], root);
  assert.notEqual(badStatus.status, 0);
  assert.match(badStatus.stderr, /use status AWAITING/);
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

test("falha: next sem project e sem id — CLI", () => {
  const root = newRoot();
  const { status, stderr } = fail(["next", "--agent", "pi"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /project is required/);
});

test("falha: next --id de Issue já reivindicada — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root);
  const { status, stderr } = fail(["next", "--id", id, "--agent", "pi"], root);
  assert.notEqual(status, 0);
  assert.match(stderr, /Expected OPEN, got CLAIMED/);
});

// ─────────────────────────── Requisitos JSONL ───────────────────────────

test("falha: requirements set com cada violação do JSONL — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root, ["--action", "Planning"]);
  const feature = { feature: "Login", como: "usuário", quero: "entrar", para: "acesse o painel",
    scenarios: [{ nome: "ok", steps: ["Given a tela", "When entro", "Then vejo o painel"] }] };
  const named = (name: string) => ({ ...feature, feature: name });
  const jsonl = (...lines: unknown[]): string => lines.map((line) => JSON.stringify(line)).join("\n");
  const cases: { conteudo: string; expected: RegExp }[] = [
    { conteudo: "\n  \n", expected: /ao menos uma Feature/ },
    { conteudo: `${jsonl(feature)}\n{isto nao e json`, expected: /linha 2: JSON inválido/ },
    { conteudo: jsonl({ ...feature, como: "" }), expected: /campo "como" é obrigatório/ },
    { conteudo: jsonl({ ...feature, scenarios: [] }), expected: /"scenarios" deve ser um array com ao menos um cenário/ },
    { conteudo: jsonl({ ...feature, scenarios: [{ nome: "ok", steps: ["Faço qualquer coisa"] }] }),
      expected: /step deve começar com Given\/When\/Then\/And/ },
    { conteudo: jsonl(feature, feature), expected: /Feature "Login" aparece em duas linhas/ },
    { conteudo: jsonl(...Array.from({ length: 6 }, (_, index) => named(`F${index}`))), expected: /limite 5/ },
  ];
  for (const [index, { conteudo, expected }] of cases.entries()) {
    const file = join(root, `req-${index}.jsonl`);
    writeFileSync(file, conteudo, "utf8");
    const { status, stderr } = fail(["requirements", "set", "--id", id, "--file", file], root);
    assert.notEqual(status, 0, `caso ${index} deveria falhar`);
    assert.match(stderr, expected, `caso ${index}`);
  }
});

test("falha: get --target REQUIREMENTS sem arquivo persistido (NotFoundError) — CLI", () => {
  const root = newRoot();
  const id = createIssueCLI(root, ["--action", "Planning"]);
  run(["next", "--id", id, "--agent", "pi"], root); // get recusa OPEN
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
  const id = createIssue({ title: "C", project: "demo", type: "Feat", action: "Review", problem: "p", actor: "pi" }, root).id;
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

test("falha: flag obrigatória ausente (--title, --action) — CLI", () => {
  const root = newRoot();
  const semTitle = fail(["create", "--project", "demo", "--type", "Feat", "--action", "Review", "--problem", "p", "--agent", "pi"], root);
  assert.notEqual(semTitle.status, 0);
  assert.match(semTitle.stderr, /--title is required/);
  const semAction = fail(["create", "--title", "x", "--project", "demo", "--type", "Feat", "--problem", "p", "--agent", "pi"], root);
  assert.notEqual(semAction.status, 0);
  assert.match(semAction.stderr, /--action is required/);
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
  const data = Buffer.alloc(MAX_MEDIA_SIZE + 1).toString("base64"); // único caminho externo: size = bytes.length
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

// A IA não recupera a caneta sobre a própria supervisão: rebaixar a tag que a barra de fechar
// (requiresHuman) é prerrogativa humana. O caminho todo pela CLI, como o agente roda.
test("falha: IA não rebaixa a tag da Issue para destravar o próprio fechamento — CLI", () => {
  const root = newRoot();
  const id = claimedIssueCLI(root, ["--risk", "ALTO"]);

  // A IA está barrada de fechar: risk ALTO exige decisão humana.
  const barred = fail(["status", "--id", id, "--agent", "pi",
    "--status", "CLOSED", "--reason", "concluido", "--comment", "feito"], root);
  assert.notEqual(barred.status, 0);
  assert.match(barred.stderr, /decisão humana/);

  // A fuga: tag sem actor nenhum. A CLI exige declarar quem está mexendo.
  const semActor = fail(["tag", "--id", id, "--risk", "BAIXO"], root);
  assert.notEqual(semActor.status, 0);
  assert.match(semActor.stderr, /--agent is required/);

  // E declarando-se IA, o rebaixamento é rejeitado no domínio.
  const comoIA = fail(["tag", "--id", id, "--risk", "BAIXO", "--agent", "pi"], root);
  assert.notEqual(comoIA.status, 0);
  assert.match(comoIA.stderr, /rebaixar risk/);

  // Escalar segue livre para a IA (pedir mais supervisão nunca é ataque).
  run(["tag", "--id", id, "--human-need", "HITL", "--agent", "pi"], root);

  // Só o humano rebaixa — e aí a IA volta a poder fechar.
  run(["tag", "--id", id, "--risk", "BAIXO", "--human-need", "AFK", "--human"], root);
  const closed = JSON.parse(run(["status", "--id", id, "--agent", "pi",
    "--status", "CLOSED", "--reason", "concluido", "--comment", "feito"], root)) as { status: string };
  assert.equal(closed.status, "CLOSED");
});

const issueBody = { title: "Web falha", project: "web", type: "Fix", action: "Review", problem: "p" };

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

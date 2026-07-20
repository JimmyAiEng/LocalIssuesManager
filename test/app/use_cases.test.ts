import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  claimIssue, createIssue, decideIssue, getIssue, listIssues, nextIssue, relateIssues, resetClaim,
  setArtifact, statusIssue, updateTags,
} from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject, listProjects } from "../../src/app/services/use_cases/project_use_cases.js";
import { Queue } from "../../src/domain/queue_repository.js";

// Os testes genéricos de fluxo usam a action Review; seu gate de conclusão exige o conjunto de
// documentos da revisão, semeado por seedReview() nos testes que transicionam a Issue.
const body = { project: "app", type: "Feat" as const, action: "Review", problem: "p", actor: "human" as const };
const longText = Array(301).fill("x").join(" ");

const root = () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-test-"));
  createProject({ name: "app", repo: dir }, dir);
  return dir;
};

// Projeto concern=HIGH: piso de supervisão que bloqueia o claim de agente de Design/Implement
// enquanto o pai (relates kind=parent) não estiver CLOSED.
const highRoot = () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-test-"));
  createProject({ name: "app", repo: dir, concern: "HIGH" }, dir);
  return dir;
};

// Fecha uma Issue direto para CLOSED (sem gate), como o override humano — semente de estado do pai.
const closeIssue = (dir: string, id: string, now?: Date) => {
  const queue = new Queue(dir);
  const parent = queue.loadRequired(id);
  parent.closeByHuman("done", "concluido", now);
  queue.save(parent);
};

// Conjunto de documentos de uma Review válida (intent + 2 evidence nomeadas + veredito APROVADO no
// artefato legado), gravado pela superfície real setArtifact (exercita a flag --name).
const seedReview = (dir: string, id: string): void => {
  setArtifact({ issueId: id, content: "# intenção", name: "intent.md" }, dir);
  setArtifact({ issueId: id, content: "# evidência a", name: "evidence-a.md" }, dir);
  setArtifact({ issueId: id, content: "# evidência b", name: "evidence-b.md" }, dir);
  setArtifact({ issueId: id, content: "APROVADO revisão ok" }, dir);
};

// Handoff obrigatório ao enviar para AWAITING não-abandono (o documento que a sessão pós-APPROVED lê).
const seedHandoff = (dir: string, id: string): void =>
  setArtifact({ issueId: id, content: "# handoff\npróximos passos", name: "handoff.md" }, dir);

test("createIssue exige projeto registrado, com orientação de como criar", () => {
  const dir = mkdtempSync(join(tmpdir(), "issues-test-"));
  assert.throws(() => createIssue({ ...body, title: "x" }, dir),
    /Projeto não registrado: app.*issues project create/);
});

test("project create valida repo existente e list devolve os registrados", () => {
  const dir = root();
  assert.throws(() => createProject({ name: "ghost", repo: join(dir, "nope") }, dir), /Repositório não encontrado/);
  assert.throws(() => createProject({ name: " ", repo: dir }, dir), /name is required/);
  assert.throws(() => createProject({ name: "bad", repo: dir, concern: "MEDIUM" }, dir), /concern inválido/);
  assert.equal(createProject({ name: "other", repo: dir }, dir).concern, "LOW");
  assert.equal(createProject({ name: "high", repo: dir, concern: "HIGH" }, dir).concern, "HIGH");
  const projects = listProjects(dir).map((project) => project.name).sort();
  assert.deepEqual(projects, ["app", "high", "other"]);
});

test("next reivindica a Issue OPEN mais antiga do projeto (FIFO)", () => {
  const dir = root();
  const older = createIssue({ ...body, title: "older", now: new Date("2026-01-01") }, dir);
  const newer = createIssue({ ...body, title: "newer", now: new Date("2026-01-02") }, dir);
  const claimed = nextIssue({ agent: "pi", project: "app" }, dir);
  assert.equal(claimed?.id, older.id);
  assert.equal(claimed?.status, "CLAIMED");
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir)?.id, newer.id);
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir), null);
});

test("next --id reivindica a Issue específica; inexistente lança NotFound", () => {
  const dir = root();
  createIssue({ ...body, title: "older", now: new Date("2026-01-01") }, dir);
  const target = createIssue({ ...body, title: "target", now: new Date("2026-01-02") }, dir);
  const claimed = nextIssue({ agent: "pi", id: target.id }, dir);
  assert.equal(claimed?.id, target.id);
  assert.equal(claimed?.status, "CLAIMED");
  assert.throws(() => nextIssue({ agent: "pi", id: "nope" }, dir), /Issue not found: nope/);
  assert.throws(() => nextIssue({ agent: "pi" }, dir), /project is required/);
});

test("ciclo AFK: IA reivindica, entrega evidência e fecha direto", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "afk" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  seedReview(dir, issue.id); // body é Review: satisfaz o gate
  await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito: passos e decisões", closed_reason: "concluido" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("ciclo HITL: IA envia para AWAITING e o humano decide", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "hitl", human_need: "HITL" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  seedReview(dir, issue.id); // gate satisfeito: a rejeição abaixo é da supervisão humana, não do gate
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir),
    /decisão humana/,
  );
  seedHandoff(dir, issue.id);
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "evidência: relatório" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "AWAITING");
  // Aprovação humana gera APPROVED (não CLOSED): a Issue reentra na fila, o agente reivindica e fecha.
  decideIssue({ id: issue.id, human: true, status: "APPROVED", comment: "aprovado" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "APPROVED");
  nextIssue({ agent: "pi", id: issue.id }, dir);
  await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "handoff executado", closed_reason: "concluido" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("gate Planning: sem requirements a IA não conclui a Issue", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "plan", action: "Planning" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir),
    /sem requisitos.*issues requirements set/,
  );
  assert.equal(getIssue(issue.id, dir).status, "CLAIMED"); // nada foi aplicado
});

test("gate Implement: sem gate de entrega, fecha AFK só com a evidência", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "impl", action: "Implement" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("gate Review: sem intent/evidence/veredito a IA não conclui a Issue", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "qa", action: "Review" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir),
    /sem intent\.md.*issues artifact/,
  );
  assert.equal(getIssue(issue.id, dir).status, "CLAIMED"); // nada foi aplicado
  seedReview(dir, issue.id);
  await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("gate Deploy: nunca fecha AFK — CLOSED pela IA é barrado e orienta AWAITING", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "dep", action: "Deploy" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects( // mesmo com evidência de PR, o agente não fecha: só o humano decide
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "https://git/pr/1 SonarQube ok", closed_reason: "concluido" }, dir),
    /não fecha por agente.*AWAITING/,
  );
  assert.equal(getIssue(issue.id, dir).status, "CLAIMED");
});

test("gate Deploy: AWAITING exige link http(s) de PR e análise; só o decide humano fecha", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "dep2", action: "Deploy" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects( // gate do Deploy falha antes do handoff
    statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "pronto para subir" }, dir),
    /evidência de PR.*link http.*análise/,
  );
  seedHandoff(dir, issue.id);
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "PR https://git/pr/9; SonarQube sem apontamentos" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "AWAITING");
  // Go humano gera APPROVED; pós-APPROVED o agente reivindica e fecha o Deploy (trava humana dispensada, gate revalida).
  const approved = decideIssue({ id: issue.id, human: true, status: "APPROVED", comment: "go" }, dir);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.thread.at(-1)?.decided_by, "human"); // go/no-go auditado
  nextIssue({ agent: "pi", id: issue.id }, dir);
  const closed = await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "PR https://git/pr/9 mergeado; sonar OK", closed_reason: "concluido" }, dir);
  assert.equal(closed.status, "CLOSED");
});

test("status pela IA só aceita AWAITING ou CLOSED com reason", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "gate", artifact: "# qa ok" }, dir); // gate Review satisfeito
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "OPEN", comment: "x" }, dir),
    /use status AWAITING.*ou CLOSED/,
  );
  await assert.rejects(
    statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "x" }, dir),
    /Closed reason is required/,
  );
  await assert.rejects(statusIssue({ id: issue.id, human: true, agent: "pi", status: "CLOSED", comment: "x", closed_reason: "errado" }, dir),
    /Choose --human or --agent/);
});

test("humano fecha via status CLOSED e as demais combinações são rejeitadas", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "hclose" }, dir);
  await assert.rejects(
    statusIssue({ id: issue.id, human: true, status: "AWAITING", comment: "x" }, dir),
    /Human status supports CLOSED with reason/,
  );
  await statusIssue({ id: issue.id, human: true, status: "CLOSED", comment: "duplicada", closed_reason: "duplicado" }, dir);
  assert.equal(getIssue(issue.id, dir).status, "CLOSED");
});

test("relateIssues liga Issues existentes e a view carrega os artefatos relacionados", () => {
  const dir = root();
  const design = createIssue({ ...body, title: "design", action: "Design", artifact: "# spec congelada" }, dir);
  const impl = createIssue({ ...body, title: "impl", action: "Implement" }, dir);
  assert.throws(() => relateIssues({ id: impl.id, relates: ["nope"] }, dir), /Issue not found: nope/);
  relateIssues({ id: impl.id, relates: [design.id] }, dir);
  const view = getIssue(impl.id, dir);
  assert.deepEqual(view.relates, [{ id: design.id, kind: "see-also" }]); // default see-also
  assert.equal(view.related[0].title, "design");
  assert.equal(view.related[0].action, "Design");
  assert.equal(view.related[0].kind, "see-also");
  assert.equal(view.related[0].artifact, "# spec congelada");
});

test("relateIssues com kind=child grava a inversa parent na Issue alvo", () => {
  const dir = root();
  const design = createIssue({ ...body, title: "design", action: "Design" }, dir);
  const impl = createIssue({ ...body, title: "impl", action: "Implement" }, dir);
  relateIssues({ id: design.id, relates: [impl.id], kind: "child" }, dir);
  assert.deepEqual(getIssue(design.id, dir).relates, [{ id: impl.id, kind: "child" }]);
  assert.deepEqual(getIssue(impl.id, dir).relates, [{ id: design.id, kind: "parent" }]); // recíproca
});

// Aresta legada de um lado só (gravada antes de `create --relates` delegar a relateIssues): a alvo
// já cita a origem e quem falta é a origem. Simulada no store, porque `create` já grava os dois lados.
const legacyEdge = (dir: string, from: string, to: string): void => {
  const queue = new Queue(dir);
  const issue = queue.loadRequired(from);
  issue.relate([{ id: to, kind: "see-also" }]);
  queue.save(issue);
};

test("relateIssues grava na origem mesmo quando a alvo já cita a origem (adoção de órfã)", () => {
  const dir = root();
  const parent = createIssue({ ...body, title: "parent", action: "Design" }, dir);
  const child = createIssue({ ...body, title: "child", action: "Implement" }, dir);
  legacyEdge(dir, child.id, parent.id); // aresta legada só na filha
  relateIssues({ id: parent.id, relates: [child.id], kind: "child" }, dir); // recíproco já existe na alvo: não pode falhar
  assert.deepEqual(getIssue(parent.id, dir).relates, [{ id: child.id, kind: "child" }]);
  assert.deepEqual(getIssue(child.id, dir).relates, [{ id: parent.id, kind: "parent" }]); // see-also promovido ao recíproco
  // repetir o comando é no-op silencioso
  relateIssues({ id: parent.id, relates: [child.id], kind: "child" }, dir);
  assert.deepEqual(getIssue(parent.id, dir).relates, [{ id: child.id, kind: "child" }]);
});

// Sentido documentado na skill: `issues relate --id <órfã> --relates <pai> --kind parent`.
// A órfã (origem) já cita o pai por uma aresta legada de um lado só; quem falta é o pai.
test("relateIssues adota a órfã no sentido documentado (origem já cita o pai)", () => {
  const dir = root();
  const parent = createIssue({ ...body, title: "parent", action: "Design" }, dir);
  const orphan = createIssue({ ...body, title: "orphan", action: "Implement" }, dir);
  legacyEdge(dir, orphan.id, parent.id);
  relateIssues({ id: orphan.id, relates: [parent.id], kind: "parent" }, dir); // see-also da órfã sobe para parent
  assert.deepEqual(getIssue(orphan.id, dir).relates, [{ id: parent.id, kind: "parent" }]);
  assert.deepEqual(getIssue(parent.id, dir).relates, [{ id: orphan.id, kind: "child" }]); // recíproco gravado
  relateIssues({ id: orphan.id, relates: [parent.id], kind: "parent" }, dir); // re-executar é no-op
  assert.deepEqual(getIssue(orphan.id, dir).relates, [{ id: parent.id, kind: "parent" }]);
  assert.throws(() => relateIssues({ id: orphan.id, relates: [parent.id] }, dir), /não rebaixa nem inverte/); // see-also sobre parent
  assert.throws(() => relateIssues({ id: orphan.id, relates: [parent.id], kind: "child" }, dir), /não rebaixa nem inverte/); // inversão
  assert.throws(() => relateIssues({ id: orphan.id, relates: [orphan.id] }, dir), /Nenhuma relação nova/); // auto-relate
  assert.throws(() => relateIssues({ id: orphan.id, relates: ["ghost"] }, dir), /Issue not found: ghost/); // typo ainda falha
});

test("createIssue com relates valida existência e persiste a linhagem", () => {
  const dir = root();
  const parent = createIssue({ ...body, title: "parent" }, dir);
  assert.throws(() => createIssue({ ...body, title: "orphan", relates: ["ghost"] }, dir), /Issue not found: ghost/);
  const child = createIssue({ ...body, title: "child", relates: [parent.id] }, dir);
  assert.deepEqual(getIssue(child.id, dir).relates, [{ id: parent.id, kind: "see-also" }]);
  assert.deepEqual(getIssue(parent.id, dir).relates, [{ id: child.id, kind: "see-also" }]); // par recíproco na alvo
});

// Id repetido carregava a alvo duas vezes e o 2º save estourava `Stale Issue save` — em `create`,
// depois de a Issue já estar em disco, deixando o grafo assimétrico no sentido inverso.
test("relates com id repetido grava uma aresta única nos dois lados, sem stale save", () => {
  const dir = root();
  const target = createIssue({ ...body, title: "target" }, dir);
  const child = createIssue({ ...body, title: "child", relates: [target.id, target.id] }, dir);
  assert.deepEqual(getIssue(child.id, dir).relates, [{ id: target.id, kind: "see-also" }]);
  assert.deepEqual(getIssue(target.id, dir).relates, [{ id: child.id, kind: "see-also" }]);
  const other = createIssue({ ...body, title: "other" }, dir);
  relateIssues({ id: other.id, relates: [target.id, target.id] }, dir);
  assert.deepEqual(getIssue(other.id, dir).relates, [{ id: target.id, kind: "see-also" }]);
  assert.deepEqual(getIssue(target.id, dir).relates.filter((r) => r.id === other.id), [{ id: other.id, kind: "see-also" }]);
});

// `create --relates <review>` sozinho basta para o gate de REPROVADO enxergar o retrabalho:
// o recíproco see-also nasce na Review, sem `issues relate` manual.
test("createIssue com relates satisfaz o gate de REPROVADO da Review", async () => {
  const dir = root();
  const review = createIssue({ ...body, title: "review" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  seedReview(dir, review.id);
  setArtifact({ issueId: review.id, content: "REPROVADO: refazer a fatia" }, dir);
  const close = () => statusIssue({ id: review.id, agent: "pi", status: "CLOSED", comment: "reprovado", closed_reason: "concluido" }, dir);
  await assert.rejects(close, /retrabalho vivo/);
  createIssue({ ...body, title: "rework", action: "Implement", relates: [review.id] }, dir);
  await close();
  assert.equal(getIssue(review.id, dir).status, "CLOSED");
});

test("issueView expõe a cadeia de ancestrais subindo os parent", () => {
  const dir = root();
  const planning = createIssue({ ...body, title: "planning", action: "Planning" }, dir);
  const design = createIssue({ ...body, title: "design", action: "Design" }, dir);
  const impl = createIssue({ ...body, title: "impl", action: "Implement" }, dir);
  relateIssues({ id: planning.id, relates: [design.id], kind: "child" }, dir);
  relateIssues({ id: design.id, relates: [impl.id], kind: "child" }, dir);
  const ancestors = getIssue(impl.id, dir).ancestors;
  assert.deepEqual(ancestors.map((a) => a.title), ["design", "planning"]);
});

test("view omite relacionada purgada em vez de quebrar", () => {
  const dir = root();
  const parent = createIssue({ ...body, title: "parent" }, dir);
  const child = createIssue({ ...body, title: "child", relates: [parent.id] }, dir);
  const queue = new Queue(dir);
  const gone = queue.loadRequired(parent.id);
  gone.closeByHuman("limpa", "obsoleto", new Date("2026-01-01"));
  queue.save(gone);
  queue.purgeClosed(new Date("2026-07-14"));
  assert.deepEqual(getIssue(child.id, dir).related, []);
});

test("claimIssue humano leva OPEN a CLAIMED (teclado da web)", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "webclaim" }, dir);
  assert.equal(claimIssue({ id: issue.id }, dir).status, "CLAIMED");
});

test("decideIssue rejeita status inválido e exige --human", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "gate2" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  seedReview(dir, issue.id);
  seedHandoff(dir, issue.id);
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "evidência" }, dir);
  assert.throws(() => decideIssue({ id: issue.id, human: true, status: "AWAITING", comment: "x" }, dir), /Invalid decision/);
  assert.throws(() => decideIssue({ id: issue.id, human: false, status: "OPEN", comment: "x" }, dir), /Decide requires --human/);
  // decide concluido é recusado: aprovar é decidir APPROVED, não fechar concluído.
  assert.throws(() => decideIssue({ id: issue.id, human: true, status: "CLOSED", comment: "x", closed_reason: "concluido" }, dir), /para aprovar decida APPROVED/);
});

test("aprovar leva AWAITING a APPROVED e a Issue reaparece em issues next", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "aprovar", action: "Implement" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  seedHandoff(dir, issue.id);
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "pronto" }, dir);
  const approved = decideIssue({ id: issue.id, human: true, status: "APPROVED", comment: "aprovado" }, dir);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.owner, null); // reentra na fila sem dono
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir)?.id, issue.id); // elegível de novo
});

test("abandono administrativo pelo decide vai direto a CLOSED sem exigir handoff", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "aband", action: "Implement" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  seedHandoff(dir, issue.id);
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "pronto" }, dir);
  const closed = decideIssue({ id: issue.id, human: true, status: "CLOSED", comment: "obsoleta", closed_reason: "obsoleto" }, dir);
  assert.equal(closed.status, "CLOSED");
});

test("reset humano limpa o claim da Issue CLAIMED", () => {
  const dir = root();
  const issue = createIssue({ ...body, actor: "pi", title: "reset" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  const reopened = resetClaim({ id: issue.id, human: true, comment: "liberar" }, dir);
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.owner, null);
  assert.throws(() => resetClaim({ id: issue.id, human: false, comment: "x" }, dir), /Reset requires --human/);
});

test("devolução para OPEN carrega imagem: reset e decide-open", async () => {
  const dir = root();
  const img = () => ({ filename: "shot.png", mediaType: "image/png", bytes: Buffer.from([137, 80, 78, 71, 3]) });
  const issue = createIssue({ ...body, actor: "pi", title: "dev" }, dir);
  seedReview(dir, issue.id);
  nextIssue({ agent: "pi", project: "app" }, dir); // -> CLAIMED
  const afterReset = resetClaim({ id: issue.id, human: true, comment: "liberar", attachments: [img()] }, dir);
  const resetEntry = afterReset.thread.at(-1)!;
  assert.equal(resetEntry.status, "OPEN");
  assert.equal(resetEntry.attachments?.[0].kind, "image");
  assert.ok(new Queue(dir).artifacts.findMedia(resetEntry.attachments![0].id));

  nextIssue({ agent: "pi", project: "app" }, dir);
  seedHandoff(dir, issue.id);
  await statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "evidência" }, dir);
  const reopened = decideIssue({ id: issue.id, human: true, status: "OPEN", comment: "voltar", attachments: [img()] }, dir);
  const entry = reopened.thread.at(-1)!;
  assert.equal(entry.status, "OPEN");
  assert.equal(entry.attachments?.[0].kind, "image");
});

test("list combina filtros por tipo", () => {
  const dir = root();
  createIssue({ ...body, type: "Fix", title: "Needle old", now: new Date("2026-01-01") }, dir);
  createIssue({ ...body, type: "Fix", title: "Needle new", now: new Date("2026-01-03") }, dir);
  createIssue({ ...body, type: "Feat", title: "Needle feat" }, dir);
  const filtered = listIssues({ project: "app", status: "OPEN", title: "needle", type: "Fix" }, dir);
  assert.deepEqual(filtered.map((issue) => issue.title).sort(), ["Needle new", "Needle old"]);
  assert.equal(filtered[0].type, "Fix");
});

test("summary do quadro traz action, status_changed_at, tags e relates", () => {
  const dir = root();
  const parent = createIssue({ ...body, title: "parent", now: new Date("2026-01-01") }, dir);
  const issue = createIssue({ ...body, title: "board", complexity: "ALTA", relates: [parent.id], now: new Date("2026-01-02") }, dir);
  const card = listIssues({ project: "app", title: "board" }, dir)[0];
  assert.equal(card.action, "Review");
  assert.equal(card.status_changed_at, getIssue(issue.id, dir).status_changed_at);
  assert.deepEqual(card.tags, { complexity: "ALTA" });
  assert.deepEqual(card.relates, [parent.id]);
});

test("setArtifact grava o .md da Issue; artefato na criação idem; view injeta", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "art", artifact: "# na criação" }, dir);
  const queue = new Queue(dir);
  assert.equal(queue.artifacts.readText("app", { issueId: issue.id, type: "document" }), "# na criação");
  setArtifact({ issueId: issue.id, content: "# issue doc" }, dir);
  assert.equal(queue.artifacts.readText("app", { issueId: issue.id, type: "document" }), "# issue doc");
  assert.equal(getIssue(issue.id, dir).artifact, "# issue doc");
  assert.equal(getIssue(createIssue({ ...body, title: "sem art" }, dir).id, dir).artifact, null);
});

test("setArtifact --name grava documento nomeado e barra nome inseguro (trust boundary)", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "named" }, dir);
  const queue = new Queue(dir);
  setArtifact({ issueId: issue.id, content: "# intenção", name: "intent.md" }, dir);
  assert.equal(queue.artifacts.readText("app", { issueId: issue.id, type: "document", name: "intent.md" }), "# intenção");
  assert.equal(queue.artifacts.readText("app", { issueId: issue.id, type: "document" }), null); // não tocou o legado
  for (const bad of ["../escapa.md", "sub/dir.md", "semext", "..", "evidence.txt"]) {
    assert.throws(() => setArtifact({ issueId: issue.id, content: "x", name: bad }, dir), /Nome de artefato inválido/);
  }
});

test("limite de 300 palavras vale para artefato (criação e setArtifact)", () => {
  const dir = root();
  assert.throws(() => createIssue({ ...body, title: "big", artifact: longText }, dir), /limite 300/);
  const issue = createIssue({ ...body, title: "ok" }, dir);
  assert.throws(() => setArtifact({ issueId: issue.id, content: longText }, dir), /limite 300/);
  assert.equal(getIssue(issue.id, dir).artifact, null); // nada foi gravado
});

test("createIssue com anexo: grava bytes e põe metadados na entrada 'Issue created'; valida mediaType", () => {
  const dir = root();
  const bytes = Buffer.from([137, 80, 78, 71, 5, 5]);
  const issue = createIssue({ ...body, title: "img",
    attachments: [{ filename: "erro.png", mediaType: "image/png", bytes }] }, dir);
  const first = issue.thread[0];
  assert.equal(first.comment, "Issue created");
  assert.equal(first.attachments?.length, 1);
  assert.equal(first.attachments?.[0].kind, "image");
  const found = new Queue(dir).artifacts.findMedia(first.attachments![0].id);
  assert.equal(found?.mediaType, "image/png");
  const plain = createIssue({ ...body, title: "sem img" }, dir);
  assert.equal(plain.thread[0].attachments, undefined);
  assert.throws(() => createIssue({ ...body, title: "bad",
    attachments: [{ filename: "a.txt", mediaType: "text/plain", bytes: Buffer.from("x") }] }, dir));
});

test("setArtifact em Issue CLOSED propaga DomainError do guard", async () => {
  const dir = root();
  const issue = createIssue({ ...body, actor: "pi", title: "closed", artifact: "# qa ok" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await statusIssue({ id: issue.id, agent: "pi", status: "CLOSED", comment: "x", closed_reason: "errado" }, dir);
  assert.throws(() => setArtifact({ issueId: issue.id, content: "nope" }, dir), /CLOSED aggregate is immutable/);
});

test("erros não persistem mutação parcial", async () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "safe", action: "Planning" }, dir);
  nextIssue({ agent: "pi", project: "app" }, dir);
  await assert.rejects(statusIssue({ id: issue.id, agent: "pi", status: "AWAITING", comment: "x" }, dir));
  assert.equal(getIssue(issue.id, dir).status, "CLAIMED");
});

test("HIGH: --id de Design/Implement com pai não-CLOSED falha citando o pai; see-also não bloqueia", () => {
  const dir = highRoot();
  const parent = createIssue({ ...body, title: "parent", action: "Design" }, dir); // OPEN
  const sister = createIssue({ ...body, title: "sister", action: "Implement" }, dir);
  const child = createIssue({ ...body, title: "child", action: "Implement" }, dir);
  relateIssues({ id: child.id, relates: [sister.id] }, dir); // see-also (decorativa, não bloqueia)
  relateIssues({ id: child.id, relates: [parent.id], kind: "parent" }, dir);
  assert.throws(
    () => nextIssue({ agent: "pi", id: child.id }, dir),
    new RegExp(`não é reivindicável.*${parent.id}.*OPEN`),
  );
  assert.equal(new Queue(dir).loadRequired(child.id).status, "OPEN"); // recusado, segue OPEN
});

test("HIGH: --project pula a filha bloqueada e reivindica a próxima elegível; nunca trava a fila", () => {
  const dir = highRoot();
  const parent = createIssue({ ...body, title: "parent", action: "Design", now: new Date("2026-01-03") }, dir);
  const blocked = createIssue({ ...body, title: "blocked", action: "Implement", now: new Date("2026-01-01") }, dir);
  const eligible = createIssue({ ...body, title: "eligible", action: "Implement", now: new Date("2026-01-02") }, dir);
  relateIssues({ id: blocked.id, relates: [parent.id], kind: "parent" }, dir);
  // FIFO: blocked(01-01) tem pai OPEN → pula → eligible(01-02)
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir)?.id, eligible.id);
  // restam OPEN blocked (pai OPEN) e parent (Design sem pai) → reivindica parent
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir)?.id, parent.id);
  // só resta blocked, cujo pai agora está CLAIMED (não-CLOSED) → nada elegível, sem erro
  assert.equal(nextIssue({ agent: "pi", project: "app" }, dir), null);
  assert.equal(new Queue(dir).loadRequired(blocked.id).status, "OPEN");
});

test("HIGH: pai CLOSED (ou purgado) libera o claim de agente", () => {
  const dir = highRoot();
  const parent = createIssue({ ...body, title: "parent", action: "Design" }, dir);
  const child = createIssue({ ...body, title: "child", action: "Implement" }, dir);
  relateIssues({ id: child.id, relates: [parent.id], kind: "parent" }, dir);
  closeIssue(dir, parent.id);
  assert.equal(nextIssue({ agent: "pi", id: child.id }, dir)?.status, "CLAIMED");

  const dir2 = highRoot();
  const gone = createIssue({ ...body, title: "gone", action: "Design" }, dir2);
  const orphan = createIssue({ ...body, title: "orphan", action: "Implement" }, dir2);
  relateIssues({ id: orphan.id, relates: [gone.id], kind: "parent" }, dir2);
  closeIssue(dir2, gone.id, new Date("2026-01-01"));
  new Queue(dir2).purgeClosed(new Date("2026-07-14")); // pai some do store
  assert.equal(nextIssue({ agent: "pi", id: orphan.id }, dir2)?.status, "CLAIMED");
});

test("HIGH: só Design/Implement é bloqueado; outras actions e claim humano seguem livres", () => {
  const dir = highRoot();
  const parent = createIssue({ ...body, title: "parent", action: "Design" }, dir); // OPEN
  const review = createIssue({ ...body, title: "review", action: "Review" }, dir);
  relateIssues({ id: review.id, relates: [parent.id], kind: "parent" }, dir);
  assert.equal(nextIssue({ agent: "pi", id: review.id }, dir)?.status, "CLAIMED"); // action fora do gate

  const child = createIssue({ ...body, title: "child", action: "Implement" }, dir);
  relateIssues({ id: child.id, relates: [parent.id], kind: "parent" }, dir);
  const claimed = claimIssue({ id: child.id }, dir); // humano não é bloqueado
  assert.equal(claimed.status, "CLAIMED");
  assert.equal(claimed.owner, "human");
});

test("LOW: pai não-CLOSED não bloqueia o claim de agente (comportamento atual)", () => {
  const dir = root(); // app é LOW
  const parent = createIssue({ ...body, title: "parent", action: "Design" }, dir); // OPEN
  const child = createIssue({ ...body, title: "child", action: "Implement" }, dir);
  relateIssues({ id: child.id, relates: [parent.id], kind: "parent" }, dir);
  assert.equal(nextIssue({ agent: "pi", id: child.id }, dir)?.status, "CLAIMED");
});

// updateTags é exportado: a CLI barra o actor ausente antes (--agent is required), mas o guard
// da camada de aplicação é o que protege qualquer outro chamador do mesmo buraco.
test("updateTags exige actor para taggear a Issue, e só o humano rebaixa", () => {
  const dir = root();
  const issue = createIssue({ ...body, title: "tags", complexity: "ALTA", risk: "ALTO" }, dir);
  assert.throws(() => updateTags({ issueId: issue.id, risk: "BAIXO" }, dir), /exige actor/);
  assert.throws(() => updateTags({ issueId: issue.id, actor: "pi", risk: "BAIXO" }, dir), /rebaixar risk/);
  assert.equal(getIssue(issue.id, dir).tags.risk, "ALTO"); // nada persistiu
  updateTags({ issueId: issue.id, actor: "pi", human_need: "HITL" }, dir); // escalar: livre
  updateTags({ issueId: issue.id, actor: "human", risk: "BAIXO" }, dir); // rebaixar: só humano
  assert.equal(getIssue(issue.id, dir).tags.risk, "BAIXO");
});

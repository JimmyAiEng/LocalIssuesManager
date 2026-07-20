import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { statusIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { completeIssue } from "../../src/app/services/workflows/index.js";
import { DesignGateError } from "../../src/domain/gates/design_gate.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";
import type { ActionType, IssueType } from "../../src/domain/value_objects.js";

function context(action: ActionType, type: IssueType = "Feat"): { root: string; queue: Queue; issue: Issue } {
  const root = mkdtempSync(join(tmpdir(), "workflow-service-"));
  const queue = new Queue(root);
  const issue = Issue.create({ title: action, project: "p", type, action, problem: "p" }, "pi");
  issue.claim("pi");
  queue.save(issue);
  return { root, queue, issue };
}

// Projeto p com concern HIGH: piso de supervisão que força AWAITING em Planning/Design.
function highConcern(queue: Queue): void {
  queue.writeProject({ name: "p", repo: "x", concern: "HIGH" });
}

// Feature JSONL válida (uma linha) reutilizada por Planning (pai + filha Design cobrem "Login").
const FEATURE = JSON.stringify({ feature: "Login", como: "u", quero: "entrar", para: "acesso",
  scenarios: [{ nome: "ok", steps: ["Given a", "When b", "Then c"] }] });
const PLAN = JSON.stringify({ objetivo: "o", passos: ["p"], arquivos: ["a"], criterio_pronto: "c" });

// Artefatos de uma Planning: os requisitos que o humano lê para julgar (cobrados nas duas saídas).
function seedPlanningArtifacts(queue: Queue, issue: Issue): void {
  queue.artifacts.writeText("p", { issueId: issue.id, type: "requirement" }, FEATURE);
}

// A filha Design que particiona a Feature, no status pedido. Só o CLOSED a exige, e viva.
function addDesignChild(queue: Queue, issue: Issue, status: "OPEN" | "CLAIMED" | "CLOSED" = "OPEN"): Issue {
  const child = Issue.create({ title: "d", project: "p", type: "Feat", action: "Design", problem: "p" }, "pi");
  queue.artifacts.writeText("p", { issueId: child.id, type: "requirement" }, FEATURE);
  if (status !== "OPEN") child.claim("pi");
  if (status === "CLOSED") child.closeByAgent("pi", "feito", "concluido");
  queue.save(child);
  issue.relate([{ id: child.id, kind: "child" }]);
  return child;
}

// Entrega de Planning completa para o CLOSED AFK: requisitos + filha Design viva.
function seedPlanning(queue: Queue, issue: Issue): void {
  seedPlanningArtifacts(queue, issue);
  addDesignChild(queue, issue);
}

// Artefatos de um Design sem mudança de arquitetura: decisão + plano (atalho, sem diagramas).
function seedDesignArtifacts(queue: Queue, issue: Issue): void {
  issue.setArchitectureChanged(false);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "implementation-plan" }, PLAN);
}

function addImplementChild(queue: Queue, issue: Issue, status: "OPEN" | "CLAIMED" | "CLOSED" = "OPEN"): Issue {
  const child = Issue.create({ title: "impl", project: "p", type: "Feat", action: "Implement", problem: "p" }, "pi");
  if (status !== "OPEN") child.claim("pi");
  if (status === "CLOSED") child.closeByAgent("pi", "feito", "concluido");
  queue.save(child);
  issue.relate([{ id: child.id, kind: "child" }]);
  return child;
}

// Entrega de Design completa para o CLOSED AFK: plano + filha Implement viva.
function seedDesign(queue: Queue, issue: Issue): void {
  seedDesignArtifacts(queue, issue);
  addImplementChild(queue, issue);
}

// Conjunto de documentos de uma Review válida: intent + 2 evidence + veredito no artefato legado.
function seedReview(queue: Queue, issue: Issue, verdict = "APROVADO revisão ok"): void {
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "intent.md" }, "# intenção");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-a.md" }, "# evidência a");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-b.md" }, "# evidência b");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, verdict);
}

// Handoff obrigatório ao enviar para AWAITING não-abandono.
function seedHandoff(queue: Queue, issue: Issue): void {
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "handoff.md" }, "# handoff");
}

test("dispatcher seleciona Planning; Implement não tem gate de entrega", async () => {
  const planning = context("Planning");
  await assert.rejects(completeIssue(planning.queue, planning.issue, "CLOSED", "fim"), /sem requisitos/);
  const implement = context("Implement");
  await assert.doesNotReject(completeIssue(implement.queue, implement.issue, "CLOSED", "fim"));
});

test("dispatcher preserva DesignGateError estruturado", async () => {
  const { queue, issue } = context("Design");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"),
    (error: unknown) => error instanceof DesignGateError && error.errors[0]?.code === "decision_required");
});

test("Review exige intent + ≥2 evidence + veredito válido e depois aprova", async () => {
  const { queue, issue } = context("Review");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /sem intent\.md/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "intent.md" }, "# intenção");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /duas evidence/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-a.md" }, "# a");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /duas evidence/); // só uma evidence
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-b.md" }, "# b");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /sem o veredito/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "Talvez sim");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /deve começar por APROVADO/);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "APROVADO com ressalva: ok");
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

// Review de Refactor troca o intent.md pelo diff-check.md com as duas declarações; Feat não muda.
test("Review de Refactor exige diff-check.md com as duas declarações", async () => {
  const { queue, issue } = context("Review", "Refactor");
  seedReview(queue, issue);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /sem diff-check\.md/);

  const write = (body: string) =>
    queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "diff-check.md" }, body);

  write("# diff check\nteste_e2e_alterado: false");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /"interface_publica_alterada"/);
  write("interface_publica_alterada: false");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /"teste_e2e_alterado"/);
  write("interface_publica_alterada: talvez\nteste_e2e_alterado: false");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /"interface_publica_alterada"/);

  // Marcação de lista/negrito e caixa alta são toleradas.
  write("- **interface_publica_alterada:** FALSE\n* teste_e2e_alterado: false\n\nprosa livre.");
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

// Consequência 1: e2e alterado significa comportamento mudado — não conclui APROVADO, conclui REPROVADO.
test("Review de Refactor com e2e alterado não conclui APROVADO", async () => {
  const { queue, issue } = context("Review", "Refactor");
  seedReview(queue, issue);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "diff-check.md" },
    "interface_publica_alterada: false\nteste_e2e_alterado: true");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /teste_e2e_alterado: true/);

  // REPROVADO com retrabalho vivo conclui, mesmo com o e2e alterado.
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "REPROVADO e2e mexido");
  const rework = Issue.create({ title: "r", project: "p", type: "Refactor", action: "Implement", problem: "p" }, "pi");
  queue.save(rework);
  issue.relate([{ id: rework.id, kind: "child" }]);
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

// Fronteira de confiança: colar o modelo do guia acima da declaração honesta escondia a real (primeiro
// match vencia). Valores conflitantes agora recusam; repetição concordante segue valendo.
test("Review de Refactor recusa invariante declarada duas vezes com valores conflitantes", async () => {
  const { queue, issue } = context("Review", "Refactor");
  seedReview(queue, issue);
  const write = (body: string) =>
    queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "diff-check.md" }, body);

  write("interface_publica_alterada: false\nteste_e2e_alterado: false\n\ndeclaração real:\ninterface_publica_alterada: true\nteste_e2e_alterado: true");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /"interface_publica_alterada".*conflitantes/s);
  write("interface_publica_alterada: false\nteste_e2e_alterado: false\nteste_e2e_alterado: true");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /"teste_e2e_alterado".*conflitantes/s);

  // Repetição concordante não é ambiguidade: o valor declarado é o mesmo em todas as linhas.
  write("interface_publica_alterada: false\nteste_e2e_alterado: false\n\nresumo:\n- **interface_publica_alterada:** FALSE\n- teste_e2e_alterado: false");
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

// Consequência 2: interface pública alterada exige aceite humano — um Design APPROVED na cadeia de parents.
test("Review de Refactor com interface alterada exige Design APPROVED na linhagem", async () => {
  const { queue, issue } = context("Review", "Refactor");
  seedReview(queue, issue);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "diff-check.md" },
    "interface_publica_alterada: true\nteste_e2e_alterado: false");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /passado por APPROVED/);

  // A busca sobe a cadeia: Review → Review do ciclo anterior → Design aprovado.
  const design = Issue.create({ title: "d", project: "p", type: "Refactor", action: "Design", problem: "p" }, "pi");
  design.claim("pi");
  design.submit("pi", "desenho entregue para decisão humana");
  design.decide("APPROVED", "aprovado: pode mudar a interface");
  queue.save(design);
  const previous = Issue.create({ title: "rev", project: "p", type: "Refactor", action: "Review", problem: "p" }, "pi");
  previous.relate([{ id: design.id, kind: "parent" }]);
  queue.save(previous);
  issue.relate([{ id: previous.id, kind: "parent" }]);
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

// A busca de Design aprovado é uma BFS sobre dados que o usuário controla: ciclo entre parents não
// pode travar e parent que não existe mais no store não pode explodir — os dois terminam recusando.
test("Review de Refactor: ciclo na linhagem e parent inexistente recusam sem travar", async () => {
  const { queue, issue } = context("Review", "Refactor");
  seedReview(queue, issue);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "diff-check.md" },
    "interface_publica_alterada: true\nteste_e2e_alterado: false");

  // Ciclo A → B → A, com a Review apontando para A.
  const a = Issue.create({ title: "a", project: "p", type: "Refactor", action: "Review", problem: "p" }, "pi");
  const b = Issue.create({ title: "b", project: "p", type: "Refactor", action: "Review", problem: "p" }, "pi");
  a.relate([{ id: b.id, kind: "parent" }]);
  b.relate([{ id: a.id, kind: "parent" }]);
  queue.save(a);
  queue.save(b);
  issue.relate([{ id: a.id, kind: "parent" }]);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /passado por APPROVED/);

  // Parent que não existe no store: a BFS pula o id órfão em vez de estourar.
  b.relate([{ id: "nao-existe-no-store", kind: "parent" }]);
  queue.save(b);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /passado por APPROVED/);
});

// Interface intacta não consulta a linhagem: conclui APROVADO sem nenhum Design relacionado.
test("Review de Refactor com interface intacta não consulta a linhagem", async () => {
  const { queue, issue } = context("Review", "Refactor");
  seedReview(queue, issue);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "diff-check.md" },
    "interface_publica_alterada: false\nteste_e2e_alterado: false");
  assert.deepEqual(issue.relates, []);
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

test("Review de Refactor conclui sem intent.md", async () => {
  const { queue, issue } = context("Review", "Refactor");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "diff-check.md" },
    "interface_publica_alterada: false\nteste_e2e_alterado: false");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-a.md" }, "# a");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "evidence-b.md" }, "# b");
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document" }, "APROVADO revisão ok");
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

test("Review rejeita documento acima de 300 palavras", async () => {
  const { queue, issue } = context("Review");
  seedReview(queue, issue);
  queue.artifacts.writeText("p", { issueId: issue.id, type: "document", name: "intent.md" }, Array(301).fill("x").join(" "));
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /limite 300/);
});

// Veredito REPROVADO só conclui com retrabalho vivo: uma Issue relacionada Implement/Design fora de
// CLOSED, distinta das Issues revisadas (já fechadas).
test("Review REPROVADO exige Issue Implement/Design vinculada e não-CLOSED", async () => {
  const { queue, issue } = context("Review");
  seedReview(queue, issue, "REPROVADO: precisa refazer o gate");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /retrabalho vivo/);

  const revisada = Issue.create({ title: "revisada", project: "p", type: "Feat", action: "Implement", problem: "p" }, "pi");
  revisada.closeByHuman("revisada e fechada", "concluido"); // CLOSED: não conta como retrabalho vivo
  queue.save(revisada);
  issue.relate([{ id: revisada.id, kind: "see-also" }]);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /retrabalho vivo/);

  const rework = Issue.create({ title: "retrabalho", project: "p", type: "Fix", action: "Implement", problem: "p" }, "pi");
  queue.save(rework); // OPEN: retrabalho vivo
  issue.relate([{ id: rework.id, kind: "see-also" }]);
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

// === Inversão do fan-out: filha só existe depois que o humano interveio ========================

// Regra 1: qualquer relação kind="child" barra a ida para AWAITING, em toda action. see-also e
// parent são ignorados (só a linhagem descendente é decomposição).
test("AWAITING recusa Issue com filha e aceita sem filha; see-also/parent não contam", async () => {
  const { queue, issue } = context("Implement");
  seedHandoff(queue, issue);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "ev"));

  const vizinha = Issue.create({ title: "v", project: "p", type: "Feat", action: "Implement", problem: "p" }, "pi");
  queue.save(vizinha);
  issue.relate([{ id: vizinha.id, kind: "see-also" }]);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "ev"));

  addImplementChild(queue, issue);
  await assert.rejects(completeIssue(queue, issue, "AWAITING", "ev"),
    /não vai para AWAITING com filha.*decomposição vem DEPOIS da aprovação/s);
});

// Exceção da Regra 1: quem já passou por APPROVED volta a AWAITING mesmo decomposta — senão a
// Issue aprovada que já criou as filhas e precisa de uma segunda decisão fica presa para sempre.
test("AWAITING aceita Issue com filha quando ela já passou por APPROVED", async () => {
  const { queue, issue } = context("Implement");
  seedHandoff(queue, issue);
  addImplementChild(queue, issue);
  await assert.rejects(completeIssue(queue, issue, "AWAITING", "ev"), /não vai para AWAITING com filha/);

  issue.submit("pi", "ev"); issue.decide("APPROVED", "ok"); issue.claim("pi"); // phases passam por APPROVED
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "ev"));
});

// Regra 3 no Planning: a filha Design que cobre a Feature tem que estar viva no CLOSED.
test("Planning só fecha com a filha Design viva (OPEN ou CLAIMED)", async () => {
  const semFilha = context("Planning");
  seedPlanningArtifacts(semFilha.queue, semFilha.issue);
  await assert.rejects(completeIssue(semFilha.queue, semFilha.issue, "CLOSED", "fim"),
    /não fecha sem decompor a Feature "Login"/);

  const morta = context("Planning");
  seedPlanningArtifacts(morta.queue, morta.issue);
  addDesignChild(morta.queue, morta.issue, "CLOSED");
  await assert.rejects(completeIssue(morta.queue, morta.issue, "CLOSED", "fim"),
    /filha Design .* em CLOSED.*OPEN ou CLAIMED/s);

  for (const status of ["OPEN", "CLAIMED"] as const) {
    const viva = context("Planning");
    seedPlanningArtifacts(viva.queue, viva.issue);
    addDesignChild(viva.queue, viva.issue, status);
    await assert.doesNotReject(completeIssue(viva.queue, viva.issue, "CLOSED", "fim"));
  }
});

// Regra 3 no Design: a filha Implement também precisa estar viva para o CLOSED.
test("Design só fecha com a filha Implement viva (OPEN ou CLAIMED)", async () => {
  const morta = context("Design");
  seedDesignArtifacts(morta.queue, morta.issue);
  addImplementChild(morta.queue, morta.issue, "CLOSED");
  await assert.rejects(completeIssue(morta.queue, morta.issue, "CLOSED", "fim"),
    /não fecha sem decompor em Implement viva/);

  for (const status of ["OPEN", "CLAIMED"] as const) {
    const viva = context("Design");
    seedDesignArtifacts(viva.queue, viva.issue);
    addImplementChild(viva.queue, viva.issue, status);
    await assert.doesNotReject(completeIssue(viva.queue, viva.issue, "CLOSED", "fim"));
  }
});

// Regra 3 na Review: o veredito REPROVADO vai para o humano SEM retrabalho criado — aprovar o
// REPROVADO é o humano concordando com a reprovação; só então o agente abre a correção e fecha.
test("Review REPROVADO vai a AWAITING sem retrabalho e só fecha com retrabalho vivo", async () => {
  const { queue, issue } = context("Review");
  seedReview(queue, issue, "REPROVADO: precisa refazer o gate");
  seedHandoff(queue, issue);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /retrabalho vivo/);

  // Retrabalho parado em AWAITING não corrige nada: só OPEN/CLAIMED satisfazem.
  const parado = Issue.create({ title: "r", project: "p", type: "Fix", action: "Implement", problem: "p" }, "pi");
  parado.claim("pi");
  parado.submit("pi", "entrego para decisão");
  queue.save(parado);
  issue.relate([{ id: parado.id, kind: "see-also" }]);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /retrabalho vivo.*OPEN ou CLAIMED/s);

  const vivo = Issue.create({ title: "r2", project: "p", type: "Fix", action: "Implement", problem: "p" }, "pi");
  vivo.claim("pi");
  queue.save(vivo);
  issue.relate([{ id: vivo.id, kind: "see-also" }]);
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim"));
});

// Buraco que kind="child" não fecha: o retrabalho nasce de '--relates', cujo default é see-also.
// Na Review a trava do AWAITING é o inverso exato de requireLiveRework — qualquer kind conta.
test("Review não vai a AWAITING com retrabalho see-also vivo criado cedo", async () => {
  const { queue, issue } = context("Review");
  seedReview(queue, issue, "REPROVADO: precisa refazer o gate");
  seedHandoff(queue, issue);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));

  // Issue revisada (CLOSED) não é retrabalho: revisa-se trabalho terminado.
  const revisada = Issue.create({ title: "revisada", project: "p", type: "Feat", action: "Implement", problem: "p" }, "pi");
  revisada.closeByHuman("revisada e fechada", "concluido");
  queue.save(revisada);
  issue.relate([{ id: revisada.id, kind: "see-also" }]);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));

  const cedo = Issue.create({ title: "correção", project: "p", type: "Fix", action: "Implement", problem: "p" }, "pi");
  queue.save(cedo); // OPEN, ligada por see-also: escaparia de uma trava só de kind="child"
  issue.relate([{ id: cedo.id, kind: "see-also" }]);
  await assert.rejects(completeIssue(queue, issue, "AWAITING", "fim"),
    /não vai para AWAITING com retrabalho já criado.*aprovar um REPROVADO/s);

  // Exceção da Regra 1: já tendo passado por APPROVED, ela volta a AWAITING mesmo com o retrabalho.
  issue.submit("pi", "ev"); issue.decide("APPROVED", "ok"); issue.claim("pi");
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
});

// A trava de supervisão precede o gate de entrega: quem nunca fecha por agente ouve isso primeiro,
// em vez de ser mandado decompor — decompor barraria o AWAITING que é o único caminho restante.
test("CLOSED impossível avisa da decisão humana antes de cobrar a decomposição", async () => {
  const { queue, issue } = context("Planning");
  highConcern(queue);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /concern HIGH.*--status AWAITING/s);
  // Já aprovada, a trava sai da frente e o gate de entrega volta a falar.
  const aprovada = context("Planning");
  highConcern(aprovada.queue);
  aprovada.issue.submit("pi", "ev"); aprovada.issue.decide("APPROVED", "ok"); aprovada.issue.claim("pi");
  await assert.rejects(completeIssue(aprovada.queue, aprovada.issue, "CLOSED", "fim"), /sem requisitos/);
});

// AFK segue igual: CLAIMED → CLOSED decompondo na mesma sessão, sem passar pelo humano.
test("caminho AFK CLAIMED→CLOSED segue decompondo como antes", async () => {
  const planning = context("Planning");
  seedPlanning(planning.queue, planning.issue);
  planning.queue.save(planning.issue); // statusIssue relê do disco: a linhagem precisa estar gravada
  const closed = await statusIssue({ id: planning.issue.id, agent: "pi", status: "CLOSED",
    comment: "planning fechado com as filhas", closed_reason: "concluido" }, planning.root);
  assert.equal(closed.status, "CLOSED");

  const design = context("Design");
  seedDesign(design.queue, design.issue);
  design.queue.save(design.issue);
  const designClosed = await statusIssue({ id: design.issue.id, agent: "pi", status: "CLOSED",
    comment: "design fechado com as filhas", closed_reason: "concluido" }, design.root);
  assert.equal(designClosed.status, "CLOSED");
});

// closeByHuman também passa pelo gate de entrega, e é caminho CLOSED: cobra a sequência viva.
test("fechamento humano concluido cobra a sequência viva do CLOSED", async () => {
  const { root, queue, issue } = context("Design");
  seedDesignArtifacts(queue, issue);
  queue.save(issue);
  await assert.rejects(statusIssue({ id: issue.id, human: true, status: "CLOSED",
    comment: "fecho eu", closed_reason: "concluido" }, root), /não fecha sem decompor em Implement viva/);
  addImplementChild(queue, issue);
  queue.save(issue);
  const closed = await statusIssue({ id: issue.id, human: true, status: "CLOSED",
    comment: "fecho eu", closed_reason: "concluido" }, root);
  assert.equal(closed.status, "CLOSED");
});

test("Deploy força humano antes de validar evidência", async () => {
  const { queue, issue } = context("Deploy");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "https://git/pr/1 análise sonar"), /não fecha por agente/);
  await assert.rejects(completeIssue(queue, issue, "AWAITING", "sem link"), /exige evidência/);
  seedHandoff(queue, issue);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "https://git/pr/1 análise sonar OK"));
});

// Handoff obrigatório só ao enviar para AWAITING não-abandono; Implement isola (sem gate de entrega).
test("AWAITING exige handoff.md; com ele passa; abandono dispensa", async () => {
  const { queue, issue } = context("Implement");
  await assert.rejects(completeIssue(queue, issue, "AWAITING", "ev"), /handoff.*issues artifact/s);
  seedHandoff(queue, issue);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "ev"));
  const aband = context("Implement");
  await assert.doesNotReject(completeIssue(aband.queue, aband.issue, "AWAITING", "ev", true));
});

// Pós-APPROVED o humano já decidiu: a trava human-required é dispensada no fechamento, mas o gate
// de entrega segue cobrando a entrega da action.
test("fechamento pós-APPROVED dispensa a trava humana mas revalida o gate de entrega", async () => {
  const { queue, issue } = context("Review");
  issue.tag({ risk: "ALTO" }, "human"); // human-required
  issue.submit("pi", "ev"); issue.decide("APPROVED", "ok"); issue.claim("pi"); // phases passam por APPROVED
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /sem intent\.md/); // gate ainda cobra
  seedReview(queue, issue);
  await assert.doesNotReject(completeIssue(queue, issue, "CLOSED", "fim")); // trava humana dispensada
});

test("GatePolicy impede CLOSED com supervisão e permite AWAITING", async () => {
  const { queue, issue } = context("Review");
  seedReview(queue, issue);
  seedHandoff(queue, issue);
  issue.tag({ risk: "ALTO" }, "human");
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /decisão humana/);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
});

// Abandono pela IA: sem entrega prevista, o gate da action não se aplica — mas a supervisão
// humana (HITL/risco ALTO) continua barrando o CLOSED e empurrando a Issue para AWAITING.
test("abandono da IA pula o gate da action nas duas saídas", async () => {
  const closed = context("Planning");
  const issue = await statusIssue({ id: closed.issue.id, agent: "pi", status: "CLOSED",
    comment: "criada errada, abandonando", closed_reason: "obsoleto" }, closed.root);
  assert.equal(issue.status, "CLOSED");
  const hitl = context("Planning");
  hitl.issue.tag({ human_need: "HITL" }, "human");
  hitl.queue.save(hitl.issue);
  const awaiting = await statusIssue({ id: hitl.issue.id, agent: "pi", status: "AWAITING",
    comment: "criada errada", closed_reason: "errado" }, hitl.root);
  assert.equal(awaiting.status, "AWAITING");
});

test("abandono não afrouxa o gate de entrega nem a decisão humana", async () => {
  const concluded = context("Planning");
  await assert.rejects(statusIssue({ id: concluded.issue.id, agent: "pi", status: "CLOSED",
    comment: "feito", closed_reason: "concluido" }, concluded.root), /sem requisitos/);
  const hitl = context("Planning");
  hitl.issue.tag({ human_need: "HITL" }, "human");
  hitl.queue.save(hitl.issue);
  await assert.rejects(statusIssue({ id: hitl.issue.id, agent: "pi", status: "CLOSED",
    comment: "abandonando", closed_reason: "obsoleto" }, hitl.root), /decisão humana/);
});

// concern=HIGH é piso de supervisão: Planning e Design AFK (sem tags) nunca fecham por agente —
// o CLOSED é recusado mandando usar AWAITING, e o AWAITING (decisão humana) segue permitido.
// A trava de supervisão precede o gate de entrega: a Issue sem filha nenhuma (a ordem nova) já
// ouve "use AWAITING" no CLOSED, sem ser mandada decompor antes.
test("HIGH força AWAITING em Planning AFK: CLOSED recusado, AWAITING ok", async () => {
  const { queue, issue } = context("Planning");
  highConcern(queue);
  seedPlanningArtifacts(queue, issue);
  seedHandoff(queue, issue);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /concern HIGH.*--status AWAITING/s);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
});

test("HIGH força AWAITING em Design AFK sem mudança de arquitetura: CLOSED recusado, AWAITING ok", async () => {
  const { queue, issue } = context("Design");
  highConcern(queue);
  seedDesignArtifacts(queue, issue);
  seedHandoff(queue, issue);
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /concern HIGH.*--status AWAITING/s);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
});

// Refactor sempre passa pelo engenheiro: o Design de Refactor não tem o atalho AFK do Feat —
// mesmo sem mudança de arquitetura e em projeto LOW, o CLOSED é recusado e só AWAITING passa.
test("Refactor Design não fecha por agente mesmo sem mudança de arquitetura", async () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-service-"));
  const queue = new Queue(root);
  const issue = Issue.create({ title: "d", project: "p", type: "Refactor", action: "Design", problem: "p" }, "pi");
  issue.claim("pi");
  queue.save(issue);
  seedDesignArtifacts(queue, issue); // architecture_changed=false + plano
  seedHandoff(queue, issue); // AWAITING não-abandono exige handoff.md
  await assert.rejects(completeIssue(queue, issue, "CLOSED", "fim"), /Refactor.*--status AWAITING/s);
  await assert.doesNotReject(completeIssue(queue, issue, "AWAITING", "fim"));
});

// HIGH não toca as demais actions: Implement AFK fecha normalmente (o gate de Implement só cobra
// evidência, já dada na transição); Review AFK também fecha com a entrega válida.
test("HIGH não altera Implement nem Review: AFK fecha normalmente", async () => {
  const implement = context("Implement");
  highConcern(implement.queue);
  await assert.doesNotReject(completeIssue(implement.queue, implement.issue, "CLOSED", "fim"));
  const review = context("Review");
  highConcern(review.queue);
  seedReview(review.queue, review.issue);
  await assert.doesNotReject(completeIssue(review.queue, review.issue, "CLOSED", "fim"));
});

// LOW (e projeto sem concern) mantém o comportamento atual: Planning/Design AFK fecham.
test("LOW não força AWAITING: Planning/Design AFK fecham como hoje", async () => {
  const planning = context("Planning");
  planning.queue.writeProject({ name: "p", repo: "x", concern: "LOW" });
  seedPlanning(planning.queue, planning.issue);
  await assert.doesNotReject(completeIssue(planning.queue, planning.issue, "CLOSED", "fim"));
  const design = context("Design"); // sem project.json: readProject null → LOW
  seedDesign(design.queue, design.issue);
  await assert.doesNotReject(completeIssue(design.queue, design.issue, "CLOSED", "fim"));
});

test("fechamento humano concluido exige entrega; cancelamento preserva override", async () => {
  const concluded = context("Review");
  await assert.rejects(statusIssue({ id: concluded.issue.id, human: true, status: "CLOSED",
    comment: "feito", closed_reason: "concluido" }, concluded.root), /sem intent\.md/);
  const obsolete = context("Review");
  const closed = await statusIssue({ id: obsolete.issue.id, human: true, status: "CLOSED",
    comment: "cancelada", closed_reason: "obsoleto" }, obsolete.root);
  assert.equal(closed.status, "CLOSED");
});

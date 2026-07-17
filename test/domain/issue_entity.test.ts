import assert from "node:assert/strict";
import test from "node:test";
import { Attachment } from "../../src/domain/attachment_entity.js";
import { DomainError } from "../../src/domain/domain_error.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { Ticket } from "../../src/domain/ticket_entity.js";

const input = {
  title: "Implementar fila",
  project: "workflowdev",
  type: "Feat" as const,
  problem: "Não há fila",
};

const ticketFor = (issue: Issue, actor: "human" | "pi" | "codex" = "pi") =>
  Ticket.create({ issue_id: issue.id, objective: "o", task: "t", acceptance_criteria: "c",
    type: "Implement", actor });

// Issue CLAIMED e classificada: addTicket exige risk+complexity para derivar a autonomia do Ticket.
// Feat·BAIXO·BAIXA só força HITL em Planning; Implement (o ticketFor acima) deriva AFK.
const claimed = (actor: "pi" | "codex" = "pi") => {
  const issue = Issue.create(input, "pi");
  issue.tag({ complexity: "BAIXA", risk: "BAIXO" }, "human");
  issue.claim(actor);
  return issue;
};

const ongoing = (actor: "pi" | "codex" = "pi") => {
  const issue = claimed(actor);
  const ticket = ticketFor(issue, actor);
  issue.addTicket(ticket);
  return { issue, ticket };
};

const closeConfirmation = (issue: Issue, actor: "pi" | "codex" = "pi") => {
  const conf = issue.tickets.find((candidate) => candidate.type === "Confirmation");
  if (!conf) throw new Error("Ticket de confirmação ausente");
  issue.claimTicket(conf.id, actor);
  issue.transitionTicket(conf.id, actor, "CLOSED", "verificado", "concluido");
};

test("cria Issue OPEN com defaults, revisão zero e sem Tickets", () => {
  const issue = Issue.create(input, "human", new Date("2026-01-01T00:00:00Z"));
  assert.equal(issue.status, "OPEN");
  assert.equal(issue.owner, null);
  assert.equal(issue.human_presence, true);
  assert.equal(issue.artifacts, "");
  assert.equal(issue.acceptance_criteria, "");
  assert.deepEqual(issue.tickets, []);
  assert.equal(issue.revision, 0);
  assert.equal(issue.baseRevision, 0);
  assert.deepEqual(issue.phases, [{ status: "OPEN", timestamp: "2026-01-01T00:00:00.000Z" }]);
});

test("campos obrigatórios rejeitam whitespace; artefatos são opcionais", () => {
  assert.throws(
    () => Issue.create({ ...input, problem: "   " }, "pi"),
    (error: unknown) => error instanceof DomainError && error.message === "problem is required",
  );
  const issue = Issue.create({ ...input, artifacts: "src/", acceptance_criteria: "ok" }, "pi");
  assert.equal(issue.artifacts, "src/");
  assert.equal(issue.acceptance_criteria, "ok");
});

test("claim leva OPEN a CLAIMED e incrementa a revisão", () => {
  const issue = Issue.create(input, "pi");
  issue.claim("codex");
  assert.equal(issue.status, "CLAIMED");
  assert.equal(issue.owner, "codex");
  assert.equal(issue.revision, 1);
  assert.equal(issue.thread.length, 1);
});

test("o primeiro Ticket move CLAIMED para ON-GOING sem thread de Issue", () => {
  const issue = claimed();
  const revision = issue.revision;
  issue.addTicket(ticketFor(issue));
  assert.equal(issue.status, "ON-GOING");
  assert.equal(issue.tickets.length, 1);
  assert.equal(issue.thread.length, 1);
  assert.equal(issue.phases.at(-1)?.status, "ON-GOING");
  assert.equal(issue.revision, revision + 1);
});

test("addTicket recusa fora de CLAIMED/ON-GOING e Ticket de outra Issue", () => {
  const open = Issue.create(input, "pi");
  assert.throws(() => open.addTicket(ticketFor(open)), /Expected CLAIMED or ON-GOING, got OPEN/);

  const { issue } = ongoing();
  const alheio = Ticket.create({ issue_id: "outra", objective: "o", task: "t",
    acceptance_criteria: "c", type: "QA", actor: "pi" });
  assert.throws(() => issue.addTicket(alheio), /Ticket belongs to another Issue/);
});

test("addTicket exige classificação (risk e complexity) da Issue para derivar a autonomia", () => {
  const semTags = Issue.create(input, "pi");
  semTags.claim("pi");
  assert.throws(() => semTags.addTicket(ticketFor(semTags)),
    (error: unknown) => error instanceof DomainError && /risk e complexity/.test(error.message));
  assert.equal(semTags.tickets.length, 0); // nenhum Ticket é criado

  const semRisk = Issue.create(input, "pi");
  semRisk.claim("pi");
  semRisk.tag({ complexity: "BAIXA" }, "human");
  assert.throws(() => semRisk.addTicket(ticketFor(semRisk)), /risk e complexity/);

  const semComplexity = Issue.create(input, "pi");
  semComplexity.claim("pi");
  semComplexity.tag({ risk: "BAIXO" }, "human");
  assert.throws(() => semComplexity.addTicket(ticketFor(semComplexity)), /risk e complexity/);

  // Sem human_need a criação passa: o override só existe quando vale HITL; ausência é AFK.
  const semHumanNeed = claimed();
  semHumanNeed.addTicket(ticketFor(semHumanNeed));
  assert.equal(semHumanNeed.tickets.at(-1)!.tags.human_need, "AFK");
});

test("addTicket rejeitado não marca o Ticket com autonomia", () => {
  const issue = claimed();
  const alheio = Ticket.create({ issue_id: "outra", objective: "o", task: "t",
    acceptance_criteria: "c", type: "QA", actor: "pi" });
  assert.throws(() => issue.addTicket(alheio), /Ticket belongs to another Issue/);
  assert.deepEqual(alheio.tags, {}); // a derivação só acontece depois de todas as validações
});

test("fase posterior só pode ser criada com as anteriores CLOSED (OPEN/CLAIMED/AWAITING bloqueiam)", () => {
  const issue = claimed();
  const phase = (type: "Planning" | "Design") => Ticket.create({ issue_id: issue.id,
    objective: "o", task: "t", acceptance_criteria: "c", type, actor: "pi" });
  const planning = phase("Planning");
  issue.addTicket(planning);
  assert.throws(() => issue.addTicket(phase("Design")), /Design bloqueado: Planning/);
  issue.claimTicket(planning.id, "pi");
  assert.throws(() => issue.addTicket(phase("Design")), /Design bloqueado: Planning/);
  issue.transitionTicket(planning.id, "pi", "AWAITING", "pronto");
  assert.throws(() => issue.addTicket(phase("Design")), /Design bloqueado: Planning/);
  issue.decideTicket(planning.id, "CLOSED", "ok", "concluido");
  issue.addTicket(phase("Design")); // Planning CLOSED libera; Confirmation OPEN não bloqueia
  assert.equal(issue.tickets.filter((ticket) => ticket.type === "Design").length, 1);
});

test("Tickets seguintes mantêm ON-GOING e apenas incrementam a revisão", () => {
  const { issue } = ongoing();
  const revision = issue.revision;
  issue.addTicket(ticketFor(issue));
  assert.equal(issue.status, "ON-GOING");
  assert.equal(issue.tickets.length, 2);
  assert.equal(issue.phases.at(-1)?.status, "ON-GOING");
  assert.equal(issue.revision, revision + 1);
});

test("claim/transition/decide de Ticket delegam à raiz e incrementam a revisão", () => {
  const issue = claimed();
  const ticket = ticketFor(issue, "codex");
  issue.addTicket(ticket);
  let revision = issue.revision;
  issue.claimTicket(ticket.id, "codex");
  assert.equal(issue.tickets[0].status, "CLAIMED");
  assert.equal(issue.revision, ++revision);
  issue.transitionTicket(ticket.id, "codex", "AWAITING", "pronto");
  assert.equal(issue.tickets[0].status, "AWAITING");
  assert.equal(issue.revision, ++revision);
  issue.decideTicket(ticket.id, "CLOSED", "aceito", "concluido");
  assert.equal(issue.tickets[0].status, "CLOSED");
  assert.equal(issue.revision, ++revision);
});

test("operações de Ticket inexistente falham identificando o id", () => {
  const { issue } = ongoing();
  assert.throws(() => issue.claimTicket("nope", "pi"), /Ticket not found: nope/);
  assert.throws(() => issue.transitionTicket("nope", "pi", "OPEN", "x"), /Ticket not found: nope/);
  assert.throws(() => issue.decideTicket("nope", "OPEN", "x"), /Ticket not found: nope/);
});

test("fechar o Confirmation avança a Issue para AWAITING (destrava)", () => {
  const { issue, ticket } = ongoing();
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido", true);
  assert.equal(issue.status, "ON-GOING"); // Confirmation ainda OPEN
  closeConfirmation(issue);
  assert.equal(issue.status, "AWAITING");
});

test("fechar o último Ticket marcado --last injeta um Confirmation OPEN e destrava a Issue", () => {
  const { issue, ticket } = ongoing();
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido", true);
  const confirmation = issue.tickets.find((candidate) => candidate.type === "Confirmation");
  assert.ok(confirmation, "Confirmation deve ser criado ao fechar o último Ticket");
  assert.equal(confirmation?.status, "OPEN");
  assert.equal(issue.tickets.length, 2);
});

test("fechar o último Ticket SEM --last não injeta Confirmation (Issue segue ON-GOING)", () => {
  const { issue, ticket } = ongoing();
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido"); // last=false
  assert.equal(issue.tickets.some((candidate) => candidate.type === "Confirmation"), false);
  assert.equal(issue.tickets.length, 1);
  assert.equal(issue.status, "ON-GOING");
});

test("last persiste por AWAITING → decide(CLOSED) e só então injeta o Confirmation", () => {
  const { issue, ticket } = ongoing();
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "AWAITING", "pronto", undefined, true); // marca --last cedo
  assert.equal(issue.tickets.some((candidate) => candidate.type === "Confirmation"), false);
  issue.decideTicket(ticket.id, "CLOSED", "aceito", "concluido"); // decide sem repassar last
  const confirmation = issue.tickets.find((candidate) => candidate.type === "Confirmation");
  assert.ok(confirmation, "last sticky deve sobreviver ao decide e disparar o Confirmation");
  assert.equal(confirmation?.status, "OPEN");
});

test("fechar o próprio Confirmation não gera outro (quebra o loop)", () => {
  const { issue, ticket } = ongoing();
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido", true);
  closeConfirmation(issue);
  assert.equal(issue.tickets.filter((candidate) => candidate.type === "Confirmation").length, 1);
});

test("não injeta Confirmation enquanto restam Tickets abertos (entre fases)", () => {
  const { issue, ticket } = ongoing();
  issue.addTicket(ticketFor(issue));
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido");
  assert.equal(issue.tickets.some((candidate) => candidate.type === "Confirmation"), false);
});

test("reset só age em CLAIMED e nunca em ON-GOING", () => {
  const reset = Issue.create(input, "pi");
  reset.claim("pi");
  reset.reset("abandono");
  assert.equal(reset.status, "OPEN");
  assert.equal(reset.owner, null);
  assert.equal(reset.claimed_at, null);
  assert.equal(reset.human_presence, true);

  const { issue } = ongoing();
  assert.throws(() => issue.reset("liberar"), /Expected CLAIMED, got ON-GOING/);
});

test("decisão humana fecha a Issue AWAITING com motivo", () => {
  const { issue, ticket } = ongoing();
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "ok", "concluido", true);
  closeConfirmation(issue); // avança a Issue para AWAITING
  issue.decide("CLOSED", "aceito", "concluido");
  assert.equal(issue.status, "CLOSED");
  assert.equal(issue.closed_reason, "concluido");
  assert.equal(issue.human_presence, true);
});

test("IA fecha OPEN apenas sem presença humana; CLOSED é imutável", () => {
  const machine = Issue.create(input, "pi");
  machine.closeByAgent("pi", "criada errada", "errado");
  assert.equal(machine.status, "CLOSED");
  assert.throws(() => machine.claim("pi"));

  const human = Issue.create(input, "human");
  assert.throws(() => human.closeByAgent("pi", "cancelar", "errado"), /Human presence prevents IA closure/);
  human.closeByHuman("", "errado");
  assert.equal(human.status, "CLOSED");
  assert.equal(human.closed_reason, "errado");
});

test("comment anexa entrada à thread sem mudar status nem exigir dono", () => {
  const { issue } = ongoing();
  const attachment = Attachment.create({ filename: "prova.png", mediaType: "image/png", size: 10 }).toJSON();
  const revision = issue.revision;
  issue.comment("codex", "vejam a evidência", [attachment], new Date("2026-05-01T00:00:00Z"));
  assert.equal(issue.status, "ON-GOING");
  assert.equal(issue.revision, revision + 1);
  const entry = issue.thread.at(-1)!;
  assert.deepEqual(entry, { actor: "codex", timestamp: "2026-05-01T00:00:00.000Z",
    comment: "vejam a evidência", status: "ON-GOING", closed_reason: null, attachments: [attachment] });
});

test("comment aceita só anexo sem texto, mas exige comentário ou anexo", () => {
  const { issue } = ongoing();
  const attachment = Attachment.create({ filename: "v.mp4", mediaType: "video/mp4", size: 10 }).toJSON();
  issue.comment("pi", "", [attachment]);
  assert.equal(issue.thread.at(-1)?.attachments?.length, 1);
  assert.throws(() => issue.comment("pi", "   ", []), /comment or attachment is required/);
});

test("comment é bloqueado quando a Issue está CLOSED (imutável)", () => {
  const issue = Issue.create(input, "pi");
  issue.closeByAgent("pi", "errada", "errado");
  assert.throws(() => issue.comment("pi", "tarde demais"), /CLOSED aggregate is immutable/);
});

test("commentTicket delega ao Ticket e incrementa a revisão da Issue", () => {
  const { issue, ticket } = ongoing();
  const revision = issue.revision;
  issue.commentTicket(ticket.id, "pi", "nota no ticket");
  assert.equal(issue.tickets[0].thread.at(-1)?.comment, "nota no ticket");
  assert.equal(issue.revision, revision + 1);
  assert.throws(() => issue.commentTicket("nope", "pi", "x"), /Ticket not found: nope/);
});

// A tag da Issue alimenta requiredHumanNeed: rebaixá-la é o agente afrouxando a própria supervisão.
// Escalar é sempre livre (pedir mais humano nunca é ataque); rebaixar é prerrogativa humana.
test("tag da Issue por IA: escalar é aceito nos 3 eixos", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" }, "human");
  issue.tag({ risk: "MEDIO" }, "pi"); // BAIXO → MEDIO
  issue.tag({ risk: "ALTO" }, "pi"); // MEDIO → ALTO
  issue.tag({ complexity: "MEDIA" }, "pi"); // BAIXA → MEDIA
  issue.tag({ complexity: "ALTA" }, "pi"); // MEDIA → ALTA
  issue.tag({ human_need: "HITL" }, "pi"); // AFK → HITL: MAIS supervisão, apesar do índice menor em TAG_VALUES
  assert.deepEqual(issue.tags, { risk: "ALTO", complexity: "ALTA", human_need: "HITL" });
});

test("tag da Issue por IA: manter o mesmo valor é no-op aceito, e tag ausente não compara", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ risk: "MEDIO", complexity: "MEDIA", human_need: "AFK" }, "pi"); // Issue sem tags: nada a rebaixar
  issue.tag({ risk: "MEDIO", complexity: "MEDIA", human_need: "AFK" }, "pi"); // no-op
  assert.deepEqual(issue.tags, { risk: "MEDIO", complexity: "MEDIA", human_need: "AFK" });
});

test("tag da Issue por IA: rebaixar é DomainError nos 3 eixos", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ risk: "ALTO", complexity: "ALTA", human_need: "HITL" }, "human");
  assert.throws(() => issue.tag({ risk: "MEDIO" }, "pi"), (error: unknown) =>
    error instanceof DomainError && /rebaixar risk \(ALTO → MEDIO\)/.test(error.message));
  assert.throws(() => issue.tag({ risk: "BAIXO" }, "pi"), /rebaixar risk/);
  assert.throws(() => issue.tag({ complexity: "MEDIA" }, "pi"), /rebaixar complexity/);
  assert.throws(() => issue.tag({ complexity: "BAIXA" }, "pi"), /rebaixar complexity/);
  // A armadilha: human_need é ["HITL","AFK"] em TAG_VALUES — índice CRESCENTE = MENOS supervisão.
  // Comparar índice ingenuamente deixaria HITL → AFK passar, que é exatamente a fuga da coleira.
  assert.throws(() => issue.tag({ human_need: "AFK" }, "pi"), (error: unknown) =>
    error instanceof DomainError && /rebaixar human_need \(HITL → AFK\)/.test(error.message));
  assert.deepEqual(issue.tags, { risk: "ALTO", complexity: "ALTA", human_need: "HITL" }); // nada mutou
});

test("tag da Issue por IA: rebaixamento é rejeitado mesmo escondido atrás de uma escalada no mesmo update", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ risk: "ALTO", complexity: "BAIXA" }, "human");
  assert.throws(() => issue.tag({ complexity: "ALTA", risk: "BAIXO" }, "pi"), /rebaixar risk/);
  assert.deepEqual(issue.tags, { risk: "ALTO", complexity: "BAIXA" }); // update é atômico: nem a escalada passou
});

test("tag da Issue por humano: rebaixar é aceito nos 3 eixos", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ risk: "ALTO", complexity: "ALTA", human_need: "HITL" }, "human");
  issue.tag({ risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" }, "human");
  assert.deepEqual(issue.tags, { risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" });
});

test("tag valida categoria/valor, mescla e incrementa a revisão", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ complexity: "ALTA" }, "human");
  issue.tag({ human_need: "AFK", risk: "BAIXO" }, "human");
  assert.deepEqual(issue.tags, { complexity: "ALTA", human_need: "AFK", risk: "BAIXO" });
  assert.equal(issue.revision, 2);
  assert.throws(() => issue.tag({ risk: "GIGANTE" }, "human"), (error: unknown) => error instanceof DomainError && error.message === "Invalid risk: GIGANTE");
  assert.throws(() => issue.tag({}, "human"), /At least one tag is required/);
});

test("tag da Issue recomputa a autonomia dos Tickets não-CLOSED", () => {
  const { issue, ticket } = ongoing(); // Implement numa Issue Feat·BAIXO·BAIXA → AFK
  assert.equal(ticket.tags.human_need, "AFK");
  issue.tag({ risk: "ALTO", complexity: "ALTA" }, "human"); // combo tóxico: Implement passa a exigir supervisão
  assert.equal(ticket.tags.human_need, "HITL"); // a autonomia derivada nunca fica stale
  issue.tag({ risk: "BAIXO" }, "human"); // e volta (rebaixar é prerrogativa humana), porque a regra é derivada e não acumulada
  assert.equal(ticket.tags.human_need, "AFK");
});

test("tag da Issue não altera Ticket CLOSED e o retag segue aceito", () => {
  const { issue, ticket } = ongoing();
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "CLOSED", "feito", "concluido");
  assert.equal(ticket.tags.human_need, "AFK");
  issue.tag({ risk: "ALTO", complexity: "ALTA" }, "human"); // aceito: informação nova não esbarra em Ticket antigo
  assert.equal(ticket.tags.human_need, "AFK"); // CLOSED é imutável: registra a decisão da época
  assert.deepEqual(issue.tags, { complexity: "ALTA", risk: "ALTO" });
});

test("tagTicket delega ao Ticket mas rejeita human_need (derivado, não settável)", () => {
  const { issue, ticket } = ongoing();
  const revision = issue.revision;
  issue.tagTicket(ticket.id, { complexity: "MEDIA" });
  assert.deepEqual(issue.tickets[0].tags, { human_need: "AFK", complexity: "MEDIA" });
  assert.equal(issue.revision, revision + 1);

  assert.throws(() => issue.tagTicket(ticket.id, { human_need: "HITL" }),
    (error: unknown) => error instanceof DomainError && /derivado/.test(error.message));
  assert.equal(ticket.tags.human_need, "AFK"); // inalterada
  assert.equal(issue.revision, revision + 1); // e sem bump

  const closed = Issue.create(input, "pi");
  closed.closeByAgent("pi", "errada", "errado");
  assert.throws(() => closed.tag({ risk: "ALTO" }, "human"), /CLOSED aggregate is immutable/);
});

test("artifactOwnerId retorna a Issue sem ticketId e o Ticket com ticketId válido", () => {
  const { issue, ticket } = ongoing();
  assert.equal(issue.artifactOwnerId(), issue.id);
  assert.equal(issue.artifactOwnerId(ticket.id), ticket.id);
  assert.throws(() => issue.artifactOwnerId("nope"), /Ticket not found: nope/);
});

test("artifactOwnerId guarda CLOSED-imutável na Issue e no Ticket", () => {
  const closedIssue = Issue.create(input, "pi");
  closedIssue.closeByAgent("pi", "errada", "errado");
  assert.throws(() => closedIssue.artifactOwnerId(), /CLOSED aggregate is immutable/);

  const { issue, ticket } = ongoing();
  issue.claimTicket(ticket.id, "pi");
  issue.transitionTicket(ticket.id, "pi", "AWAITING", "pronto");
  issue.decideTicket(ticket.id, "CLOSED", "aceito", "concluido");
  assert.equal(issue.tickets[0].status, "CLOSED");
  assert.throws(() => issue.artifactOwnerId(ticket.id), /CLOSED aggregate is immutable/);
  assert.equal(issue.artifactOwnerId(), issue.id); // Issue segue mutável
});

test("tag com Tickets existentes recomputa cada um e incrementa a revisão uma única vez", () => {
  const { issue } = ongoing(); // 1 Ticket Implement, Issue Feat·BAIXO·BAIXA
  const revision = issue.revision;
  issue.tag({ complexity: "ALTA" }, "human"); // complexity ALTA não força Implement (só Planning/Design)
  assert.deepEqual(issue.tags, { complexity: "ALTA", risk: "BAIXO" });
  assert.equal(issue.tickets[0].tags.human_need, "AFK");
  assert.equal(issue.revision, revision + 1);
});

test("Issue legada sem classificação ainda destrava: o Confirmation deriva AFK e a IA fecha", () => {
  // Persistida antes do guard: tem Ticket e nenhuma tag. O Confirmation não passa por addTicket
  // de propósito, e a regra é total (tag ausente não dispara gatilho) — ninguém fica preso.
  const { issue, ticket } = ongoing();
  const legacy = Issue.fromJSON({ ...issue.toJSON(), tags: {} });
  const legacyTicket = legacy.ticket(ticket.id);
  legacy.claimTicket(legacyTicket.id, "pi");
  legacy.transitionTicket(legacyTicket.id, "pi", "CLOSED", "feito", "concluido", true);
  const confirmation = legacy.tickets.at(-1)!;
  assert.equal(confirmation.type, "Confirmation");
  assert.equal(confirmation.tags.human_need, "AFK");
  legacy.claimTicket(confirmation.id, "pi");
  legacy.transitionTicket(confirmation.id, "pi", "CLOSED", "verificado", "concluido");
  assert.equal(legacy.status, "AWAITING");
});

test("fromJSON hidrata Tickets como entidades e toJSON os serializa", () => {
  const { issue } = ongoing();
  const clone = Issue.fromJSON(issue.toJSON());
  assert.ok(clone.tickets[0] instanceof Ticket);
  assert.equal(clone.baseRevision, issue.revision);
  assert.equal("baseRevision" in issue.toJSON(), false);
  assert.deepEqual(clone.toJSON(), issue.toJSON());
});

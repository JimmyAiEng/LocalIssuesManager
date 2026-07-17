import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { requiredHumanNeed, Ticket, type Classified } from "../../src/domain/ticket_entity.js";
import { TICKET_TYPES, type HumanNeed, type IssueType, type Tags, type TicketType } from "../../src/domain/value_objects.js";

const issueBody = { title: "t", project: "app", problem: "p" };
const ticketBody = { objective: "o", task: "t", acceptance_criteria: "c", actor: "pi" as const };

const classified = (type: IssueType, tags: Tags): Classified => ({ type, tags });

// Autonomia derivada de cada fase, na ordem de TICKET_TYPES: Planning, Design, Implement, QA, Deploy, Confirmation.
const resolve = (issue: Classified): HumanNeed[] => TICKET_TYPES.map((type) => requiredHumanNeed(issue, type));

// Issue CLAIMED classificada, pronta para receber Tickets (o guard de addTicket exige risk+complexity).
const issueWith = (tags: Tags, type: IssueType = "Feat"): Issue => {
  const issue = Issue.create({ ...issueBody, type }, "human");
  issue.claim("pi");
  issue.tag(tags, "human");
  return issue;
};

const addTicket = (issue: Issue, type: TicketType): Ticket => {
  issue.addTicket(Ticket.create({ ...ticketBody, issue_id: issue.id, type }));
  return issue.tickets.at(-1)!;
};

// ─── Os 8 gatilhos (spec: Artefato da Issue 164fe3fc, §Gatilhos) ───

test("gatilho override humano: human_need HITL força Planning, Design, Deploy e Confirmation", () => {
  const issue = classified("Fix", { risk: "BAIXO", complexity: "BAIXA", human_need: "HITL" });
  assert.deepEqual(resolve(issue), ["HITL", "HITL", "AFK", "AFK", "HITL", "HITL"]);
});

test("gatilho risco alto: risk ALTO força Design, QA, Deploy e Confirmation", () => {
  const issue = classified("Fix", { risk: "ALTO", complexity: "BAIXA", human_need: "AFK" });
  assert.deepEqual(resolve(issue), ["AFK", "HITL", "AFK", "HITL", "HITL", "HITL"]);
});

test("gatilho risco médio: risk MEDIO força só Deploy", () => {
  const issue = classified("Fix", { risk: "MEDIO", complexity: "BAIXA", human_need: "AFK" });
  assert.deepEqual(resolve(issue), ["AFK", "AFK", "AFK", "AFK", "HITL", "AFK"]);
});

test("gatilho complexidade alta: complexity ALTA força Planning e Design", () => {
  const issue = classified("Refactor", { risk: "BAIXO", complexity: "ALTA", human_need: "AFK" });
  assert.deepEqual(resolve(issue), ["HITL", "HITL", "AFK", "AFK", "AFK", "AFK"]);
});

test("gatilho spec desconhecida: Issue Research força Planning e Design", () => {
  const issue = classified("Research", { risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" });
  assert.deepEqual(resolve(issue), ["HITL", "HITL", "AFK", "AFK", "AFK", "AFK"]);
});

test("gatilho superfície nova: Issue Feat força Planning", () => {
  const issue = classified("Feat", { risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" });
  assert.deepEqual(resolve(issue), ["HITL", "AFK", "AFK", "AFK", "AFK", "AFK"]);
});

test("gatilho combo tóxico: risk ALTO e complexity ALTA forçam Implement", () => {
  assert.equal(requiredHumanNeed(classified("Fix", { risk: "ALTO", complexity: "ALTA", human_need: "AFK" }), "Implement"), "HITL");
  // Implement é a única fase que só o combo dos DOIS eixos consegue forçar: um eixo sozinho não basta.
  assert.equal(requiredHumanNeed(classified("Fix", { risk: "ALTO", complexity: "MEDIA" }), "Implement"), "AFK");
  assert.equal(requiredHumanNeed(classified("Fix", { risk: "BAIXO", complexity: "ALTA" }), "Implement"), "AFK");
});

test("default é autonomia: nenhum gatilho disparando resolve tudo AFK", () => {
  const issue = classified("Fix", { risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" });
  assert.deepEqual(resolve(issue), ["AFK", "AFK", "AFK", "AFK", "AFK", "AFK"]);
});

// ─── Propriedades da regra ───

test("a função é total: tag ausente nunca dispara gatilho", () => {
  // risk indefinido não é risco alto; human_need indefinido não é override. Issue legada não classificada deriva AFK.
  assert.deepEqual(resolve(classified("Fix", {})), ["AFK", "AFK", "AFK", "AFK", "AFK", "AFK"]);
  assert.equal(requiredHumanNeed(classified("Feat", {}), "Planning"), "HITL"); // o type sozinho ainda dispara
});

test("max wins: basta um gatilho disparar, e nenhum rebaixa uma fase já forçada a HITL", () => {
  // Feat força Planning; complexity ALTA força Planning e Design. A união vence, sem rebaixamento.
  const issue = classified("Feat", { risk: "BAIXO", complexity: "ALTA", human_need: "AFK" });
  assert.equal(requiredHumanNeed(issue, "Planning"), "HITL");
  assert.deepEqual(resolve(issue), ["HITL", "HITL", "AFK", "AFK", "AFK", "AFK"]);
});

test("human_need é piso e nunca teto: AFK declarado não rebaixa fase forçada por risk/complexity", () => {
  const issue = classified("Fix", { risk: "ALTO", complexity: "ALTA", human_need: "AFK" });
  assert.deepEqual(resolve(issue), ["HITL", "HITL", "HITL", "HITL", "HITL", "HITL"]);
});

// ─── As 7 linhas da matriz resolvida (spec: Artefato, §Matriz resolvida) ───

test("matriz resolvida: as 7 linhas aprovadas viram comportamento literal", () => {
  const matrix: [IssueType, Tags, HumanNeed[]][] = [
    ["Fix", { risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" }, ["AFK", "AFK", "AFK", "AFK", "AFK", "AFK"]],
    ["Fix", { risk: "MEDIO", complexity: "MEDIA", human_need: "AFK" }, ["AFK", "AFK", "AFK", "AFK", "HITL", "AFK"]],
    ["Feat", { risk: "MEDIO", complexity: "MEDIA", human_need: "AFK" }, ["HITL", "AFK", "AFK", "AFK", "HITL", "AFK"]],
    ["Feat", { risk: "ALTO", complexity: "ALTA", human_need: "AFK" }, ["HITL", "HITL", "HITL", "HITL", "HITL", "HITL"]],
    ["Refactor", { risk: "BAIXO", complexity: "ALTA", human_need: "AFK" }, ["HITL", "HITL", "AFK", "AFK", "AFK", "AFK"]],
    ["Research", { risk: "BAIXO", complexity: "MEDIA", human_need: "AFK" }, ["HITL", "HITL", "AFK", "AFK", "AFK", "AFK"]],
    ["Fix", { risk: "BAIXO", complexity: "BAIXA", human_need: "HITL" }, ["HITL", "HITL", "AFK", "AFK", "HITL", "HITL"]],
  ];
  for (const [type, tags, expected] of matrix) {
    assert.deepEqual(resolve(classified(type, tags)), expected, `perfil ${type}·${tags.risk}·${tags.complexity}·${tags.human_need}`);
  }
});

// ─── Invariantes preservadas (critérios de aceite 4 e 5) ───

test("invariante: em Issue AFK sem gatilho a IA fecha o Ticket direto", () => {
  const issue = issueWith({ risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" }, "Fix");
  const implement = addTicket(issue, "Implement");
  assert.equal(implement.tags.human_need, "AFK");
  issue.claimTicket(implement.id, "pi");
  issue.transitionTicket(implement.id, "pi", "CLOSED", "feito", "concluido");
  assert.equal(implement.status, "CLOSED");
});

test("invariante: em Issue AFK sem gatilho a IA fecha o Confirmation direto e destrava a Issue", () => {
  const issue = issueWith({ risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" }, "Fix");
  const implement = addTicket(issue, "Implement");
  issue.claimTicket(implement.id, "pi");
  issue.transitionTicket(implement.id, "pi", "CLOSED", "feito", "concluido", true);
  const confirmation = issue.tickets.at(-1)!;
  assert.equal(confirmation.type, "Confirmation");
  assert.equal(confirmation.tags.human_need, "AFK");
  issue.claimTicket(confirmation.id, "pi");
  issue.transitionTicket(confirmation.id, "pi", "CLOSED", "resolvido", "concluido");
  assert.equal(issue.status, "AWAITING");
});

test("invariante: Ticket com autonomia derivada HITL não é fechado pela IA; vai a AWAITING", () => {
  const issue = issueWith({ risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" }, "Feat");
  const planning = addTicket(issue, "Planning"); // Issue Feat → Planning deriva HITL
  assert.equal(planning.tags.human_need, "HITL");
  issue.claimTicket(planning.id, "pi");
  assert.throws(
    () => issue.transitionTicket(planning.id, "pi", "CLOSED", "feito", "concluido"),
    (e: unknown) => e instanceof DomainError && /HITL/.test(e.message),
  );
  assert.equal(planning.status, "CLAIMED");
  issue.transitionTicket(planning.id, "pi", "AWAITING", "pronto para decisão humana");
  assert.equal(planning.status, "AWAITING");
  issue.decideTicket(planning.id, "CLOSED", "aprovado", "concluido"); // só o humano fecha
  assert.equal(planning.status, "CLOSED");
});

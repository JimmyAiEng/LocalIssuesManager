import assert from "node:assert/strict";
import test from "node:test";
import { Attachment } from "../../src/domain/attachment_entity.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { Ticket } from "../../src/domain/ticket_entity.js";
import { TICKET_TYPES, type IssueType, type TicketType } from "../../src/domain/value_objects.js";
import { composePrompt } from "../../src/app/prompt_composition.js";

function makeIssue(type: IssueType = "Feat"): Issue {
  return Issue.create({ title: "T", project: "demo", type,
    problem: "problema X", acceptance_criteria: "criterio Y" }, "claude-code");
}

function makeTicket(type: TicketType = "Implement", extra: Partial<{ references: string; artifacts: string }> = {}): Ticket {
  return Ticket.create({ issue_id: "iid", type, actor: "claude-code",
    objective: "obj Z", task: "tarefa W", acceptance_criteria: "crit T", ...extra });
}

test("com ticket: cabeçalho aponta o tipo e as seções vêm na ordem correta", () => {
  const text = composePrompt(makeIssue(), makeTicket());
  assert.match(text, /Ticket `Implement`/);
  const positions = ["sdlc-workflow", "## Issue", "## Ticket", "issues next --prompt"]
    .map((header) => text.indexOf(header));
  assert.ok(positions.every((pos) => pos >= 0), "todas as seções presentes");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "seções em ordem crescente");
});

test("sem ticket: cabeçalho de decomposição e sem seção Ticket", () => {
  const text = composePrompt(makeIssue());
  assert.match(text, /Issue sem Tickets/);
  assert.match(text, /sdlc-workflow/);
  assert.match(text, /## Issue/);
  assert.doesNotMatch(text, /## Ticket/);
});

test("ticket null é tratado como ausente", () => {
  const issue = makeIssue(); // a mesma Issue nos dois lados: ids diferentes tornariam a igualdade impossível
  assert.equal(composePrompt(issue, null), composePrompt(issue));
});

test("prompt é mínimo: sem catálogo de comandos nem instruções de fase (ficam nas skills)", () => {
  const text = composePrompt(makeIssue(), makeTicket());
  assert.doesNotMatch(text, /## Comandos/);
  assert.doesNotMatch(text, /## SDLC/);
  assert.doesNotMatch(text, /## Tipo d/);
  assert.match(text, /issues next --prompt/); // único comando: o loop
});

test("anexos ficam localizáveis ao agente: caminho em disco + URL; sem anexo, sem linha", () => {
  assert.doesNotMatch(composePrompt(makeIssue()), /Anexos/); // sem anexo → sem linha
  const att = Attachment.create({ filename: "erro.png", mediaType: "image/png", size: 10 });
  const issue = Issue.create({ title: "T", project: "de mo", type: "Feat",
    problem: "p", acceptance_criteria: "c", attachments: [att.toJSON()] }, "human");
  const ticket = Ticket.create({ issue_id: issue.id, type: "Implement", actor: "human",
    objective: "o", task: "t", acceptance_criteria: "c", attachments: [att.toJSON()] });
  const text = composePrompt(issue, ticket);
  assert.match(text, /- Anexos/);
  assert.match(text, /erro\.png/);
  assert.match(text, new RegExp(`projects/de%20mo/attachments/${att.id}\\.png`)); // projectSegment encoda espaço
  assert.match(text, new RegExp(`/api/attachments/${att.id}`));
});

test("cada TicketType aparece no cabeçalho e na seção Ticket", () => {
  for (const type of TICKET_TYPES) {
    const text = composePrompt(makeIssue(), makeTicket(type));
    assert.match(text, new RegExp(`Ticket \`${type}\``), `TicketType ${type}`);
    assert.ok(text.includes(`- Tipo: ${type}`), `TicketType ${type} na seção`);
  }
});

test("infos de Issue e Ticket presentes, incluindo ids para os comandos", () => {
  const issue = makeIssue();
  const ticket = makeTicket();
  const text = composePrompt(issue, ticket);
  for (const fragment of [`- Id: ${issue.id}`, `- Id: ${ticket.id}`,
    "- Problema: problema X", "- Critérios de aceitação: criterio Y",
    "- Tipo: Feat", "- Objetivo: obj Z", "- Tarefa: tarefa W", "- Status: OPEN", "- Tags: —"]) {
    assert.ok(text.includes(fragment), fragment);
  }
});

test("references/artifacts omitidos quando vazios, presentes quando existem", () => {
  const empty = composePrompt(makeIssue(), makeTicket());
  assert.doesNotMatch(empty, /- Referências:/);
  assert.doesNotMatch(empty, /- Artefatos:/);
  const filled = composePrompt(makeIssue(), makeTicket("Implement", { references: "ref A", artifacts: "art B" }));
  assert.match(filled, /- Referências: ref A/);
  assert.match(filled, /- Artefatos: art B/);
});

test("Tags preenchidas aparecem formatadas como key=value", () => {
  const issue = makeIssue();
  issue.tag({ complexity: "ALTA", risk: "BAIXO" }, "human");
  const text = composePrompt(issue);
  assert.match(text, /- Tags: complexity=ALTA, risk=BAIXO/);
});

test("determinismo: 2 chamadas iguais produzem saída idêntica", () => {
  const issue = makeIssue();
  const ticket = makeTicket();
  assert.equal(composePrompt(issue, ticket), composePrompt(issue, ticket));
});

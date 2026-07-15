import assert from "node:assert/strict";
import test from "node:test";
import { Attachment } from "../../src/domain/attachment_entity.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { Ticket } from "../../src/domain/ticket_entity.js";
import { ISSUE_TYPES, type IssueType, TICKET_TYPES, type TicketType } from "../../src/domain/value_objects.js";
import {
  composePrompt, ISSUE_TYPE_PROMPTS, TICKET_TYPE_PROMPTS,
} from "../../src/app/prompt_composition.js";

function makeIssue(type: IssueType = "Feat"): Issue {
  return Issue.create({ title: "T", project: "demo", type,
    problem: "problema X", acceptance_criteria: "criterio Y" }, "claude-code");
}

function makeTicket(type: TicketType = "Implement", extra: Partial<{ references: string; artifacts: string }> = {}): Ticket {
  return Ticket.create({ issue_id: "iid", type, actor: "claude-code",
    objective: "obj Z", task: "tarefa W", acceptance_criteria: "crit T", ...extra });
}

function order(text: string, ...headers: string[]): number[] {
  return headers.map((header) => text.indexOf(header));
}

test("com ticket: 5 seções na ordem correta", () => {
  const text = composePrompt(makeIssue(), makeTicket());
  const positions = order(text, "## SDLC", "## Tipo da Issue", "## Issue", "## Tipo do Ticket", "## Ticket");
  assert.ok(positions.every((pos) => pos >= 0), "todas as seções presentes");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "seções em ordem crescente");
});

test("sem ticket: omite seções 4 e 5", () => {
  const text = composePrompt(makeIssue());
  assert.match(text, /## SDLC/);
  assert.match(text, /## Tipo da Issue/);
  assert.match(text, /## Issue/);
  assert.doesNotMatch(text, /## Tipo do Ticket/);
  assert.doesNotMatch(text, /## Ticket/);
});

test("ticket null é tratado como ausente", () => {
  assert.equal(composePrompt(makeIssue(), null), composePrompt(makeIssue()));
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

test("cada IssueType injeta seu texto", () => {
  for (const type of ISSUE_TYPES) {
    assert.ok(composePrompt(makeIssue(type)).includes(ISSUE_TYPE_PROMPTS[type]), `IssueType ${type}`);
  }
});

test("cada TicketType injeta seu texto", () => {
  for (const type of TICKET_TYPES) {
    const text = composePrompt(makeIssue(), makeTicket(type));
    assert.ok(text.includes(TICKET_TYPE_PROMPTS[type]), `TicketType ${type}`);
  }
});

test("infos de Issue e Ticket presentes", () => {
  const text = composePrompt(makeIssue(), makeTicket());
  for (const fragment of ["- Problema: problema X", "- Critérios de aceitação: criterio Y",
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

test("catálogo de comandos injetado (com e sem ticket)", () => {
  for (const text of [composePrompt(makeIssue()), composePrompt(makeIssue(), makeTicket())]) {
    assert.match(text, /## Comandos/);
    assert.match(text, /issues next --prompt/);
    assert.match(text, /issues ticket status .*--last/);
  }
});

test("determinismo: 2 chamadas iguais produzem saída idêntica", () => {
  const issue = makeIssue();
  const ticket = makeTicket();
  assert.equal(composePrompt(issue, ticket), composePrompt(issue, ticket));
});

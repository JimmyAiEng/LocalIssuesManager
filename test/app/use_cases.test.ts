import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CreateIssueUseCase } from "../../src/app/create_issue_use_case.js";
import { DecideIssueUseCase } from "../../src/app/decide_issue_use_case.js";
import { GetIssueUseCase } from "../../src/app/get_issue_use_case.js";
import { ListIssuesUseCase } from "../../src/app/list_issues_use_case.js";
import { NextIssueUseCase } from "../../src/app/next_issue_use_case.js";
import { ResetClaimUseCase } from "../../src/app/reset_claim_use_case.js";
import { StatusIssueUseCase } from "../../src/app/status_issue_use_case.js";

const body = {
  project: "app",
  tag: "Implement" as const,
  problem: "p",
  artifacts: "a",
  acceptance_criteria: "c",
  actor: "human" as const,
};

const root = () => mkdtempSync(join(tmpdir(), "issues-test-"));

test("persiste por projeto/status e next respeita FIFO e filtro", () => {
  const dir = root();
  const create = new CreateIssueUseCase(dir);
  const older = create.execute({ ...body, title: "older", now: new Date("2026-01-01") });
  create.execute({ ...body, project: "other", title: "other", now: new Date("2025-01-01") });
  const newer = create.execute({ ...body, title: "newer", now: new Date("2026-01-02") });
  const claimed = new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" });
  assert.equal(claimed?.id, older.id);
  assert.equal(claimed?.owner, "pi");
  assert.equal(new NextIssueUseCase(dir).execute({ agent: "pi", project: "app" })?.id, newer.id);
  assert.ok(readFileSync(join(dir, "projects/app/claimed", `${older.id}.json`), "utf8"));
});

test("status, decisão, get e list executam fluxo completo", () => {
  const dir = root();
  const created = new CreateIssueUseCase(dir).execute({ ...body, title: "Search Me" });
  new NextIssueUseCase(dir).execute({ agent: "codex" });
  new StatusIssueUseCase(dir).execute({ id: created.id, agent: "codex", status: "AWAITING", comment: "feito" });
  new DecideIssueUseCase(dir).execute({ id: created.id, human: true, status: "CLOSED", comment: "ok", closed_reason: "concluido" });
  const full = new GetIssueUseCase(dir).execute(created.id);
  assert.equal(full.thread.at(-1)?.comment, "ok");
  const listed = new ListIssuesUseCase(dir).execute({ status: "CLOSED", title: "search" });
  assert.equal(listed.length, 1);
  assert.equal("comment" in listed[0].phases[0], false);
});

test("status cobre fechamentos e reset/decisão OPEN limpam o claim", () => {
  const dir = root();
  const create = new CreateIssueUseCase(dir);
  const machine = create.execute({ ...body, actor: "pi", title: "machine" });
  new StatusIssueUseCase(dir).execute({ id: machine.id, agent: "pi", status: "CLOSED",
    comment: "inválida", closed_reason: "errado" });
  assert.equal(new GetIssueUseCase(dir).execute(machine.id).status, "CLOSED");

  const reset = create.execute({ ...body, project: "reset-project", title: "reset" });
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "reset-project" });
  const reopened = new ResetClaimUseCase(dir).execute({ id: reset.id, human: true, comment: "liberar" });
  assert.equal(reopened.owner, null);
  assert.equal(reopened.claimed_at, null);

  const rejected = create.execute({ ...body, project: "reject-project", actor: "pi", title: "reject" });
  new NextIssueUseCase(dir).execute({ agent: "codex", project: "reject-project" });
  new StatusIssueUseCase(dir).execute({ id: rejected.id, agent: "codex", status: "AWAITING", comment: "feito" });
  const open = new DecideIssueUseCase(dir).execute({ id: rejected.id, human: true, status: "OPEN", comment: "corrigir" });
  assert.equal(open.owner, null);
  assert.equal(open.claimed_at, null);

  const human = create.execute({ ...body, title: "human close" });
  new StatusIssueUseCase(dir).execute({ id: human.id, human: true, status: "CLOSED",
    comment: "cancelar", closed_reason: "obsoleto" });
  assert.equal(new GetIssueUseCase(dir).execute(human.id).status, "CLOSED");
});

test("operações humanas rejeitam chamadas sem autorização", () => {
  const dir = root();
  const create = new CreateIssueUseCase(dir);

  const decision = create.execute({ ...body, actor: "pi", title: "decision", project: "decision" });
  new NextIssueUseCase(dir).execute({ agent: "pi", project: "decision" });
  new StatusIssueUseCase(dir).execute({ id: decision.id, agent: "pi", status: "AWAITING", comment: "done" });
  assert.throws(
    () => new DecideIssueUseCase(dir).execute({ id: decision.id, human: false, status: "CLOSED", comment: "ok", closed_reason: "concluido" }),
    /Decide requires --human/,
  );
  assert.equal(new GetIssueUseCase(dir).execute(decision.id).status, "AWAITING");

  const reset = create.execute({ ...body, actor: "pi", title: "reset auth", project: "reset-auth" });
  new NextIssueUseCase(dir).execute({ agent: "codex", project: "reset-auth" });
  assert.throws(
    () => new ResetClaimUseCase(dir).execute({ id: reset.id, human: false, comment: "release" }),
    /Reset requires --human/,
  );
  assert.equal(new GetIssueUseCase(dir).execute(reset.id).owner, "codex");
});

test("status rejeita combinações de ator e transições incompletas", () => {
  const dir = root();
  const create = new CreateIssueUseCase(dir);
  const both = create.execute({ ...body, title: "both" });
  assert.throws(
    () => new StatusIssueUseCase(dir).execute({ id: both.id, human: true, agent: "pi", status: "CLOSED", comment: "x", closed_reason: "errado" }),
    /Choose --human or --agent/,
  );

  const agent = create.execute({ ...body, actor: "pi", title: "agent" });
  assert.throws(
    () => new StatusIssueUseCase(dir).execute({ id: agent.id, agent: "pi", status: "CLOSED", comment: "x" }),
    /IA status supports AWAITING or CLOSED with reason/,
  );
  assert.throws(
    () => new StatusIssueUseCase(dir).execute({ id: agent.id, agent: "pi", status: "INVALID", comment: "x", closed_reason: "errado" }),
    /IA status supports AWAITING or CLOSED with reason/,
  );
  assert.throws(
    () => new StatusIssueUseCase(dir).execute({ id: agent.id, human: true, status: "AWAITING", comment: "x", closed_reason: "errado" }),
    /Human status supports CLOSED with reason/,
  );
  assert.equal(new GetIssueUseCase(dir).execute(agent.id).status, "OPEN");
});

test("list combina filtros e paginação", () => {
  const dir = root();
  const create = new CreateIssueUseCase(dir);
  create.execute({ ...body, title: "Needle old", now: new Date("2026-01-01") });
  create.execute({ ...body, title: "Needle middle", now: new Date("2026-01-02") });
  create.execute({ ...body, title: "Needle new", now: new Date("2026-01-03") });
  create.execute({ ...body, project: "other", title: "Needle other" });
  create.execute({ ...body, title: "unrelated" });

  const list = new ListIssuesUseCase(dir);
  const filtered = list.execute({ project: "app", status: "OPEN", title: "needle" });
  assert.deepEqual(filtered.map((issue) => issue.title).sort(), ["Needle middle", "Needle new", "Needle old"]);
  assert.deepEqual(
    list.execute({ project: "app", status: "OPEN", title: "needle", offset: 1, limit: 1 }).map((issue) => issue.id),
    [filtered[1].id],
  );
  assert.deepEqual(
    list.execute({ project: "app", status: "OPEN", title: "needle", offset: 1 }).map((issue) => issue.id),
    filtered.slice(1).map((issue) => issue.id),
  );
});

test("erros não persistem mutação parcial", () => {
  const dir = root();
  const issue = new CreateIssueUseCase(dir).execute({ ...body, title: "safe" });
  assert.throws(() => new StatusIssueUseCase(dir).execute({ id: issue.id, agent: "pi", status: "AWAITING", comment: "x" }));
  assert.equal(new GetIssueUseCase(dir).execute(issue.id).status, "OPEN");
  assert.equal(new NextIssueUseCase(dir).execute({ agent: "pi", project: "missing" }), null);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addWorktree, createIssue, getIssue, removeWorktree } from "../../src/app/issue_use_cases.js";

test("worktree add cria a worktree e grava o path; remove limpa", () => {
  const repo = mkdtempSync(join(tmpdir(), "wt-repo-"));
  const root = mkdtempSync(join(tmpdir(), "wt-store-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
  git("init", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("commit", "--allow-empty", "-m", "init");

  const issue = createIssue({ title: "wt", project: "app", type: "Feat", problem: "p", actor: "human" }, root);

  const added = addWorktree({ issueId: issue.id, cwd: repo }, root);
  assert.ok(added.worktree, "worktree gravada na Issue");
  assert.equal(added.worktree!.branch, `issue/${issue.id.slice(0, 8)}`);
  assert.ok(existsSync(added.worktree!.path), "diretório da worktree existe");

  // idempotente: segunda chamada devolve a mesma worktree sem recriar
  const again = addWorktree({ issueId: issue.id, cwd: repo }, root);
  assert.equal(again.worktree!.path, added.worktree!.path);

  const removed = removeWorktree({ issueId: issue.id, cwd: repo }, root);
  assert.equal(removed.worktree, null, "campo limpo após remove");
  assert.ok(!existsSync(added.worktree!.path), "diretório removido");

  // persistido em disco
  assert.equal(getIssue(issue.id, root).worktree, null);
});

test("removeWorktree propaga erro claro quando o git falha (worktree já removida por fora)", () => {
  const repo = mkdtempSync(join(tmpdir(), "wt-repo-fail-"));
  const root = mkdtempSync(join(tmpdir(), "wt-store-fail-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
  git("init", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("commit", "--allow-empty", "-m", "init");

  const issue = createIssue({ title: "wt-fail", project: "app", type: "Feat", problem: "p", actor: "human" }, root);
  const added = addWorktree({ issueId: issue.id, cwd: repo }, root);
  // remove a worktree por fora (git), deixando a Issue com um worktree.path que o git não reconhece mais
  execFileSync("git", ["worktree", "remove", added.worktree!.path, "--force"], { cwd: repo });

  assert.throws(
    () => removeWorktree({ issueId: issue.id, cwd: repo }, root),
    (error: unknown) => error instanceof Error && /git worktree remove .* falhou:/.test(error.message),
  );
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CreateIssueUseCase } from "../../src/app/create_issue_use_case.js";
import { GetIssueUseCase } from "../../src/app/get_issue_use_case.js";
import { WorktreeUseCase } from "../../src/app/worktree_use_case.js";

test("worktree add cria a worktree e grava o path; remove limpa", () => {
  const repo = mkdtempSync(join(tmpdir(), "wt-repo-"));
  const root = mkdtempSync(join(tmpdir(), "wt-store-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
  git("init", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("commit", "--allow-empty", "-m", "init");

  const issue = new CreateIssueUseCase(root).execute({ title: "wt", project: "app", type: "Feat", problem: "p", actor: "human" });

  const added = new WorktreeUseCase(root).add({ issueId: issue.id, cwd: repo });
  assert.ok(added.worktree, "worktree gravada na Issue");
  assert.equal(added.worktree!.branch, `issue/${issue.id.slice(0, 8)}`);
  assert.ok(existsSync(added.worktree!.path), "diretório da worktree existe");

  // idempotente: segunda chamada devolve a mesma worktree sem recriar
  const again = new WorktreeUseCase(root).add({ issueId: issue.id, cwd: repo });
  assert.equal(again.worktree!.path, added.worktree!.path);

  const removed = new WorktreeUseCase(root).remove({ issueId: issue.id, cwd: repo });
  assert.equal(removed.worktree, null, "campo limpo após remove");
  assert.ok(!existsSync(added.worktree!.path), "diretório removido");

  // persistido em disco
  assert.equal(new GetIssueUseCase(root).execute(issue.id).worktree, null);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createIssue, getIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { addWorktree, removeWorktree } from "../../src/app/services/use_cases/worktree_use_cases.js";

function gitRepo(prefix: string): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
  git("init", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("commit", "--allow-empty", "-m", "init");
  return repo;
}

function setup(prefix: string): { repo: string; root: string; issueId: string } {
  const repo = gitRepo(prefix);
  const root = mkdtempSync(join(tmpdir(), "wt-store-"));
  createProject({ name: "app", repo }, root);
  const issue = createIssue({ title: "wt", project: "app", type: "Feat", action: "Implement", problem: "p", actor: "human" }, root);
  return { repo, root, issueId: issue.id };
}

test("worktree add usa o repo do projeto registrado, grava o path e remove limpa", () => {
  const { root, issueId } = setup("wt-repo-");

  const added = addWorktree({ issueId }, root); // sem cwd: resolve pelo project.json
  assert.ok(added.worktree, "worktree gravada na Issue");
  assert.equal(added.worktree!.branch, `issue/${issueId.slice(0, 8)}`);
  assert.ok(existsSync(added.worktree!.path), "diretório da worktree existe");

  // idempotente: segunda chamada devolve a mesma worktree sem recriar
  const again = addWorktree({ issueId }, root);
  assert.equal(again.worktree!.path, added.worktree!.path);

  const removed = removeWorktree({ issueId }, root);
  assert.equal(removed.worktree, null, "campo limpo após remove");
  assert.ok(!existsSync(added.worktree!.path), "diretório removido");
  assert.equal(removeWorktree({ issueId }, root).worktree, null); // idempotente

  // persistido em disco
  assert.equal(getIssue(issueId, root).worktree, null);
});

test("removeWorktree propaga erro claro quando o git falha (worktree já removida por fora)", () => {
  const { repo, root, issueId } = setup("wt-repo-fail-");
  const added = addWorktree({ issueId, cwd: repo }, root);
  // remove a worktree por fora (git), deixando a Issue com um worktree.path que o git não reconhece mais
  execFileSync("git", ["worktree", "remove", added.worktree!.path, "--force"], { cwd: repo });

  assert.throws(
    () => removeWorktree({ issueId, cwd: repo }, root),
    (error: unknown) => error instanceof Error && /git worktree remove .* falhou:/.test(error.message),
  );
});

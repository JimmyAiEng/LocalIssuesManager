import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";

export type WorktreeInput = { issueId: string; path?: string; cwd?: string };

// Cria (ou devolve) a worktree da Issue no repositório do projeto registrado.
// Idempotente: se já houver worktree, devolve sem tocar no git.
export function addWorktree(input: WorktreeInput, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  if (issue.worktree) return issue;
  const cwd = repoFor(queue, issue, input.cwd);
  const path = resolve(cwd, input.path ?? join(".worktrees", issue.id));
  const branch = `issue/${issue.id.slice(0, 8)}`;
  git(cwd, ["worktree", "add", path, "-b", branch]);
  issue.setWorktree({ path, branch });
  queue.save(issue);
  return issue;
}

// Remove a worktree e limpa o campo. Idempotente: sem worktree, não faz nada.
export function removeWorktree(input: WorktreeInput, root?: string): Issue {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  if (!issue.worktree) return issue;
  git(repoFor(queue, issue, input.cwd), ["worktree", "remove", issue.worktree.path, "--force"]);
  issue.clearWorktree();
  queue.save(issue);
  return issue;
}

// O git roda no repositório do projeto registrado; --cwd (ou o processo) é fallback legado.
function repoFor(queue: Queue, issue: Issue, cwd?: string): string {
  return cwd ?? queue.readProject(issue.project)?.repo ?? process.cwd();
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new DomainError(`git ${args.join(" ")} falhou: ${result.stderr?.trim() || result.error?.message || "erro"}`);
  }
}

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { DomainError } from "../domain/domain_error.js";
import type { Issue } from "../domain/issue_entity.js";
import { Queue } from "../domain/queue_repository.js";
import { loadRequiredIssue } from "./required_issue.js";

export type WorktreeInput = { issueId: string; path?: string; cwd?: string };

export class WorktreeUseCase {
  private readonly queue: Queue;
  constructor(root?: string) { this.queue = new Queue(root); }

  // Cria (ou devolve) a worktree da Issue. Idempotente: se já houver worktree, devolve sem tocar no git.
  add(input: WorktreeInput): Issue {
    const issue = loadRequiredIssue(this.queue, input.issueId);
    if (issue.worktree) return issue;
    const cwd = input.cwd ?? process.cwd();
    const path = resolve(cwd, input.path ?? join(".worktrees", issue.id));
    const branch = `issue/${issue.id.slice(0, 8)}`;
    this.#git(cwd, ["worktree", "add", path, "-b", branch]);
    issue.setWorktree({ path, branch });
    this.queue.save(issue);
    return issue;
  }

  // Remove a worktree e limpa o campo. Idempotente: sem worktree, não faz nada.
  remove(input: WorktreeInput): Issue {
    const issue = loadRequiredIssue(this.queue, input.issueId);
    if (!issue.worktree) return issue;
    const cwd = input.cwd ?? process.cwd();
    this.#git(cwd, ["worktree", "remove", issue.worktree.path, "--force"]);
    issue.clearWorktree();
    this.queue.save(issue);
    return issue;
  }

  #git(cwd: string, args: string[]): void {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) {
      throw new DomainError(`git ${args.join(" ")} falhou: ${result.stderr?.trim() || result.error?.message || "erro"}`);
    }
  }
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createIssue, getIssue, nextIssue, statusIssue } from "../../src/app/services/use_cases/issue_use_cases.js";
import { createProject } from "../../src/app/services/use_cases/project_use_cases.js";
import { addWorktree } from "../../src/app/services/use_cases/worktree_use_cases.js";

// Repo git real com um commit inicial; a worktree da Issue forka daqui.
function gitRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "tdd-repo-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
  git("init", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("commit", "--allow-empty", "-m", "init");
  return repo;
}

async function setup(): Promise<{ root: string; repo: string; wt: string; git: (...a: string[]) => void }> {
  const repo = gitRepo();
  const root = mkdtempSync(join(tmpdir(), "tdd-store-"));
  createProject({ name: "app", repo, testPaths: ["test/", "**/*.test.ts"] }, root);
  const issue = createIssue({ title: "impl", project: "app", type: "Feat", action: "Implement", problem: "p", actor: "human" }, root);
  nextIssue({ agent: "pi", project: "app" }, root);
  const added = addWorktree({ issueId: issue.id }, root);
  const wt = added.worktree!.path;
  const git = (...args: string[]) => { execFileSync("git", args, { cwd: wt }); };
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  return { root, repo, wt, git };
}

async function commitFiles(wt: string, git: (...a: string[]) => void, message: string, files: string[]): Promise<void> {
  for (const rel of files) {
    await mkdir(join(wt, rel, ".."), { recursive: true });
    writeFileSync(join(wt, rel), `// ${rel}\n`);
  }
  git("add", "-A");
  git("commit", "-m", message);
}

function close(root: string, id: string): Promise<unknown> {
  return statusIssue({ id, agent: "pi", status: "CLOSED", comment: "feito", closed_reason: "concluido" }, root);
}

test("TDD e2e: worktree vazia (sem commits) passa o gate mesmo com testPaths configurado", async () => {
  const { root } = await setup();
  const id = await firstImpl(root);
  await close(root, id); // não deve lançar: sem código de produção, enforcement não dispara
  assert.equal(getIssue(id, root).status, "CLOSED");
});

test("TDD e2e: primeiro commit misturando src e test é bloqueado citando o commit", async () => {
  const { root, wt, git } = await setup();
  const id = await firstImpl(root);
  await commitFiles(wt, git, "feat: tudo junto", ["src/x.ts", "test/x.test.ts"]);
  await assert.rejects(close(root, id), /TDD: o commit \w+ "feat: tudo junto" toca código de produção/);
  assert.equal(getIssue(id, root).status, "CLAIMED");
});

test("TDD e2e: commit só-de-testes seguido de produção passa o gate", async () => {
  const { root, wt, git } = await setup();
  const id = await firstImpl(root);
  await commitFiles(wt, git, "test: casos", ["test/x.test.ts"]);
  await commitFiles(wt, git, "feat: impl", ["src/x.ts"]);
  await close(root, id);
  assert.equal(getIssue(id, root).status, "CLOSED");
});

// A Issue Implement recém-criada e reivindicada é a única CLAIMED do root.
async function firstImpl(root: string): Promise<string> {
  const { Queue } = await import("../../src/domain/queue_repository.js");
  return new Queue(root).list({ status: "CLAIMED" })[0]!.id;
}

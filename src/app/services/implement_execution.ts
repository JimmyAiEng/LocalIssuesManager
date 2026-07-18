import { spawnSync } from "node:child_process";
import { DomainError } from "../../domain/domain_error.js";
import type { CheckFailure } from "./project_checks.js";

// Commit da worktree para o enforcement de TDD: sha, assunto e arquivos tocados.
export type Commit = { sha: string; subject: string; files: string[] };

// Roteamento da falha do check: mutation reprovada = mutantes sobreviveram (testes fracos) e a
// correção volta ao Test Coding, não ao código. Demais etapas apontam para o código.
export function checkFailureMessage(failure: CheckFailure): string {
  if (failure.step === "check") {
    return `Check do projeto falhou (${failure.command}); corrija na worktree e tente concluir de novo.\n${failure.output}`;
  }
  if (failure.step === "mutation") {
    return `Check "mutation" falhou (${failure.command}); mutantes sobreviveram: os testes estão fracos. Reforce/reescreva os testes (volte ao Test Coding), não o código de produção.\n${failure.output}`;
  }
  return `Check "${failure.step}" falhou (${failure.command}); corrija o código na worktree e tente concluir de novo.\n${failure.output}`;
}

// ponytail: matcher mínimo de globs — 'dir/' = prefixo, '*sufixo' = sufixo (parte após o último *),
// senão igualdade. Cobre testPaths tipo ['test/', '**/*.test.ts']; glob completo é YAGNI.
export function matchesTestPath(path: string, pattern: string): boolean {
  if (pattern.endsWith("/")) return path.startsWith(pattern);
  if (pattern.includes("*")) return path.endsWith(pattern.slice(pattern.lastIndexOf("*") + 1));
  return path === pattern;
}

// Enforcement de TDD (função pura, testável sem git): dados os commits em ordem cronológica
// (mais antigo primeiro), o PRIMEIRO commit que toca ≥1 arquivo de produção (fora de testPaths)
// precisa ser precedido por ≥1 commit só-de-testes. Devolve o commit infrator ou null.
// Sem commit de produção (worktree vazia) = null: o gate não dispara.
export function tddViolation(commits: Commit[], testPaths: string[]): Commit | null {
  const isTest = (file: string): boolean => testPaths.some((pattern) => matchesTestPath(file, pattern));
  const testOnly = (commit: Commit): boolean => commit.files.length > 0 && commit.files.every(isTest);
  const touchesProd = (commit: Commit): boolean => commit.files.some((file) => !isTest(file));
  const firstProd = commits.findIndex(touchesProd);
  if (firstProd === -1) return null;
  return commits.slice(0, firstProd).some(testOnly) ? null : commits[firstProd];
}

// Coleta e verifica a ordem TDD na worktree real. Só o gate de Implement chama, e só quando o
// projeto configurou testPaths (opt-in). Worktree sem commits novos → sem infração → passa.
export function requireTddOrder(repo: string, worktreePath: string, testPaths: string[]): void {
  const bad = tddViolation(worktreeCommits(repo, worktreePath), testPaths);
  if (!bad) return;
  throw new DomainError(`TDD: o commit ${bad.sha.slice(0, 8)} "${bad.subject}" toca código de produção sem um commit só-de-testes antes dele. Escreva e commite os testes primeiro (Test Coding), depois o código de produção.`);
}

// base = merge-base entre a branch em que o repo está (ponto de fork da worktree) e o HEAD da
// worktree. Sem base (git falhou) tratamos como worktree vazia — o enforcement é opt-in e não deve
// derrubar o fluxo por um git indisponível.
function worktreeCommits(repo: string, worktreePath: string): Commit[] {
  const branch = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === null) return [];
  const base = git(worktreePath, ["merge-base", branch.trim(), "HEAD"]);
  if (base === null) return [];
  const log = git(worktreePath, ["log", "--reverse", `--format=%H${US}%s`, "--name-only", `${base.trim()}..HEAD`]);
  return log === null ? [] : parseLog(log);
}

// git log --name-only com header %H\x1f%s por commit: a linha com o separador abre um commit, as
// demais linhas não-vazias são arquivos do commit corrente. Robusto ao layout de linhas em branco.
function parseLog(out: string): Commit[] {
  const commits: Commit[] = [];
  for (const line of out.split("\n")) {
    const sep = line.indexOf(US);
    if (sep !== -1) commits.push({ sha: line.slice(0, sep), subject: line.slice(sep + 1), files: [] });
    else if (line.trim() && commits.length) commits[commits.length - 1]!.files.push(line.trim());
  }
  return commits;
}

const US = "\x1f";

function git(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

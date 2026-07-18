import assert from "node:assert/strict";
import test from "node:test";
import { type Commit, checkFailureMessage, matchesTestPath, tddViolation } from "../../src/app/implement_gate.js";

const TEST_PATHS = ["test/", "**/*.test.ts"];
const commit = (sha: string, subject: string, files: string[]): Commit => ({ sha, subject, files });

test("matchesTestPath: prefixo de diretório, sufixo com * e igualdade exata", () => {
  assert.equal(matchesTestPath("test/foo.ts", "test/"), true); // prefixo
  assert.equal(matchesTestPath("src/app/x.ts", "test/"), false);
  assert.equal(matchesTestPath("src/app/x.test.ts", "**/*.test.ts"), true); // sufixo (após o último *)
  assert.equal(matchesTestPath("src/app/x.ts", "**/*.test.ts"), false);
  assert.equal(matchesTestPath("Makefile", "Makefile"), true); // igualdade
});

test("tddViolation: primeiro commit misturando src e test é bloqueado citando o commit (critério 1)", () => {
  const commits = [commit("aaaaaaaa", "feat: tudo junto", ["src/app/x.ts", "test/x.test.ts"])];
  const bad = tddViolation(commits, TEST_PATHS);
  assert.equal(bad?.sha, "aaaaaaaa");
  assert.equal(bad?.subject, "feat: tudo junto");
});

test("tddViolation: commit só-de-testes seguido de commits de produção passa (critério 2)", () => {
  const commits = [
    commit("11111111", "test: casos", ["test/x.test.ts", "src/app/x.test.ts"]),
    commit("22222222", "feat: impl", ["src/app/x.ts"]),
    commit("33333333", "feat: mais", ["src/app/y.ts", "test/y.test.ts"]),
  ];
  assert.equal(tddViolation(commits, TEST_PATHS), null);
});

test("tddViolation: sem commit de produção (worktree vazia ou só testes) não dispara", () => {
  assert.equal(tddViolation([], TEST_PATHS), null); // worktree sem commits
  assert.equal(tddViolation([commit("aa", "test", ["test/x.test.ts"])], TEST_PATHS), null); // só testes
});

test("tddViolation: commit de produção sem teste antes viola mesmo com teste depois", () => {
  const commits = [
    commit("aaaaaaaa", "feat: código primeiro", ["src/app/x.ts"]),
    commit("bbbbbbbb", "test: tarde demais", ["test/x.test.ts"]),
  ];
  assert.equal(tddViolation(commits, TEST_PATHS)?.sha, "aaaaaaaa");
});

test("checkFailureMessage: mutation orienta reforçar os testes; demais apontam o código", () => {
  assert.match(checkFailureMessage({ step: "mutation", command: "m", output: "o" }), /Test Coding/);
  assert.match(checkFailureMessage({ step: "unit", command: "u", output: "o" }), /corrija o código/);
  assert.match(checkFailureMessage({ step: "check", command: "c", output: "o" }), /Check do projeto falhou/);
});

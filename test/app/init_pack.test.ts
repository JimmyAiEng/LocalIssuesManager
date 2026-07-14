import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { InitPackUseCase } from "../../src/app/init_pack_use_case.js";

const target = () => mkdtempSync(join(tmpdir(), "issues-init-"));

test("init instala AGENTS.md versionado, skills e wiring de todos os harnesses", () => {
  const directory = target();
  const result = new InitPackUseCase().execute({ target: directory });

  const agents = readFileSync(join(directory, "AGENTS.md"), "utf8");
  assert.ok(agents.startsWith(`<!-- issues-local pack v${result.pack_version} -->`));
  assert.ok(agents.includes("sdlc-workflow"));
  assert.ok(existsSync(join(directory, ".agents", "skills", "sdlc-workflow", "SKILL.md")));
  assert.ok(existsSync(join(directory, ".agents", "skills", "planning-phase", "SKILL.md")));
  assert.equal(existsSync(join(directory, ".agents", "skills", "README.md")), false);
  assert.equal(existsSync(join(directory, ".agents", "skills", "INSTALL.md")), false);
  assert.ok(existsSync(join(directory, ".claude", "skills", "sdlc-workflow", "SKILL.md")));
  assert.ok(existsSync(join(directory, ".cursor", "skills", "sdlc-workflow", "SKILL.md")));
  assert.equal(readFileSync(join(directory, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
  assert.ok(result.installed.length >= 4);
});

test("init re-executado atualiza AGENTS.md gerenciado sem exigir --force", () => {
  const directory = target();
  const first = new InitPackUseCase().execute({ target: directory });
  const again = new InitPackUseCase().execute({ target: directory });
  assert.equal(again.pack_version, first.pack_version);
  assert.ok(again.notes.some((note) => note.includes("já existe")));
});

test("init recusa sobrescrever AGENTS.md alheio sem --force", () => {
  const directory = target();
  writeFileSync(join(directory, "AGENTS.md"), "# meu arquivo\n");
  assert.throws(() => new InitPackUseCase().execute({ target: directory }), /--force/);
  new InitPackUseCase().execute({ target: directory, force: true });
  assert.ok(readFileSync(join(directory, "AGENTS.md"), "utf8").startsWith("<!-- issues-local pack"));
});

test("init preserva CLAUDE.md existente e apenas sugere o include", () => {
  const directory = target();
  writeFileSync(join(directory, "CLAUDE.md"), "# regras minhas\n");
  const result = new InitPackUseCase().execute({ target: directory, harness: "claude-code" });
  assert.equal(readFileSync(join(directory, "CLAUDE.md"), "utf8"), "# regras minhas\n");
  assert.ok(result.notes.some((note) => note.includes("@AGENTS.md")));
});

test("init instala só o harness pedido e rejeita harness desconhecido", () => {
  const directory = target();
  new InitPackUseCase().execute({ target: directory, harness: "codex" });
  assert.equal(existsSync(join(directory, ".claude")), false);
  assert.equal(existsSync(join(directory, ".cursor")), false);
  assert.ok(existsSync(join(directory, ".agents", "skills")));
  assert.throws(() => new InitPackUseCase().execute({ target: target(), harness: "vscode" }), /--harness/);
});

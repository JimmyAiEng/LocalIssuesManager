import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initPack, linkPackSkillsForDogfood } from "../../src/app/services/use_cases/init_pack_use_case.js";

const target = () => mkdtempSync(join(tmpdir(), "issues-init-"));
const POINTER =
  "Sempre leia a skill `sdlc-workflow` quando estiver trabalhando com issues-local ou caso o usuário exigir a execução de algum CLI `issues {comando}`.";

test("init cria AGENTS.md com o ponteiro, skills e wiring de todos os harnesses", () => {
  const directory = target();
  const result = initPack({ target: directory });

  const agents = readFileSync(join(directory, "AGENTS.md"), "utf8");
  assert.equal(agents, `${POINTER}\n`);
  assert.ok(existsSync(join(directory, ".agents", "skills", "sdlc-workflow", "SKILL.md")));
  assert.ok(existsSync(join(directory, ".agents", "skills", "planning-phase", "SKILL.md")));
  assert.equal(existsSync(join(directory, ".agents", "skills", "README.md")), false);
  assert.equal(existsSync(join(directory, ".agents", "skills", "INSTALL.md")), false);
  assert.ok(existsSync(join(directory, ".claude", "skills", "sdlc-workflow", "SKILL.md")));
  assert.ok(existsSync(join(directory, ".cursor", "skills", "sdlc-workflow", "SKILL.md")));
  assert.ok(existsSync(join(directory, ".pi", "skills", "sdlc-workflow", "SKILL.md")));
  assert.ok(existsSync(join(directory, ".codex", "skills", "sdlc-workflow", "SKILL.md")));
  assert.equal(readFileSync(join(directory, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
  assert.ok(result.installed.length >= 4);
});

test("init re-executado não duplica o ponteiro no AGENTS.md", () => {
  const directory = target();
  initPack({ target: directory });
  const again = initPack({ target: directory });
  assert.equal(readFileSync(join(directory, "AGENTS.md"), "utf8"), `${POINTER}\n`);
  assert.ok(again.notes.some((note) => note.includes("já referencia sdlc-workflow")));
});

test("init acrescenta o ponteiro em AGENTS.md existente sem sobrescrever", () => {
  const directory = target();
  writeFileSync(join(directory, "AGENTS.md"), "# meu arquivo\n");
  const result = initPack({ target: directory });
  assert.equal(readFileSync(join(directory, "AGENTS.md"), "utf8"), `# meu arquivo\n\n${POINTER}\n`);
  assert.ok(result.notes.some((note) => note.includes("acrescentado")));
});

test("init --force sobrescreve AGENTS.md pelo ponteiro do pack", () => {
  const directory = target();
  writeFileSync(join(directory, "AGENTS.md"), "# meu arquivo\n");
  initPack({ target: directory, force: true });
  assert.equal(readFileSync(join(directory, "AGENTS.md"), "utf8"), `${POINTER}\n`);
});

test("init acrescenta newline quando o AGENTS.md existente não termina em \\n", () => {
  const directory = target();
  writeFileSync(join(directory, "AGENTS.md"), "# sem quebra de linha final");
  initPack({ target: directory });
  assert.equal(readFileSync(join(directory, "AGENTS.md"), "utf8"), `# sem quebra de linha final\n\n${POINTER}\n`);
});

test("init preserva CLAUDE.md existente e apenas sugere o include", () => {
  const directory = target();
  writeFileSync(join(directory, "CLAUDE.md"), "# regras minhas\n");
  const result = initPack({ target: directory, harness: "claude-code" });
  assert.equal(readFileSync(join(directory, "CLAUDE.md"), "utf8"), "# regras minhas\n");
  assert.ok(result.notes.some((note) => note.includes("@AGENTS.md")));
});

test("init instala só o harness pedido e rejeita harness desconhecido", () => {
  const directory = target();
  initPack({ target: directory, harness: "codex" });
  assert.equal(existsSync(join(directory, ".claude")), false);
  assert.equal(existsSync(join(directory, ".cursor")), false);
  assert.ok(existsSync(join(directory, ".agents", "skills")));
  assert.ok(existsSync(join(directory, ".codex", "skills", "sdlc-workflow", "SKILL.md")));
  assert.throws(() => initPack({ target: target(), harness: "vscode" }), /--harness/);
});

test("init --harness pi cria .pi/skills apontando para .agents/skills", () => {
  const directory = target();
  initPack({ target: directory, harness: "pi" });
  const link = join(directory, ".pi", "skills");
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(readlinkSync(link).replace(/\\/g, "/"), "../.agents/skills");
});

test("linkPackSkillsForDogfood liga skills/ aos paths dos harnesses sem copiar", () => {
  const directory = target();
  mkdirSync(join(directory, "skills", "sdlc-workflow"), { recursive: true });
  writeFileSync(join(directory, "skills", "sdlc-workflow", "SKILL.md"), "---\nname: sdlc-workflow\ndescription: x\n---\n");
  writeFileSync(join(directory, "AGENTS.md"), "# pack\n");
  writeFileSync(join(directory, "package.json"), "{\"version\":\"0.0.0\"}\n");

  const linked = linkPackSkillsForDogfood(directory);
  assert.ok(linked.length >= 1);
  assert.ok(lstatSync(join(directory, ".agents", "skills")).isSymbolicLink());
  assert.equal(readlinkSync(join(directory, ".agents", "skills")).replace(/\\/g, "/"), "../skills");
  assert.ok(existsSync(join(directory, ".cursor", "skills", "sdlc-workflow", "SKILL.md")));
  assert.ok(existsSync(join(directory, ".pi", "skills", "sdlc-workflow", "SKILL.md")));
});

test("linkPackSkillsForDogfood é idempotente: 2ª chamada não recria os links já corretos", () => {
  const directory = target();
  mkdirSync(join(directory, "skills", "sdlc-workflow"), { recursive: true });
  writeFileSync(join(directory, "skills", "sdlc-workflow", "SKILL.md"), "---\nname: sdlc-workflow\ndescription: x\n---\n");
  writeFileSync(join(directory, "AGENTS.md"), "# pack\n");
  writeFileSync(join(directory, "package.json"), "{\"version\":\"0.0.0\"}\n");

  linkPackSkillsForDogfood(directory);
  const again = linkPackSkillsForDogfood(directory); // links já apontam certo -> isExpectedLink() no-op
  assert.deepEqual(again, []);
  assert.ok(existsSync(join(directory, ".claude", "skills", "sdlc-workflow", "SKILL.md")));
});

test("init: harness/skills já existente como diretório real (não symlink do pack) é preservado", () => {
  const directory = target();
  mkdirSync(join(directory, ".codex", "skills"), { recursive: true });
  writeFileSync(join(directory, ".codex", "skills", "meu-arquivo.txt"), "conteúdo local");
  const result = initPack({ target: directory, harness: "codex" });
  assert.equal(lstatSync(join(directory, ".codex", "skills")).isSymbolicLink(), false);
  assert.equal(readFileSync(join(directory, ".codex", "skills", "meu-arquivo.txt"), "utf8"), "conteúdo local");
  assert.ok(result.notes.some((note) => note.includes("não é o link do pack; mantido")));
});

test("linkSkills: symlinkSync sem permissão cai no catch (fallback de cópia, que também falha aqui)", () => {
  const directory = target();
  mkdirSync(join(directory, ".codex"), { recursive: true });
  chmodSync(join(directory, ".codex"), 0o555); // sem permissão de escrita: nem symlink nem cópia entram
  try {
    assert.throws(
      () => initPack({ target: directory, harness: "codex" }),
      (error: unknown) => error instanceof Error && (error as NodeJS.ErrnoException).code === "EACCES",
    );
  } finally {
    chmodSync(join(directory, ".codex"), 0o755); // restaura para limpeza do diretório temporário
  }
});

test("installSkills detecta dogfood (target já é o packRoot) e pula a cópia", () => {
  const directory = target();
  mkdirSync(join(directory, "skills", "sdlc-workflow"), { recursive: true });
  writeFileSync(join(directory, "skills", "sdlc-workflow", "SKILL.md"), "---\nname: sdlc-workflow\ndescription: x\n---\n");
  writeFileSync(join(directory, "AGENTS.md"), "# pack\n");
  mkdirSync(join(directory, ".agents"), { recursive: true });
  symlinkSync(join("..", "skills"), join(directory, ".agents", "skills")); // .agents/skills já aponta pro próprio skills/

  const result = initPack({ target: directory, harness: "codex" }, directory); // packRoot === target
  assert.ok(result.notes.some((note) => note.includes("dogfood); cópia pulada")));
  assert.ok(existsSync(join(directory, ".codex", "skills", "sdlc-workflow", "SKILL.md")));
});

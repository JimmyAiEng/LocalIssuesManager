import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const bin = resolve("bin/issues");

// Abridor de navegador falso: registra a URL recebida num arquivo em vez de abrir o SO.
// Substitui xdg-open/open via PATH para reproduzir E2E sem abrir uma aba de verdade;
// ISSUES_ROOT isolado evita que o purgeClosed do arranque toque o store real do usuário.
function fakeOpener(): { env: NodeJS.ProcessEnv; marker: string } {
  const dir = mkdtempSync(join(tmpdir(), "issues-opener-"));
  const marker = join(dir, "opened.log");
  const script = `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(marker)}\n`;
  for (const name of ["xdg-open", "open"]) {
    const file = join(dir, name);
    writeFileSync(file, script);
    chmodSync(file, 0o755);
  }
  return { env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}`, ISSUES_ROOT: dir }, marker };
}

async function waitForFile(path: string, timeoutMs: number): Promise<string> {
  for (let waited = 0; waited < timeoutMs; waited += 25) {
    if (existsSync(path)) return readFileSync(path, "utf8");
    await new Promise((done) => setTimeout(done, 25));
  }
  return "";
}

function firstOutput(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdout = child.stdout;
    if (!stdout) return reject(new Error("stdout unavailable"));
    child.once("error", reject);
    stdout.once("data", (data: Buffer) => resolve(data.toString()));
  });
}

test("issues web abre o navegador na URL real do servidor (porta efetiva, nunca :1)", async () => {
  const { env, marker } = fakeOpener();
  const child = spawn(bin, ["web"], { stdio: ["ignore", "pipe", "pipe"], env });
  const output = await firstOutput(child);
  const opened = await waitForFile(marker, 3000);
  child.kill();
  const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(url, "stdout deveria anunciar a URL real do servidor");
  assert.equal(opened.trim(), url); // abriu exatamente a URL real — nunca http://127.0.0.1:1
});

test("issues web --no-open inicia o client sem abrir o navegador", async () => {
  const { env, marker } = fakeOpener();
  const child = spawn(bin, ["web", "--no-open"], { stdio: ["ignore", "pipe", "pipe"], env });
  const output = await firstOutput(child);
  await waitForFile(marker, 300); // dá tempo de uma abertura indevida acontecer, se fosse acontecer
  child.kill();
  assert.match(output, /Issues web disponível em http:\/\/127\.0\.0\.1:\d+/);
  assert.equal(existsSync(marker), false, "--no-open não deve abrir o navegador");
});

test("nenhum comando além de web abre o navegador (list não dispara o abridor)", async () => {
  const { env, marker } = fakeOpener();
  const child = spawn(bin, ["list"], { stdio: ["ignore", "pipe", "pipe"], env });
  await new Promise<void>((done) => child.once("exit", () => done()));
  assert.equal(existsSync(marker), false, "um comando não-web nunca deve abrir o navegador");
});

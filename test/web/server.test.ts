import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Issue } from "../../src/domain/issue_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";
import { openBrowser, startWebServer } from "../../src/web/server.js";

test("servidor web entrega o shell em loopback e suporta rota de client", async () => {
  const web = await startWebServer();
  try {
    assert.match(web.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const root = await fetch(web.url);
    const route = await fetch(`${web.url}/issues/example`);
    assert.equal(root.status, 200);
    assert.equal(route.status, 200);
    assert.match(await root.text(), /Issues/);
    assert.match(await route.text(), /app\.js/);
  } finally {
    await close(web.server);
  }
});

test("startWebServer purga CLOSED expirado no arranque (cobre deployments só-web)", async () => {
  const r = mkdtempSync(join(tmpdir(), "issues-web-"));
  const queue = new Queue(r);
  const stale = Issue.create({ title: "t", project: "demo", type: "Feat", action: "Review", problem: "p" }, "human");
  stale.closeByHuman("done", "concluido", new Date("2020-01-01"));
  queue.save(stale);
  const web = await startWebServer(0, r);
  try {
    assert.equal(queue.load(stale.id), null);
  } finally {
    await close(web.server);
  }
});

test("servidor web serve os assets estáticos com o content-type correto (js/css) e 405 fora de /api com método não-GET", async () => {
  const web = await startWebServer();
  try {
    const js = await fetch(`${web.url}/app.js`);
    assert.equal(js.status, 200);
    assert.equal(js.headers.get("content-type"), "text/javascript; charset=utf-8");
    const css = await fetch(`${web.url}/style.css`);
    assert.equal(css.status, 200);
    assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
    const naoGet = await fetch(`${web.url}/issues/example`, { method: "POST" });
    assert.equal(naoGet.status, 405);
    assert.equal(await naoGet.text(), "Method Not Allowed");
  } finally {
    await close(web.server);
  }
});

test("servidor web nunca vaza arquivo fora do client dir mesmo com '..' escapado no path (%2F preserva o segmento)", async () => {
  const web = await startWebServer();
  try {
    // "%2F" não é um separador de path para o parser de URL: o segmento chega com ".." literal ao
    // asset (guard readClientFile), então cai no fallback do SPA (200 com o index) em vez de vazar.
    const response = await fetch(`${web.url}/a/..%2Fpackage.json`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Issues/);
  } finally {
    await close(web.server);
  }
});

test("startWebServer rejeita quando a porta já está em uso (server 'error' -> reject)", async () => {
  const first = await startWebServer();
  try {
    const port = new URL(first.url).port;
    await assert.rejects(startWebServer(Number(port)));
  } finally {
    await close(first.server);
  }
});

test("openBrowser não lança mesmo quando o comando do SO é inexistente (spawn 'error' é ignorado)", async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = ""; // força ENOENT ao tentar localizar xdg-open/open/cmd
  try {
    assert.doesNotThrow(() => openBrowser("http://127.0.0.1:1"));
    await new Promise((resolve) => setTimeout(resolve, 50)); // dá tempo do 'error' assíncrono do spawn disparar
  } finally {
    process.env.PATH = originalPath;
  }
});

test("openBrowser escolhe o comando certo por plataforma (darwin: open, win32: cmd, resto: xdg-open)", async () => {
  const { dir, log } = fakeOpeners();
  const originalPath = process.env.PATH;
  process.env.PATH = dir; // só os abridores falsos no PATH: nada abre um navegador de verdade
  try {
    const esperados = [["darwin", "open"], ["win32", "cmd"], ["linux", "xdg-open"]];
    for (const [indice, [platform]] of esperados.entries()) {
      withPlatform(platform, () => openBrowser("http://example.invalid"));
      // o log acumula: compara o prefixo inteiro, que também prova a ordem das escolhas
      assert.deepEqual(await waitForLines(log, indice + 1, 3000), esperados.slice(0, indice + 1).map(([, cmd]) => cmd));
    }
  } finally {
    process.env.PATH = originalPath;
  }
});

// Abridores falsos: cada um registra o próprio nome em vez de abrir o SO, revelando a escolha por plataforma.
function fakeOpeners(): { dir: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), "issues-opener-"));
  const log = join(dir, "opened.log");
  for (const name of ["open", "cmd", "xdg-open"]) {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(name)} >> ${JSON.stringify(log)}\n`);
    chmodSync(file, 0o755);
  }
  return { dir, log };
}

// spawn é detached: o registro do abridor chega em algum momento depois da chamada.
async function waitForLines(path: string, count: number, timeoutMs: number): Promise<string[]> {
  let lines: string[] = [];
  for (let waited = 0; waited < timeoutMs; waited += 25) {
    if (existsSync(path)) lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
    if (lines.length >= count) return lines;
    await new Promise((done) => setTimeout(done, 25));
  }
  return lines;
}

function withPlatform(platform: string, run: () => void): void {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { ...original, value: platform });
  try { run(); } finally { Object.defineProperty(process, "platform", original); }
}

function close(server: import("node:http").Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

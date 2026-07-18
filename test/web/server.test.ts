import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
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
  const stale = Issue.create({ title: "t", project: "demo", type: "Feat", action: "QA", problem: "p" }, "human");
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

test("openBrowser escolhe o comando certo por plataforma (darwin: open, win32: cmd, resto: xdg-open)", () => {
  for (const platform of ["darwin", "win32", "linux"]) {
    withPlatform(platform, () => assert.doesNotThrow(() => openBrowser("http://127.0.0.1:1")));
  }
});

function withPlatform(platform: string, run: () => void): void {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { ...original, value: platform });
  try { run(); } finally { Object.defineProperty(process, "platform", original); }
}

function close(server: import("node:http").Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

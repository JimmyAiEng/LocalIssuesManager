import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Issue } from "../../src/domain/issue_entity.js";
import { Queue } from "../../src/domain/queue_repository.js";
import { startWebServer } from "../../src/web/server.js";

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
  const stale = Issue.create({ title: "t", project: "demo", type: "Feat", problem: "p" }, "human");
  stale.closeByHuman("done", "concluido", new Date("2020-01-01"));
  queue.save(stale);
  const web = await startWebServer(0, r);
  try {
    assert.equal(queue.load(stale.id), null);
  } finally {
    await close(web.server);
  }
});

function close(server: import("node:http").Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

import assert from "node:assert/strict";
import test from "node:test";
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

function close(server: import("node:http").Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";

const bin = resolve("bin/issues");

test("issues web inicia o client sem abrir navegador quando solicitado", async () => {
  const child = spawn(bin, ["web", "--no-open"], { stdio: ["ignore", "pipe", "pipe"] });
  const output = await firstOutput(child);
  child.kill();
  assert.match(output, /Issues web disponível em http:\/\/127\.0\.0\.1:\d+/);
});

function firstOutput(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdout = child.stdout;
    if (!stdout) return reject(new Error("stdout unavailable"));
    child.once("error", reject);
    stdout.once("data", (data: Buffer) => resolve(data.toString()));
  });
}

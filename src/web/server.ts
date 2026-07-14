import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Queue } from "../domain/queue_repository.js";
import { createApiHandler, type ApiHandler } from "./api.js";

const HOST = "127.0.0.1";
const CLIENT_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "client");

export type WebServer = { server: Server; url: string };

export function startWebServer(port = 0, root?: string): Promise<WebServer> {
  return new Promise((resolve, reject) => {
    new Queue(root).purgeClosed(); // GC de CLOSED expirados no startup: cobre deployments só-web (sem loop)
    const api = createApiHandler(root);
    const server = createServer((request, response) => void handleRequest(api, request, response));
    server.once("error", reject);
    server.listen(port, HOST, () => resolveServer(server, resolve));
  });
}

export function openBrowser(url: string): void {
  const [command, ...prefix] = process.platform === "darwin" ? ["open"]
    : process.platform === "win32" ? ["cmd", "/c", "start", ""] : ["xdg-open"];
  const child = spawn(command, [...prefix, url], { detached: true, stdio: "ignore" });
  child.once("error", () => undefined);
  child.unref();
}

function resolveServer(server: Server, resolve: (value: WebServer) => void): void {
  server.removeAllListeners("error");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Web server has no TCP address");
  resolve({ server, url: `http://${HOST}:${address.port}` });
}

async function handleRequest(api: ApiHandler, request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse): Promise<void> {
  if (await api(request, response)) return;
  if (request.method !== "GET") return respond(response, 405, "Method Not Allowed", "text/plain");
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const asset = pathname === "/" ? "index.html" : pathname.slice(1);
  const content = readClientFile(asset);
  if (content) return respond(response, 200, content, contentType(asset));
  return respond(response, 200, readClientFile("index.html")!, "text/html; charset=utf-8");
}

function readClientFile(asset: string): Buffer | null {
  if (!asset || asset.includes("..") || asset.includes("\\")) return null;
  try { return readFileSync(join(CLIENT_DIRECTORY, asset)); } catch { return null; }
}

function contentType(asset: string): string {
  if (asset.endsWith(".css")) return "text/css; charset=utf-8";
  if (asset.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "text/html; charset=utf-8";
}

function respond(response: import("node:http").ServerResponse, status: number, body: string | Buffer, type: string): void {
  response.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) });
  response.end(body);
}

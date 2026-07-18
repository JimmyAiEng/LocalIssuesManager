import { createHash } from "node:crypto";
import type { SyntaxCheck } from "../domain/gates/design_gate.js";
import { DomainError } from "../domain/domain_error.js";

// Wrapper do engine PlantUML TeaVM (@plantuml/mcp-js), decisões D1/D2 da spec:
// D1 — import lazy e memoizado (engine.js ~27MB; só o 1º uso paga o load);
// D2 — o engine loga em console.log/info/debug (System.out do Java) — silenciamos
// para stderr durante load/check para manter o stdout do CLI como JSON puro.
type Engine = typeof import("@plantuml/mcp-js/engine.js");

let enginePromise: Promise<Engine> | null = null;

async function silenced<T>(run: () => T | Promise<T>): Promise<T> {
  const original = { log: console.log, info: console.info, debug: console.debug };
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
  try {
    return await run();
  } finally {
    Object.assign(console, original);
  }
}

// Diagramas com layout Graphviz esperam o global `Viz` (mesma shape do browser);
// em Node vem de @viz-js/viz (WASM), com instance memoizada — como no server.js do pacote.
async function loadEngine(): Promise<Engine> {
  const viz = await import("@viz-js/viz");
  let instance: ReturnType<typeof viz.instance> | null = null;
  (globalThis as Record<string, unknown>).Viz = { instance: () => (instance ??= viz.instance()) };
  return import("@plantuml/mcp-js/engine.js");
}

// Memo por hash do fonte (checkSyntax é puro): o pacote de Design é lido a cada poll do
// detalhe web e revalida cada .puml — sem isto, o engine roda por poll.
const checkCache = new Map<string, SyntaxCheck>();

export async function checkSyntax(source: string): Promise<SyntaxCheck> {
  const key = sourceHash(source);
  const cached = checkCache.get(key);
  if (cached !== undefined) return cached;
  enginePromise ??= silenced(loadEngine);
  const engine = await enginePromise;
  const check = JSON.parse(await silenced(() => engine.checkSyntax(source))) as SyntaxCheck;
  checkCache.set(key, check);
  return check;
}

// Hash do fonte: chave do memo e ETag da rota .svg — regravar o .puml invalida os dois sozinho.
export function sourceHash(source: string): string {
  return createHash("sha1").update(source).digest("hex");
}

// ponytail: memo sem teto, endereçado por conteúdo — o teto real é "versões distintas de fonte já
// renderizadas no processo", não o nº de diagramas: cada reescrita de um .puml deixa a entrada
// antiga para trás (200 iterações de um diagrama ≈ 458 KiB). Serve porque o servidor é local e
// de vida curta; se virar processo longo ou multiusuário, troque por LRU.
const svgCache = new Map<string, string>();

// Render SVG do PlantUML. O engine é assíncrono por callback (roda em worker TeaVM, exigido
// pela ponte @Async do Viz.js) e entrega um JSON — o SVG vem no campo `svg`, nunca cru.
export async function renderSvg(source: string): Promise<string> {
  const key = sourceHash(source);
  const cached = svgCache.get(key);
  if (cached !== undefined) return cached;
  enginePromise ??= silenced(loadEngine);
  const engine = await enginePromise;
  const json = await silenced(() => new Promise<string>((resolve) => engine.renderSvg(source, resolve)));
  const result = JSON.parse(json) as SyntaxCheck & { svg?: string };
  // Defensivo: o .puml é validado no write (addDesignDiagram), então inválido aqui é fonte corrompida.
  if (!result.valid || result.svg === undefined) {
    throw new DomainError(result.errorMessage ?? "PlantUML inválido — SVG não gerado");
  }
  svgCache.set(key, result.svg);
  return result.svg;
}

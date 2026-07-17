import type { SyntaxCheck } from "../domain/design_gate.js";

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

export async function checkSyntax(source: string): Promise<SyntaxCheck> {
  enginePromise ??= silenced(loadEngine);
  const engine = await enginePromise;
  return JSON.parse(await silenced(() => engine.checkSyntax(source))) as SyntaxCheck;
}

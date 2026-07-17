// Tipos do engine TeaVM (@plantuml/mcp-js não publica declarações).
declare module "@plantuml/mcp-js/engine.js" {
  export function version(): string;
  export function checkSyntax(source: string): string;
  // Assíncrono por callback: o render roda num worker TeaVM.
  export function renderSvg(source: string, done: (svg: string) => void): void;
}

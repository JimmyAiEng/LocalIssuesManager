// Tipos do engine TeaVM (@plantuml/mcp-js não publica declarações).
declare module "@plantuml/mcp-js/engine.js" {
  export function version(): string;
  export function checkSyntax(source: string): string;
  export function renderDiagram(source: string): string;
}

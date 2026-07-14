import { homedir } from "node:os";
import { join } from "node:path";

// Raiz de armazenamento das Issues (fila e loop). Sobrescrevível por env para testes/deploys.
export function defaultRoot(): string {
  return process.env.ISSUES_ROOT ?? join(homedir(), "issues-manager");
}

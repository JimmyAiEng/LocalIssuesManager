import { homedir } from "node:os";
import { join } from "node:path";

// Raiz de armazenamento das Issues. Sobrescrevível por env para testes/deploys.
export function defaultRoot(): string {
  return process.env.ISSUES_ROOT ?? join(homedir(), "issues-manager");
}

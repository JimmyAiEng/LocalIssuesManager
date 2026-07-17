import { addDesignDiagram, getDesignPackage, setDesignDoc } from "./app/design_use_cases.js";
import { DesignGateError } from "./domain/design_gate.js";

type Flags = Record<string, string | boolean>;

// Subcomando `issues design <doc|add>`: validação fail-fast — erro de gate sai no
// stderr como JSON {"errors":[{code,path?,message,line?}]} com exit 1 e nada é gravado.
export async function runDesign(raw: string[]): Promise<void> {
  try {
    const flags = parseFlags(raw.slice(1));
    print(await design(raw[0], flags), Boolean(flags.pretty));
  } catch (error) {
    reportCliError(error);
  }
}

// `issues get DESIGN --id <issueId>`: imprime o pacote agregado com validation.ready_for_awaiting.
export async function printDesignPackage(issueId: string, pretty: boolean): Promise<void> {
  try {
    print(await getDesignPackage({ issueId }), pretty);
  } catch (error) {
    reportCliError(error);
  }
}

async function design(sub: string | undefined, flags: Flags): Promise<object> {
  if (sub !== "doc" && sub !== "add") {
    throw new Error("Usage: issues design <doc|add> --issue <issueId> --ticket <ticketId> [--kind <kind>] --file <path>");
  }
  const base = { issueId: need(flags, "issue"), ticketId: need(flags, "ticket"), file: need(flags, "file") };
  return sub === "doc" ? setDesignDoc(base) : addDesignDiagram({ ...base, kind: need(flags, "kind") });
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const name = key.slice(2);
    if (name === "pretty") flags[name] = true;
    else flags[name] = args[++index] ?? "";
  }
  return flags;
}

function need(flags: Flags, name: string): string {
  const result = flags[name];
  if (typeof result !== "string" || !result.trim()) throw new Error(`--${name} is required`);
  return result;
}

function print(result: object, pretty: boolean): void {
  process.stdout.write(`${JSON.stringify(result, null, pretty ? 2 : 0)}\n`);
}

// DesignGateError vira o contrato JSON de erros; demais erros seguem o padrão do CLI (mensagem
// crua). Exportado para o cli.ts usar sem importar de domain/ (restrição de arquitetura).
export function reportCliError(error: unknown): void {
  process.exitCode = 1;
  if (error instanceof DesignGateError) {
    process.stderr.write(`${JSON.stringify({ errors: error.errors })}\n`);
    return;
  }
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
}

import { spawnSync } from "node:child_process";
import { DomainError } from "../../domain/domain_error.js";
import type { ProjectConfig } from "../../domain/queue_repository.js";

export type CheckStep = "lint" | "unit" | "fitness" | "e2e" | "mutation";
// Ordem do pipeline exigido pelo workflow: barato→caro, mutation por último (só faz sentido
// depois que os testes passam). Para na primeira falha.
export const CHECK_ORDER: CheckStep[] = ["lint", "unit", "fitness", "e2e", "mutation"];

// step="check" é o comando legado único; senão a etapa nomeada que reprovou. output = rabo da saída.
export type CheckFailure = { step: CheckStep | "check"; command: string; output: string };

// Resultado bruto de uma execução; runner injetável para os testes exercitarem o caminho Docker
// (presente/ausente) sem chamar docker real. O default embrulha spawnSync como o resto do código.
export type ExecResult = { status: number | null; stdout: string; stderr: string; error?: Error };
export type CommandRunner = (file: string, args: string[], opts: { cwd: string; shell: boolean }) => ExecResult;

const spawnRunner: CommandRunner = (file, args, opts) =>
  spawnSync(file, args, { cwd: opts.cwd, shell: opts.shell, encoding: "utf8" }) as unknown as ExecResult;

// Roda a validação do projeto na worktree, em ordem, parando na primeira falha. Usa os checks
// nomeados quando configurados; senão cai no check legado. Com `container` definido, cada check
// roda isolado no Docker montando a worktree; sem ele, roda no host (comportamento legado).
// Devolve a etapa que falhou (com seu output) ou null quando tudo passa — o gate de Implement
// decide o roteamento a partir daí.
export function runProjectChecks(config: ProjectConfig, cwd: string, run: CommandRunner = spawnRunner): CheckFailure | null {
  const named = CHECK_ORDER.filter((step) => config.checks?.[step])
    .map((step) => [step, config.checks![step]!] as [CheckStep | "check", string]);
  const steps = named.length ? named : config.check ? [["check", config.check] as [CheckStep | "check", string]] : [];
  for (const [step, command] of steps) {
    const output = config.container ? runDocker(config.container, command, cwd, run) : runShell(command, cwd, run);
    if (output !== null) return { step, command, output };
  }
  return null;
}

// docker run --rm -v <worktree>:/work -w /work <imagem> sh -c <comando>: monta a worktree em /work
// e executa o check dela dentro do container — isolado do host, com o toolchain da imagem.
export function dockerArgv(image: string, worktree: string, command: string): string[] {
  return ["run", "--rm", "-v", `${worktree}:/work`, "-w", "/work", image, "sh", "-c", command];
}

// Roda o check no container; devolve o rabo da saída quando falha (CheckFailure normal), ou null
// quando passa. Docker ausente é erro explícito (não fallback silencioso): binário não encontrado
// (spawn error) ou saída 125, código que o Docker reserva para falha do próprio daemon/run.
function runDocker(image: string, command: string, worktree: string, run: CommandRunner): string | null {
  const result = run("docker", dockerArgv(image, worktree, command), { cwd: worktree, shell: false });
  if (result.error || result.status === 125) {
    throw new DomainError(`Docker indisponível para rodar os checks no container "${image}": instale/inicie o Docker ou remova o container do projeto (não há fallback silencioso para o host). ${result.error?.message ?? tail(result)}`);
  }
  return result.status === 0 ? null : tail(result);
}

// Roda um comando shell no host; devolve o rabo da saída quando falha, ou null quando passa.
function runShell(command: string, cwd: string, run: CommandRunner): string | null {
  const result = run(command, [], { cwd, shell: true });
  return result.status === 0 ? null : tail(result);
}

function tail(result: ExecResult): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split("\n").slice(-15).join("\n");
}

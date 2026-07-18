import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DomainError } from "../../../domain/domain_error.js";
import { type ProjectChecks, type ProjectConfig, Queue } from "../../../domain/queue_repository.js";
import { required } from "../../../domain/value_objects.js";
import { CHECK_ORDER } from "../project_checks.js";

export type { ProjectChecks }; // re-export para o CLI montar os flags sem alcançar a camada domain

export type CreateProjectInput = { name: string; repo: string; container?: string; check?: string; checks?: ProjectChecks; testPaths?: string[] };

// Registra (ou atualiza) um projeto: nome, repositório git local (base das worktrees), a imagem
// Docker opcional dos checks e a validação (checks nomeados ou o check legado) que uma Issue
// Implement precisa passar.
export function createProject(input: CreateProjectInput, root?: string): ProjectConfig {
  required(input.name, "name");
  required(input.repo, "repo");
  const repo = resolve(input.repo);
  if (!existsSync(repo)) throw new DomainError(`Repositório não encontrado: ${repo}`);
  const config: ProjectConfig = { name: input.name, repo,
    ...(input.container ? { container: input.container } : {}),
    ...(input.check ? { check: input.check } : {}),
    ...(input.checks && hasCheck(input.checks) ? { checks: input.checks } : {}),
    ...(input.testPaths?.length ? { testPaths: input.testPaths } : {}) };
  new Queue(root).writeProject(config);
  return config;
}

function hasCheck(checks: ProjectChecks): boolean {
  return CHECK_ORDER.some((step) => checks[step] !== undefined);
}

export function listProjects(root?: string): ProjectConfig[] {
  return new Queue(root).listProjects();
}

// Issues só nascem em projeto registrado: o registro carrega o repositório e o check.
export function requireProject(queue: Queue, name: string): ProjectConfig {
  const project = queue.readProject(name);
  if (!project) {
    throw new DomainError(`Projeto não registrado: ${name} — crie com 'issues project create --name ${name} --repo <path>'`);
  }
  return project;
}

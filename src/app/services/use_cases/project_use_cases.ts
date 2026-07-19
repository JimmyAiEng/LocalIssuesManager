import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DomainError } from "../../../domain/domain_error.js";
import { type ProjectConfig, Queue } from "../../../domain/queue_repository.js";
import { required } from "../../../domain/value_objects.js";

export type CreateProjectInput = { name: string; repo: string };

// Registra (ou atualiza) um projeto: nome e repositório git local. O repo vai no prompt do agente;
// o issue-manager orquestra o harness, não executa checks.
export function createProject(input: CreateProjectInput, root?: string): ProjectConfig {
  required(input.name, "name");
  required(input.repo, "repo");
  const repo = resolve(input.repo);
  if (!existsSync(repo)) throw new DomainError(`Repositório não encontrado: ${repo}`);
  const config: ProjectConfig = { name: input.name, repo };
  new Queue(root).writeProject(config);
  return config;
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

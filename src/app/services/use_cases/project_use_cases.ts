import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DomainError } from "../../../domain/domain_error.js";
import { type ConcernLevel, CONCERN_LEVELS, type ProjectConfig, Queue } from "../../../domain/queue_repository.js";
import { required } from "../../../domain/value_objects.js";

export type CreateProjectInput = { name: string; repo: string; concern?: string };

// Registra (ou atualiza) um projeto: nome, repositório git local e nível de preocupação. O repo vai no
// prompt do agente; o issue-manager orquestra o harness, não executa checks. Como é upsert, re-registrar
// com --concern muda o concern sem comando novo. Sem --concern: default LOW.
export function createProject(input: CreateProjectInput, root?: string): ProjectConfig {
  required(input.name, "name");
  required(input.repo, "repo");
  const repo = resolve(input.repo);
  if (!existsSync(repo)) throw new DomainError(`Repositório não encontrado: ${repo}`);
  const config: ProjectConfig = { name: input.name, repo, concern: parseConcern(input.concern) };
  new Queue(root).writeProject(config);
  return config;
}

function parseConcern(value: string | undefined): ConcernLevel {
  if (value === undefined) return "LOW";
  if (!CONCERN_LEVELS.includes(value as ConcernLevel)) {
    throw new DomainError(`concern inválido: ${value} (use ${CONCERN_LEVELS.join("|")})`);
  }
  return value as ConcernLevel;
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

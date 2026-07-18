import { DomainError } from "./domain_error.js";
import { featureNames, type Requirements } from "./requirements.js";

// Artefato de PRD (Full PRD): visão, requisitos funcionais/não-funcionais e clusters que agrupam
// as Features Gherkin por semelhança — cada cluster origina uma Issue Design. Regra pura do
// domínio (sem I/O); validado por código (estrutura + amarração às Features dos requisitos).
export type Cluster = { name: string; features: string[] }; // features referenciadas por nome (cabeçalho da Feature)
export type Prd = {
  visao: string;
  requisitos_funcionais: string[];
  requisitos_nao_funcionais: string[];
  clusters: Cluster[];
};

// Valida a estrutura do PRD e, se ela fecha, a amarração aos requisitos: cada Feature dos
// requisitos pertence a exatamente um cluster; cluster com Feature inexistente é erro. Acumula tudo.
export function validatePrd(raw: unknown, requirements: Requirements): Prd {
  const errors = collectErrors(raw);
  if (errors.length === 0) errors.push(...clusterErrors(raw as Prd, requirements));
  if (errors.length > 0) throw new DomainError(errors.join("; "));
  return raw as Prd;
}

// Conveniência para a camada app: parseia o texto JSON (só JSON é aceito) e valida.
export function parseAndValidatePrd(rawText: string, requirements: Requirements): Prd {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new DomainError("PRD deve ser um arquivo JSON válido");
  }
  return validatePrd(parsed, requirements);
}

// A Issue Design filha declara o cluster no próprio título (convenção: o nome do cluster aparece
// no título). Casamento determinístico: o cluster cujo nome o título contém. A decomposição
// automática (fan-out) reusa isto ao criar as filhas nomeadas pelo cluster.
export function clusterForTitle(prd: Prd, title: string): Cluster | null {
  return prd.clusters.find((cluster) => title.includes(cluster.name)) ?? null;
}

// Features Gherkin (texto completo) de um cluster: resolve os nomes referenciados contra os
// requisitos. É o que viaja no prompt da filha Design — só o cluster dela, não o PRD inteiro.
export function clusterFeatures(cluster: Cluster, requirements: Requirements): string[] {
  const names = featureNames(requirements);
  return cluster.features
    .map((name) => requirements.features[names.indexOf(name)])
    .filter((text): text is string => text !== undefined);
}

function collectErrors(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return ["PRD deve ser um objeto JSON com visao, requisitos_funcionais, requisitos_nao_funcionais e clusters"];
  }
  const prd = raw as Record<string, unknown>;
  const errors: string[] = [];
  requireText(prd.visao, "visao", errors);
  requireTextList(prd.requisitos_funcionais, "requisitos_funcionais", errors);
  requireTextList(prd.requisitos_nao_funcionais, "requisitos_nao_funcionais", errors);
  requireClusters(prd.clusters, errors);
  return errors;
}

// Cross-validação: conta em quantos clusters cada Feature aparece. Zero → Feature sem cluster;
// mais de um → Feature em clusters demais; referência a Feature fora dos requisitos → erro.
function clusterErrors(prd: Prd, requirements: Requirements): string[] {
  const names = featureNames(requirements);
  const counts = new Map<string, number>();
  const errors: string[] = [];
  for (const cluster of prd.clusters) {
    for (const feature of cluster.features) {
      counts.set(feature, (counts.get(feature) ?? 0) + 1);
      if (!names.includes(feature)) errors.push(`Cluster "${cluster.name}" referencia Feature inexistente "${feature}"`);
    }
  }
  for (const name of names) {
    const count = counts.get(name) ?? 0;
    if (count === 0) errors.push(`Feature "${name}" não pertence a nenhum cluster`);
    if (count > 1) errors.push(`Feature "${name}" pertence a mais de um cluster (${count})`);
  }
  return errors;
}

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`PRD.${field} é obrigatório (texto não vazio)`);
  }
}

function requireTextList(value: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`PRD.${field} deve ter ao menos um item`);
    return;
  }
  if (value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    errors.push(`PRD.${field} deve conter apenas textos não vazios`);
  }
}

// Clusters: array com ao menos um cluster; cada um com nome não vazio e ao menos uma Feature textual.
function requireClusters(value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push("PRD.clusters deve ter ao menos um cluster");
    return;
  }
  value.forEach((cluster, index) => {
    const named = `PRD.clusters[${index}]`;
    if (typeof cluster !== "object" || cluster === null) {
      errors.push(`${named} deve ser um objeto com name e features`);
      return;
    }
    requireText((cluster as Record<string, unknown>).name, `${named}.name`, errors);
    requireTextList((cluster as Record<string, unknown>).features, `${named}.features`, errors);
  });
}

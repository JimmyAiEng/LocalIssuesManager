import { DomainError } from "../domain_error.js";
import { assertBrief } from "../value_objects.js";
import type { ArtifactDefinition } from "./artifact.js";

const MAX_FEATURES = 5;
const STEP_KEYWORDS = ["Given", "When", "Then", "And"] as const;
const TEXT_FIELDS = ["feature", "como", "quero", "para"] as const;

// Artefato de requisitos: JSONL — uma Feature estruturada por linha. Os prefixos pt-BR da user
// story ("Como", "Eu quero poder", "Para que eu possa") são escritos pelo sistema na renderização
// (toGherkin), não pelo autor: não há como errar a palavra. Validação é presença de campo, não
// gramática de texto. Puro, sem I/O — regra do domínio.
//
// Os campos guardam a forma neutra, que compõe frase válida sob qualquer prefixo: `como` traz o
// papel com artigo ("um usuário", "uma administradora" — prefixo fixo "Como um" erraria o gênero),
// `quero` e `para` trazem o verbo no infinitivo ("entrar", "acessar o painel"). Conjugar é
// exatamente o que o autor erra, então o sistema não pede conjugação.
export type Scenario = { nome: string; steps: string[] };
export type Feature = { feature: string; como: string; quero: string; para: string; scenarios: Scenario[] };
export type RequirementSet = { features: Feature[] };

const STEP_PATTERN = new RegExp(`^(${STEP_KEYWORDS.join("|")})\\s+\\S`);

// Erro de forma sem exemplo prende modelo pequeno em loop: ele não adivinha o formato que este
// validador aceita, e a skill que documenta o formato pode nem ter sido carregada. A mensagem
// carrega o exemplo — é a única documentação garantida em qualquer harness.
const FEATURE_EXEMPLO: Feature = {
  feature: "Login", como: "um usuário", quero: "entrar", para: "acessar o painel",
  scenarios: [{ nome: "ok", steps: ["Given a tela de login", "When envio credenciais válidas", "Then vejo o painel"] }],
};
const FORMATO = `Formato esperado — um JSON por linha, cada Feature inteira numa única linha: ${JSON.stringify(FEATURE_EXEMPLO)}`;

export const RequirementArtifact = {
  type: "requirement" as const,
  // Valida o JSONL bruto e devolve-o normalizado. Lança DomainError apontando a linha.
  validate(rawText: string): RequirementSet {
    const features = numberedLines(rawText).map(parseLine);
    assertMaxFeatures(features);
    assertUniqueNames(features);
    return { features };
  },
  featureNames(requirements: RequirementSet): string[] {
    return requirements.features.map((feature) => feature.feature);
  },
  // Serializador único: o que entra por --file, o que fica em disco e o que o decompose grava na
  // filha são o mesmo formato, lido pelo mesmo parser.
  toJsonl(requirements: RequirementSet): string {
    return requirements.features.map((feature) => JSON.stringify(feature)).join("\n");
  },
  toGherkin,
} satisfies ArtifactDefinition;

// Gherkin legível a partir dos campos: é assim que a Feature viaja no prompt da filha Design.
// Único lugar que escreve os prefixos da user story.
export function toGherkin(feature: Feature): string {
  const story = `Como ${feature.como}\nEu quero poder ${feature.quero}\nPara que eu possa ${feature.para}`;
  const scenarios = feature.scenarios
    .map((scenario) => `Scenario: ${scenario.nome}\n${scenario.steps.join("\n")}`).join("\n\n");
  return `Feature: ${feature.feature}\n${story}\n\n${scenarios}`;
}

// Linhas em branco são ignoradas, mas o número reportado é o da linha real no arquivo — erro que
// aponta a linha errada custa mais que erro nenhum.
function numberedLines(rawText: string): { text: string; line: number }[] {
  const entries = rawText.split("\n")
    .map((text, index) => ({ text: text.trim(), line: index + 1 }))
    .filter((entry) => entry.text.length > 0);
  if (entries.length === 0) {
    throw new DomainError(`Requirements deve conter ao menos uma Feature. ${FORMATO}`);
  }
  return entries;
}

// Cardinalidade só depois que toda linha virou Feature: contar linhas antes de parsear faz um JSON
// pretty-printed (17 linhas, uma Feature) ser acusado de escopo grande demais, mandando quebrar a
// Issue quando o erro era só formatação. O remédio errado é pior que erro nenhum.
function assertMaxFeatures(features: Feature[]): void {
  if (features.length > MAX_FEATURES) {
    throw new DomainError(`Requirements com ${features.length} Features (limite ${MAX_FEATURES}): escopo grande indica Issue grande demais — crie Issues menores relacionadas (--relates <esta-issue>) e abandone esta com 'issues status … --status CLOSED --reason obsoleto' (o abandono não cobra requisitos)`);
  }
}

function parseLine(entry: { text: string; line: number }): Feature {
  const where = `linha ${entry.line}`;
  let parsed: unknown;
  try { parsed = JSON.parse(entry.text); }
  catch { throw new DomainError(`${where}: JSON inválido — cada linha é uma Feature completa, sem quebrar no meio. ${FORMATO}`); }
  return validateFeature(parsed, where);
}

function validateFeature(raw: unknown, where: string): Feature {
  const fields = objectFields(raw, where);
  const [feature, como, quero, para] = TEXT_FIELDS.map((field) => requireText(fields, field, where));
  const named = `${where} (Feature "${feature}")`;
  const value: Feature = { feature, como, quero, para, scenarios: requireScenarios(fields.scenarios, named) };
  assertBrief(toGherkin(value), named);
  return value;
}

// Cardinalidade e conteúdo dos cenários: Feature sem cenário não é requisito verificável.
function requireScenarios(raw: unknown, named: string): Scenario[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new DomainError(`${named}: "scenarios" deve ser um array com ao menos um cenário. ${FORMATO}`);
  }
  return raw.map((scenario, index) => validateScenario(scenario, `${named}, scenarios[${index}]`));
}

function validateScenario(raw: unknown, named: string): Scenario {
  const fields = objectFields(raw, named);
  const nome = requireText(fields, "nome", named);
  if (!Array.isArray(fields.steps) || fields.steps.length === 0) {
    throw new DomainError(`${named}: "steps" deve ser um array com ao menos um step. ${FORMATO}`);
  }
  return { nome, steps: fields.steps.map((step, index) => validateStep(step, `${named}.steps[${index}]`)) };
}

function validateStep(raw: unknown, named: string): string {
  const step = typeof raw === "string" ? raw.trim() : "";
  if (!STEP_PATTERN.test(step)) {
    throw new DomainError(`${named}: step deve começar com ${STEP_KEYWORDS.join("/")} seguido do conteúdo — recebido ${JSON.stringify(raw)}`);
  }
  return step;
}

// O nome da Feature é a chave que liga a Feature à filha Design que a cobre (ADR 0008): duplicata
// faria duas Features distintas colapsarem numa só no gate de partição, sem erro nenhum.
function assertUniqueNames(features: Feature[]): void {
  const seen = new Set<string>();
  for (const { feature } of features) {
    if (seen.has(feature)) {
      throw new DomainError(`Feature "${feature}" aparece em duas linhas: o nome liga a Feature à filha Design que a cobre, então precisa ser único`);
    }
    seen.add(feature);
  }
}

function objectFields(raw: unknown, named: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DomainError(`${named}: deve ser um objeto JSON. ${FORMATO}`);
  }
  return raw as Record<string, unknown>;
}

function requireText(fields: Record<string, unknown>, field: string, named: string): string {
  const value = fields[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new DomainError(`${named}: campo "${field}" é obrigatório (texto não vazio). ${FORMATO}`);
  }
  return value.trim();
}

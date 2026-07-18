import { DomainError } from "../domain_error.js";
import { assertBrief } from "../value_objects.js";
import type { ArtifactDefinition } from "./artifact.js";

const MAX_FEATURES = 5;

// Artefato de requisitos: JSON com uma ou mais Features em Gherkin (pt-BR).
// Validado por código (sintaxe/estrutura), sem I/O — regra pura do domínio.
export type RequirementSet = { features: string[] };

const STEP_KEYWORDS = ["Given", "When", "Then", "And"] as const;
const STORY_PREFIXES = ["Como um", "Eu quero poder", "Para que eu"] as const;

// Erro de forma sem exemplo prende modelo pequeno em loop: ele não adivinha o Gherkin que este
// validador aceita, e a skill que documenta o formato pode nem ter sido carregada. A mensagem
// carrega o exemplo — é a única documentação garantida em qualquer harness.
const FEATURE_EXEMPLO = "Feature: Login\nComo um usuário\nEu quero poder entrar\nPara que eu acesse\n\nScenario: ok\nGiven a tela\nWhen entro\nThen vejo o painel";
const FORMATO = `Formato esperado — exemplo: {"features": [${JSON.stringify(FEATURE_EXEMPLO)}]}`;

const isStep = (line: string): boolean =>
  STEP_KEYWORDS.some((kw) => line === kw || line.startsWith(`${kw} `));

// Valida o artefato bruto (parse de JSON já feito) e devolve-o normalizado.
// Lança DomainError com mensagem clara (apontando a Feature) em qualquer violação.
export const RequirementArtifact = {
  type: "requirement" as const,
  validate(rawText: string): RequirementSet {
    let parsed: unknown;
    try { parsed = JSON.parse(rawText); }
    catch { throw new DomainError(`Requirements deve ser um arquivo JSON válido. ${FORMATO}`); }
    return validateParsed(parsed);
  },
  validateParsed,
  featureNames(requirements: RequirementSet): string[] {
    return requirements.features.map(featureName);
  },
} satisfies ArtifactDefinition;

function validateParsed(raw: unknown): RequirementSet {
  const features = featureList(raw);
  features.forEach((feature, index) => { validateGherkinFeature(feature, index); });
  return { features: features as string[] };
}

function validateGherkinFeature(feature: unknown, index: number): void {
  if (typeof feature !== "string") {
    throw new DomainError(`Feature ${index + 1}: deve ser texto Gherkin (string), não objeto. ${FORMATO}`);
  }
  assertBrief(feature, `Feature ${index + 1}`);
  validateFeature(feature, index);
}

// Estrutura e cardinalidade: 1 a 5 Features — escopo grande denuncia Issue grande.
function featureList(raw: unknown): unknown[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DomainError(`Requirements deve ser um objeto JSON com o campo 'features'. ${FORMATO}`);
  }
  const features = (raw as { features?: unknown }).features;
  if (!Array.isArray(features)) {
    throw new DomainError(`Requirements.features deve ser um array de Features Gherkin. ${FORMATO}`);
  }
  if (features.length === 0) {
    throw new DomainError("Requirements deve conter ao menos uma Feature");
  }
  if (features.length > MAX_FEATURES) {
    throw new DomainError(`Requirements com ${features.length} Features (limite ${MAX_FEATURES}): escopo grande indica Issue grande demais — feche esta Issue e crie Issues menores relacionadas (--relates)`);
  }
  return features;
}

function featureName(text: string): string {
  const header = text.split("\n").map((line) => line.trim()).find((line) => line.startsWith("Feature:"));
  return header ? header.replace(/^Feature:\s*/, "").trim() : "";
}

function validateFeature(text: string, index: number): void {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const header = lines[0]?.match(/^Feature:\s*(.+)$/);
  if (!header) {
    throw new DomainError(`Feature ${index + 1}: deve começar com o cabeçalho "Feature: <nome>"`);
  }
  const named = `Feature "${header[1].trim()}"`;
  validateUserStory(lines, named);
  validateScenarios(lines.slice(4), named);
}

// User story pt-BR: as três linhas na ordem exata, cada uma com conteúdo.
function validateUserStory(lines: string[], named: string): void {
  STORY_PREFIXES.forEach((prefix, offset) => {
    const line = lines[1 + offset];
    if (!line?.startsWith(`${prefix} `) || line.slice(prefix.length).trim().length === 0) {
      throw new DomainError(`${named}: user story deve conter "${prefix} ..." na ordem esperada`);
    }
  });
}

// Após a user story: apenas cabeçalhos Scenario e steps Given/When/Then/And.
function validateScenarios(body: string[], named: string): void {
  let scenarios = 0;
  let stepsInCurrent = 0;
  for (const line of body) {
    if (/^Scenario:\s*.+$/.test(line)) {
      if (scenarios > 0 && stepsInCurrent === 0) throw noStep(named);
      scenarios += 1;
      stepsInCurrent = 0;
    } else if (scenarios === 0) {
      throw new DomainError(`${named}: conteúdo antes do primeiro Scenario — use "Scenario: <nome>"`);
    } else if (!isStep(line)) {
      throw new DomainError(`${named}: step inválido "${line}" — use apenas Given/When/Then/And`);
    } else {
      stepsInCurrent += 1;
    }
  }
  if (scenarios === 0) throw new DomainError(`${named}: deve ter ao menos um Scenario`);
  if (stepsInCurrent === 0) throw noStep(named);
}

const noStep = (named: string): DomainError =>
  new DomainError(`${named}: todo Scenario deve ter ao menos um step`);

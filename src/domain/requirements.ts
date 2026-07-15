import { DomainError } from "./domain_error.js";

// Artefato de requisitos: JSON com uma ou mais Features em Gherkin (pt-BR).
// Validado por código (sintaxe/estrutura), sem I/O — regra pura do domínio.
export type Requirements = { features: string[] };

const STEP_KEYWORDS = ["Given", "When", "Then", "And"] as const;
const STORY_PREFIXES = ["Como um", "Eu quero poder", "Para que eu"] as const;

const isStep = (line: string): boolean =>
  STEP_KEYWORDS.some((kw) => line === kw || line.startsWith(`${kw} `));

// Valida o artefato bruto (parse de JSON já feito) e devolve-o normalizado.
// Lança DomainError com mensagem clara (apontando a Feature) em qualquer violação.
export function validateGherkinRequirements(raw: unknown): Requirements {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DomainError("Requirements deve ser um objeto JSON com o campo 'features'");
  }
  const features = (raw as { features?: unknown }).features;
  if (!Array.isArray(features)) {
    throw new DomainError("Requirements.features deve ser um array de Features Gherkin");
  }
  if (features.length === 0) {
    throw new DomainError("Requirements deve conter ao menos uma Feature");
  }
  features.forEach((feature, index) => {
    if (typeof feature !== "string") {
      throw new DomainError(`Feature ${index + 1}: deve ser texto Gherkin (string)`);
    }
    validateFeature(feature, index);
  });
  return { features: features as string[] };
}

// Conveniência para a camada app: parseia o texto JSON (só JSON é aceito) e valida.
// Mantém-se pura (sem I/O); malformação de JSON vira DomainError claro.
export function parseAndValidateRequirements(rawText: string): Requirements {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new DomainError("Requirements deve ser um arquivo JSON válido");
  }
  return validateGherkinRequirements(parsed);
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

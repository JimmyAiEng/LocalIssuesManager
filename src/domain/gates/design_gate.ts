import { UML_KINDS, UmlArtifact, type UmlKind, type UmlSyntaxCheck } from "../artifacts/uml_artifact.js";
import { DomainError } from "../domain_error.js";
import type { GateDefinition } from "./gate.js";

export const DESIGN_GATE: GateDefinition = {
  action: "Design",
  name: "Design",
  artifacts: { mode: "required", types: ["implementation-plan"],
    conditional: { types: ["document", "uml"], condition: "architecture_changed=true" } },
  codeExecution: { mode: "conditional", description: "validação PlantUML", condition: "architecture_changed=true" },
  humanApproval: { mode: "conditional", condition: "architecture_changed=true ou tags de autonomia" },
};

// Regras puras do gate de Design (sem I/O): kinds aceitos, heurística
// kind↔diagramType (decisão D3 da spec) e avaliação da entrega.
export const DESIGN_KINDS = UML_KINDS;
export type DesignKind = UmlKind;

// Os 4 níveis de arquitetura que o workflow exige quando a arquitetura muda (top-down).
export const DESIGN_LEVELS = ["high_level", "package", "class", "interface_data_model"] as const;
export type DesignLevel = (typeof DESIGN_LEVELS)[number];

// Mapeamento kind→nível: os kinds PlantUML deste projeto não incluem ER/sequence, então o
// nível Interface/DataModel é coberto pelos diagramas comportamentais (activity = fluxo nas
// interfaces; state = ciclo de vida do dado), que especificam o contrato dinâmico do sistema.
const KIND_LEVEL: Record<DesignKind, DesignLevel> = {
  component: "high_level", // visão macro de componentes do sistema
  deployment: "high_level", // topologia/infra de alto nível
  package: "package", // organização em módulos/pacotes
  class: "class", // desenho de classes
  activity: "interface_data_model",
  state: "interface_data_model",
};

const LEVEL_LABEL: Record<DesignLevel, string> = {
  high_level: "High Level", package: "Package", class: "Class", interface_data_model: "Interface/DataModel",
};

// Shape relevante do retorno de engine.checkSyntax (@plantuml/mcp-js).
export type SyntaxCheck = UmlSyntaxCheck;

export type DesignErrorCode =
  | "invalid_kind"
  | "empty_doc"
  | "missing_design_md"
  | "missing_diagram"
  | "missing_level"
  | "decision_required"
  | "plantuml_invalid"
  | "kind_mismatch";

export type DesignError = { code: DesignErrorCode; path?: string; message: string; line?: number };

// Erro de domínio que carrega as falhas estruturadas ({ errors: [...] } na borda CLI).
export class DesignGateError extends DomainError {
  readonly errors: DesignError[];
  constructor(errors: DesignError[]) {
    super(errors.map((error) => `${error.code}: ${error.message}`).join("; "));
    this.name = "DesignGateError";
    this.errors = errors;
  }
}

export function parseDesignKind(raw: string): DesignKind {
  if (!(DESIGN_KINDS as readonly string[]).includes(raw)) {
    throw new DesignGateError([
      { code: "invalid_kind", message: `kind inválido "${raw}" — use: ${DESIGN_KINDS.join(", ")}` },
    ]);
  }
  return raw as DesignKind;
}

// diagramType ausente no retorno do engine → aceita (heurística documentada da spec).
export function kindAccepts(kind: DesignKind, diagramType?: string): boolean {
  return UmlArtifact.accepts(kind, diagramType);
}

export function requireNonEmptyDoc(content: string): void {
  if (content.trim().length === 0) {
    throw new DesignGateError([{ code: "empty_doc", message: "design.md vazio ou só whitespace — nada gravado" }]);
  }
}

export function plantumlError(path: string, check: SyntaxCheck): DesignError {
  return {
    code: "plantuml_invalid",
    path,
    message: check.errorMessage ?? "PlantUML inválido",
    ...(check.errorLineNumber === undefined ? {} : { line: check.errorLineNumber }),
  };
}

export type DesignDiagram = { kind: DesignKind; path: string; check: SyntaxCheck };

// Gate Design→AWAITING, ramificado pela decisão de arquitetura (architecture_changed):
//  - null/undefined: decisão ausente — exige a escolha explícita (erro claro).
//  - false: atalho ao plano — dispensa diagramas e aceite humano (só o plano, cobrado à parte).
//  - true: exige os 4 níveis cobertos por PlantUML válido (o forçar-AWAITING é da camada de app).
// Vazio = pronto. Acumula TODAS as falhas.
export function evaluateDesignGate(
  changed: boolean | null | undefined, doc: string | null, diagrams: DesignDiagram[],
): DesignError[] {
  if (changed === null || changed === undefined) {
    return [{ code: "decision_required",
      message: "decisão de arquitetura ausente — use 'issues design changed --issue <id> --value true|false'" }];
  }
  if (!changed) return []; // sem mudança de arquitetura: só o plano (cobrado à parte), sem diagramas
  return evaluateArchitectureLevels(doc, diagrams);
}

// Arquitetura mudou: design.md presente, cada .puml válido e os 4 níveis cobertos (só diagramas
// válidos contam para a cobertura). Lista os níveis faltantes.
function evaluateArchitectureLevels(doc: string | null, diagrams: DesignDiagram[]): DesignError[] {
  const errors: DesignError[] = [];
  if (doc === null || doc.trim().length === 0) {
    errors.push({ code: "missing_design_md", message: "design.md ausente ou vazio — use 'issues design doc'" });
  }
  for (const diagram of diagrams) if (!diagram.check.valid) errors.push(plantumlError(diagram.path, diagram.check));
  const covered = new Set(diagrams.filter((d) => d.check.valid).map((d) => KIND_LEVEL[d.kind]));
  const missing = DESIGN_LEVELS.filter((level) => !covered.has(level));
  if (missing.length > 0) {
    errors.push({ code: "missing_level",
      message: `níveis de arquitetura não cobertos: ${missing.map((l) => LEVEL_LABEL[l]).join(", ")} — adicione um diagrama de cada nível` });
  }
  return errors;
}

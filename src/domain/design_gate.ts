import { DomainError } from "./domain_error.js";

// Regras puras do gate de Design (sem I/O): kinds aceitos, heurística
// kind↔diagramType (decisão D3 da spec) e avaliação da entrega.
export const DESIGN_KINDS = ["class", "component", "package", "activity", "state", "deployment"] as const;
export type DesignKind = (typeof DESIGN_KINDS)[number];

// Shape relevante do retorno de engine.checkSyntax (@plantuml/mcp-js).
export type SyntaxCheck = {
  valid: boolean;
  diagramType?: string;
  errorLineNumber?: number;
  errorMessage?: string;
};

export type DesignErrorCode =
  | "invalid_kind"
  | "empty_doc"
  | "missing_design_md"
  | "missing_diagram"
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

// D3 — verificado empiricamente: o engine não distingue component/package/deployment
// (todos DescriptionDiagram) e reporta activity como ActivityDiagram3.
const KIND_ACCEPTS: Record<DesignKind, (diagramType: string) => boolean> = {
  class: (type) => type === "ClassDiagram",
  state: (type) => type === "StateDiagram",
  activity: (type) => type.startsWith("ActivityDiagram"),
  component: (type) => type === "DescriptionDiagram",
  package: (type) => type === "DescriptionDiagram",
  deployment: (type) => type === "DescriptionDiagram",
};

// diagramType ausente no retorno do engine → aceita (heurística documentada da spec).
export function kindAccepts(kind: DesignKind, diagramType?: string): boolean {
  return diagramType === undefined || KIND_ACCEPTS[kind](diagramType);
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

// Gate Design→AWAITING: acumula TODAS as falhas (doc presente e não vazio,
// ≥1 diagrama, cada diagrama com sintaxe válida). Vazio = pronto para AWAITING.
export function evaluateGate(doc: string | null, diagrams: { path: string; check: SyntaxCheck }[]): DesignError[] {
  const errors: DesignError[] = [];
  if (doc === null || doc.trim().length === 0) {
    errors.push({ code: "missing_design_md", message: "design.md ausente ou vazio — use 'issues design doc'" });
  }
  if (diagrams.length === 0) {
    errors.push({ code: "missing_diagram", message: "nenhum diagrama .puml — use 'issues design add'" });
  }
  for (const diagram of diagrams) {
    if (!diagram.check.valid) errors.push(plantumlError(diagram.path, diagram.check));
  }
  return errors;
}

import { DomainError } from "../domain_error.js";
import type { ArtifactDefinition } from "./artifact.js";

export const UML_KINDS = ["class", "component", "package", "activity", "state", "deployment"] as const;
export type UmlKind = (typeof UML_KINDS)[number];
export type UmlSyntaxCheck = {
  valid: boolean; diagramType?: string; errorLineNumber?: number; errorMessage?: string;
};

const KIND_ACCEPTS: Record<UmlKind, (diagramType: string) => boolean> = {
  class: (type) => type === "ClassDiagram",
  state: (type) => type === "StateDiagram",
  activity: (type) => type.startsWith("ActivityDiagram"),
  component: (type) => type === "DescriptionDiagram",
  package: (type) => type === "DescriptionDiagram",
  deployment: (type) => type === "DescriptionDiagram",
};

export const UmlArtifact = {
  type: "uml" as const,
  parseKind(raw: string): UmlKind {
    if (!(UML_KINDS as readonly string[]).includes(raw)) {
      throw new DomainError(`kind inválido "${raw}" — use: ${UML_KINDS.join(", ")}`);
    }
    return raw as UmlKind;
  },
  validate(kind: UmlKind, check: UmlSyntaxCheck): void {
    if (!check.valid) throw new DomainError(check.errorMessage ?? "PlantUML inválido");
    if (check.diagramType !== undefined && !KIND_ACCEPTS[kind](check.diagramType)) {
      throw new DomainError(`kind "${kind}" não corresponde ao diagrama detectado "${check.diagramType}"`);
    }
  },
  accepts(kind: UmlKind, diagramType?: string): boolean {
    return diagramType === undefined || KIND_ACCEPTS[kind](diagramType);
  },
} satisfies ArtifactDefinition;

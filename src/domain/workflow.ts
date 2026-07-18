import type { ArtifactType } from "./artifact.js";
import type { ActionType } from "./value_objects.js";

export type Workflow = {
  action: ActionType; name: string; requiredArtifacts: ArtifactType[];
};

const WORKFLOWS: Record<ActionType, Workflow> = {
  Planning: { action: "Planning", name: "Requirement Engineering", requiredArtifacts: ["requirements", "prd"] },
  Design: { action: "Design", name: "Design", requiredArtifacts: ["plan"] },
  Implement: { action: "Implement", name: "Unit of Work", requiredArtifacts: [] },
  QA: { action: "QA", name: "Quality Review", requiredArtifacts: ["doc"] },
  Deploy: { action: "Deploy", name: "Merge/PR Analysis", requiredArtifacts: [] },
};

export function workflowFor(action: ActionType): Workflow { return structuredClone(WORKFLOWS[action]); }

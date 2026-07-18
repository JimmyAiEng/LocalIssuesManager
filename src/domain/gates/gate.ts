import type { ArtifactType } from "../artifacts/artifact.js";
import type { ActionType } from "../value_objects.js";

export type RequirementMode = "none" | "required" | "conditional";
export type ConditionalArtifacts = { types: ArtifactType[]; condition: string };
export type ArtifactGateRequirement = {
  mode: RequirementMode;
  types: ArtifactType[];
  conditional?: ConditionalArtifacts;
};
export type ExecutionGateRequirement = { mode: RequirementMode; description?: string; condition?: string };
export type HumanGateRequirement = { mode: RequirementMode; condition?: string };

export type GateDefinition = {
  action: ActionType;
  name: string;
  artifacts: ArtifactGateRequirement;
  codeExecution: ExecutionGateRequirement;
  humanApproval: HumanGateRequirement;
};

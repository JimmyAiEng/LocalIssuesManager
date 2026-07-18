import type { ActionType } from "../value_objects.js";
import { DEPLOY_GATE } from "./deploy_gate.js";
import { DESIGN_GATE } from "./design_gate.js";
import type { GateDefinition } from "./gate.js";
import { IMPLEMENT_GATE } from "./implement_gate.js";
import { PLANNING_GATE } from "./planning_gate.js";
import { QA_GATE } from "./qa_gate.js";

const GATES: Record<ActionType, GateDefinition> = {
  Planning: PLANNING_GATE,
  Design: DESIGN_GATE,
  Implement: IMPLEMENT_GATE,
  QA: QA_GATE,
  Deploy: DEPLOY_GATE,
};

export function gateFor(action: ActionType): GateDefinition { return structuredClone(GATES[action]); }
export * from "./deploy_gate.js";
export * from "./design_gate.js";
export * from "./gate.js";
export * from "./gate_policy.js";
export * from "./implement_gate.js";
export * from "./planning_gate.js";
export * from "./qa_gate.js";

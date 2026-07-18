import type { GateDefinition } from "./gate.js";

export const PLANNING_GATE: GateDefinition = {
  action: "Planning",
  name: "Requirement Engineering",
  artifacts: { mode: "required", types: ["requirement"] },
  codeExecution: { mode: "none" },
  humanApproval: { mode: "conditional", condition: "tags de autonomia" },
};

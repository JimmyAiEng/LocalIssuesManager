import type { GateDefinition } from "./gate.js";

export const IMPLEMENT_GATE: GateDefinition = {
  action: "Implement",
  name: "Unit of Work",
  artifacts: { mode: "none", types: [] },
  codeExecution: { mode: "none" },
  humanApproval: { mode: "conditional", condition: "tags de autonomia" },
};

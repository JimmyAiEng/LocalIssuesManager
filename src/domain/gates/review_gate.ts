import type { GateDefinition } from "./gate.js";

export const REVIEW_GATE: GateDefinition = {
  action: "Review",
  name: "Quality Review",
  artifacts: { mode: "required", types: ["document"] },
  codeExecution: { mode: "none" },
  humanApproval: { mode: "conditional", condition: "tags de autonomia" },
};

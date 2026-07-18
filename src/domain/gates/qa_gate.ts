import type { GateDefinition } from "./gate.js";

export const QA_GATE: GateDefinition = {
  action: "QA",
  name: "Quality Review",
  artifacts: { mode: "required", types: ["document"] },
  codeExecution: { mode: "none" },
  humanApproval: { mode: "conditional", condition: "tags de autonomia" },
};

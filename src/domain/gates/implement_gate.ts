import type { GateDefinition } from "./gate.js";

export const IMPLEMENT_GATE: GateDefinition = {
  action: "Implement",
  name: "Unit of Work",
  artifacts: { mode: "none", types: [] },
  codeExecution: { mode: "conditional", description: "ordem TDD e checks do projeto",
    condition: "testPaths, checks ou check configurados no projeto" },
  humanApproval: { mode: "conditional", condition: "tags de autonomia" },
};

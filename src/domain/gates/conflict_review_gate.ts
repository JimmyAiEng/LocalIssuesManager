import type { GateDefinition } from "./gate.js";

// Clona a FORMA do Quality Review (não o conteúdo): documento obrigatório, sem execução de código e
// aceite humano condicional às tags de autonomia. É o passo que reconcilia os Designs irmãos
// concorrentes antes de decompor em Implement, evitando conflitos de merge entre agentes.
export const CONFLICT_REVIEW_GATE: GateDefinition = {
  action: "ConflictReview",
  name: "Conflict Review",
  artifacts: { mode: "required", types: ["document"] },
  codeExecution: { mode: "none" },
  humanApproval: { mode: "conditional", condition: "tags de autonomia" },
};

import type { Tags } from "./value_objects.js";

export type GateViolation = { code: string; message: string };
export type GateAssessment =
  | { outcome: "approved" }
  | { outcome: "human-required"; reasons: string[] }
  | { outcome: "rejected"; violations: GateViolation[] };
export type GateFacts = { violations?: GateViolation[]; forceHuman?: string };

export function assessGate(tags: Tags, facts: GateFacts = {}): GateAssessment {
  if (facts.violations?.length) return { outcome: "rejected", violations: facts.violations };
  const reasons = humanReasons(tags, facts.forceHuman);
  return reasons.length ? { outcome: "human-required", reasons } : { outcome: "approved" };
}

function humanReasons(tags: Tags, forced?: string): string[] {
  const reasons: string[] = [];
  if (tags.human_need === "HITL") reasons.push("human_need=HITL");
  if (tags.risk === "ALTO") reasons.push("risk=ALTO");
  if (tags.complexity === "ALTA") reasons.push("complexity=ALTA");
  if (forced) reasons.push(forced);
  return reasons;
}

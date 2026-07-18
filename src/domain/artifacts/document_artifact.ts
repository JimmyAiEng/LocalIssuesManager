import { randomUUID } from "node:crypto";
import { DomainError } from "../domain_error.js";
import { assertBrief } from "../value_objects.js";
import type { ArtifactData, ArtifactDefinition, ArtifactInput } from "./artifact.js";

export const DocumentArtifact = {
  type: "document" as const,
  create(input: ArtifactInput, now = new Date()): ArtifactData {
    validateMetadata(input);
    return { ...input, id: randomUUID(), type: "document", created_at: now.toISOString() };
  },
  validate(content: string): void { assertBrief(content, "document"); },
} satisfies ArtifactDefinition;

function validateMetadata(input: ArtifactInput): void {
  if (!input.issueId.trim()) throw new DomainError("issueId is required");
  if (!input.name.trim()) throw new DomainError("filename is required");
  if (input.size <= 0) throw new DomainError("Artifact size must be positive");
}

export const ARTIFACT_TYPES = ["media", "document", "requirement", "uml", "implementation-plan"] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export type ArtifactData = {
  id: string;
  issueId: string;
  type: ArtifactType;
  name: string;
  size: number;
  created_at: string;
};

export type TextArtifactType = Exclude<ArtifactType, "media">;
export type ArtifactInput = { issueId: string; name: string; size: number };
export type ArtifactDefinition = {
  readonly type: ArtifactType;
  readonly [operation: string]: unknown;
};

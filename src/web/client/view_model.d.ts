export type IssueCard = {
  id: string; title: string; project: string; tag: string; status: string;
  created_at: string; status_changed_at?: string; phases?: { timestamp: string }[];
};

export type CreateValues = {
  title: string; project: string; tag: string; problem: string;
  artifacts: string; acceptance_criteria: string;
};

export type TransitionValues = {
  comment: string; closed_reason?: string; status?: "OPEN" | "CLOSED";
};

export type ValidationResult<T> = { ok: boolean; values: T; errors: Record<string, string> };

export const STATUSES: string[];
export const TAGS: string[];
export const CLOSED_REASONS: string[];
export function filterIssues(issues: IssueCard[], filters: { title: string; project: string; tag: string }): IssueCard[];
export function groupIssues(issues: IssueCard[]): Record<string, IssueCard[]>;
export function statusAge(issue: IssueCard, now?: Date): string;
export function options(issues: IssueCard[], property: "project" | "tag"): string[];
export function humanActions(status: string): string[];
export function validateCreate(values: CreateValues): ValidationResult<CreateValues>;
export function validateClose(values: TransitionValues): ValidationResult<TransitionValues>;
export function validateReset(values: TransitionValues): ValidationResult<TransitionValues>;
export function validateDecide(values: TransitionValues): ValidationResult<TransitionValues>;
export function classifyMutationError(status: number, message: string): { kind: "conflict" | "error"; message: string };

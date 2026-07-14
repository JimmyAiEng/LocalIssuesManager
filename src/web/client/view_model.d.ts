export type IssueCard = {
  id: string; title: string; project: string; type: string; status: string;
  created_at: string; status_changed_at?: string; phases?: { timestamp: string }[];
};

export type TicketCard = {
  status: string; owner: string | null;
};

export type CreateValues = {
  title: string; project: string; type: string; problem: string;
  artifacts: string; acceptance_criteria: string;
};

export type CreateTicketValues = {
  objective: string; task: string; acceptance_criteria: string; type: string;
  artifacts: string; references: string;
};

export type TransitionValues = {
  comment: string; closed_reason?: string; status?: "OPEN" | "CLOSED" | "AWAITING";
};

export type ValidationResult<T> = { ok: boolean; values: T; errors: Record<string, string> };

export const ISSUE_STATUSES: string[];
export const ISSUE_TYPES: string[];
export const TICKET_TYPES: string[];
export const CLOSED_REASONS: string[];
export function filterIssues(issues: IssueCard[], filters: { title: string; project: string; type: string }): IssueCard[];
export function groupIssues(issues: IssueCard[]): Record<string, IssueCard[]>;
export function statusAge(issue: IssueCard, now?: Date): string;
export function parseChecklist(text: string): { done: boolean; label: string }[];
export function options(issues: IssueCard[], property: "project" | "type"): string[];
export function humanActions(status: string): string[];
export function ticketHumanActions(ticket: TicketCard): string[];
export function canCreateTicket(status: string): boolean;
export function validateCreate(values: CreateValues): ValidationResult<CreateValues>;
export function validateCreateTicket(values: CreateTicketValues): ValidationResult<CreateTicketValues>;
export function validateClose(values: TransitionValues): ValidationResult<TransitionValues>;
export function validateReset(values: TransitionValues): ValidationResult<TransitionValues>;
export function validateDecide(values: TransitionValues): ValidationResult<TransitionValues>;
export function validateTicketStatus(values: TransitionValues): ValidationResult<TransitionValues>;
export function attachmentsMarkup(attachments: { id: string; kind: string; filename: string }[] | undefined): string;
export function classifyMutationError(status: number, message: string): { kind: "conflict" | "error"; message: string };

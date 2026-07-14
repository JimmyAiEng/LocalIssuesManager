export const state = {
  issues: [], filters: loadFilters(), refreshedAt: null,
  issue: null, draft: emptyDraft(), panel: null,
  ticketPanel: null, ticketDraft: emptyTicketDraft(), showTicketForm: false,
  commentPanel: null, commentDraft: emptyCommentDraft(),
  feedback: null, errors: {}, busy: false,
};

export function loadFilters() { return JSON.parse(sessionStorage.getItem("issues.filters") ?? '{"title":"","project":"","type":""}'); }
export function saveFilters() { sessionStorage.setItem("issues.filters", JSON.stringify(state.filters)); }
export function emptyDraft() { return { title: "", project: "", type: "", problem: "", artifacts: "", acceptance_criteria: "", comment: "", closed_reason: "", complexity: "", human_need: "", risk: "" }; }
export function emptyTicketDraft() { return { type: "", objective: "", task: "", acceptance_criteria: "", artifacts: "", references: "", human_need: "" }; }
export function emptyCommentDraft() { return { comment: "" }; }
export function clearActionState() { state.panel = null; state.ticketPanel = null; state.showTicketForm = false; state.commentPanel = null; state.commentDraft = emptyCommentDraft(); state.errors = {}; state.feedback = null; state.busy = false; }

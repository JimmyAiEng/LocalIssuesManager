export const state = {
  issues: [], filters: loadFilters(), refreshedAt: null, decisionsOpen: false,
  issue: null, requirements: null, draft: emptyDraft(), panel: null,
  ticketPanel: null, ticketDraft: emptyTicketDraft(), showTicketForm: false,
  commentPanel: null, commentDraft: emptyCommentDraft(),
  confirmClose: false, threadExpanded: false,
  feedback: null, errors: {}, busy: false,
};

export function emptyFilters() { return { title: "", project: "", type: "", owner: "" }; }
export function loadFilters() { return { ...emptyFilters(), ...JSON.parse(sessionStorage.getItem("issues.filters") ?? "{}") }; }
export function saveFilters() { sessionStorage.setItem("issues.filters", JSON.stringify(state.filters)); }
export function emptyDraft() { return { title: "", project: "", type: "", problem: "", artifacts: "", acceptance_criteria: "", comment: "", closed_reason: "", complexity: "", human_need: "", risk: "" }; }
export function emptyTicketDraft() { return { type: "", objective: "", task: "", acceptance_criteria: "", artifacts: "", references: "", human_need: "" }; }
export function emptyCommentDraft() { return { comment: "" }; }
export function clearActionState() { state.panel = null; state.ticketPanel = null; state.showTicketForm = false; state.commentPanel = null; state.commentDraft = emptyCommentDraft(); state.confirmClose = false; state.errors = {}; state.feedback = null; state.busy = false; }

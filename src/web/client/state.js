export const state = {
  issues: [], projects: [], filters: loadFilters(), refreshedAt: null, decisionsOpen: false,
  issue: null, requirements: null, design: null, draft: emptyDraft(), panel: null,
  commentPanel: null, commentDraft: emptyCommentDraft(), projectDraft: emptyProjectDraft(),
  confirmClose: false, threadExpanded: false,
  // Chaves dos <details> abertos (data-details-id). Fora do DOM porque renderDetail reescreve
  // innerHTML inteiro; sem isso a expansão morre a cada re-render. Não é estado de ação:
  // clearActionState não a limpa — só a troca de Issue (loadDetail), cujas chaves são de outra.
  expanded: new Set(),
  feedback: null, errors: {}, busy: false,
};

export function emptyFilters() { return { title: "", project: "", type: "", owner: "" }; }
function loadFilters() { return { ...emptyFilters(), ...JSON.parse(sessionStorage.getItem("issues.filters") ?? "{}") }; }
export function saveFilters() { sessionStorage.setItem("issues.filters", JSON.stringify(state.filters)); }
export function emptyDraft() { return { title: "", project: "", type: "", action: "", problem: "", acceptance_criteria: "", comment: "", closed_reason: "", complexity: "", human_need: "", risk: "" }; }
export function emptyCommentDraft() { return { comment: "" }; }
export function emptyProjectDraft() { return { name: "", repo: "", check: "" }; }
export function clearActionState() { state.panel = null; state.commentPanel = null; state.commentDraft = emptyCommentDraft(); state.confirmClose = false; state.errors = {}; state.feedback = null; state.busy = false; }

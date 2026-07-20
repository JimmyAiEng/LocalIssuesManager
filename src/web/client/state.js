export const state = {
  // sidebarOpen fica fora de loadFilters de propósito: não persiste, o quadro sempre abre com a sidebar visível.
  issues: [], projects: [], filters: loadFilters(), refreshedAt: null, sidebarOpen: true,
  issue: null, requirements: null, design: null, documents: null, draft: emptyDraft(), panel: null,
  commentPanel: null, commentDraft: emptyCommentDraft(), projectDraft: emptyProjectDraft(),
  confirmClose: false, confirmDelete: false, threadExpanded: false,
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
export function emptyProjectDraft() { return { name: "", repo: "", concern: "LOW" }; }
export function clearActionState() { state.panel = null; state.commentPanel = null; state.commentDraft = emptyCommentDraft(); state.confirmClose = false; state.confirmDelete = false; state.errors = {}; state.feedback = null; state.busy = false; }

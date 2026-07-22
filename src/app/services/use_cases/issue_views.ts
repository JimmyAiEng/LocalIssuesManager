import type { ImplementationPlan } from "../../../domain/artifacts/implementation_plan_artifact.js";
import type { Feature } from "../../../domain/artifacts/requirement_artifact.js";
import type { Issue, IssueData, Phase } from "../../../domain/issue_entity.js";
import type { ConcernLevel, Queue } from "../../../domain/queue_repository.js";
import type { ActionType, RelationKind, Tags, Thread } from "../../../domain/value_objects.js";
import { readPlanForView } from "./plan_use_cases.js";
import { designFeatures } from "./requirements_use_cases.js";

// Read-model: projeções de leitura das Issues (view das relacionadas, cadeia de ancestrais, resumo do
// quadro), separadas dos comandos em issue_use_cases.ts. Sem escrita — só monta o que o prompt/web/CLI leem.

export type RelatedView = { id: string; title: string; status: string; action: ActionType; artifact: string | null; kind: RelationKind; plan?: ImplementationPlan | null; thread?: Thread[] };
export type IssueView = IssueData & { artifact: string | null; related: RelatedView[]; ancestors: RelatedView[]; features?: Feature[] | null; plan?: ImplementationPlan | null; concern?: ConcernLevel };

export type IssueSummary = {
  id: string; title: string; project: string; type: string; action: ActionType; status: string;
  owner: string | null; closed_reason: string | null; created_at: string;
  status_changed_at: string; phases: Phase[]; tags: Tags; relates: string[];
};

// Injeta o Artefato .md, a view das relacionadas (com seus artefatos) e a cadeia de ancestrais (parent): quem reivindica recebe a linhagem sem buscar cada Issue.
export function issueView(queue: Queue, issue: Issue): IssueView {
  return { ...issue.toJSON(), artifact: queue.artifacts.readText(issue.project, { issueId: issue.id, type: "document" }),
    related: issue.relates.flatMap((r) => relatedView(queue, r.id, r.kind)), features: designFeatures(queue, issue),
    ancestors: ancestorChain(queue, issue), plan: readPlanForView(queue, issue.project, issue.id), // plan = Small Plan da própria Issue
    concern: queue.readProject(issue.project)?.concern ?? "LOW" }; // piso de supervisão do Projeto: ramifica o contrato de Planning/Design no prompt
}

function relatedView(queue: Queue, id: string, kind: RelationKind): RelatedView[] {
  const related = queue.load(id); // relacionada purgada → omitida da view
  if (!related) return [];
  return [{ id: related.id, title: related.title, status: related.status, action: related.action,
    artifact: queue.artifacts.readText(related.project, { issueId: related.id, type: "document" }), kind,
    plan: readPlanForView(queue, related.project, related.id), // plano do Design pai viaja ao filho Implement
    thread: related.thread }]; // thread da linhagem: o Review a lê como fonte da intenção original
}

// Cadeia de ancestrais: sobe pelo primeiro parent de cada nível (Planning→Design→Implement é linear); o guard de visitados corta ciclos.
// ponytail: só o primeiro parent por nível; fan-in com múltiplos parents fica fora da cadeia.
function ancestorChain(queue: Queue, issue: Issue): RelatedView[] {
  const chain: RelatedView[] = [];
  const seen = new Set([issue.id]);
  let current: Issue | null = issue;
  while (current) {
    const parent = current.relates.find((r) => r.kind === "parent" && !seen.has(r.id));
    if (!parent) break;
    seen.add(parent.id);
    const [view] = relatedView(queue, parent.id, "parent");
    if (!view) break; // parent purgado: a cadeia para aqui
    chain.push(view);
    current = queue.load(parent.id);
  }
  return chain;
}

export function summary(issue: Issue): IssueSummary {
  return { id: issue.id, title: issue.title, project: issue.project, type: issue.type,
    action: issue.action, status: issue.status, owner: issue.owner, closed_reason: issue.closed_reason,
    created_at: issue.created_at, status_changed_at: issue.status_changed_at,
    phases: structuredClone(issue.phases), tags: structuredClone(issue.tags),
    relates: issue.relates.map((r) => r.id) }; // o quadro só precisa dos ids das relacionadas
}

import { DomainError } from "../../../domain/domain_error.js";
import type { Issue } from "../../../domain/issue_entity.js";
import { Queue } from "../../../domain/queue_repository.js";

// Remove uma Issue sob demanda: apaga JSON, artefatos e mídia, sem volta.
// Trava: a Issue e todo o fecho transitivo de `relates` precisam estar CLOSED —
// remover um nó de uma linhagem ainda viva perderia contexto de quem continua trabalhando.
export function deleteIssue(input: { issueId: string }, root?: string): { id: string } {
  const queue = new Queue(root);
  const issue = queue.loadRequired(input.issueId);
  requireClosedTree(queue, issue);
  queue.purge(issue);
  return { id: issue.id };
}

// BFS sobre `relates` nos DOIS sentidos, ignorando o kind: `create --relates` grava a aresta só na Issue
// nova, então olhar apenas as de saída deixa a linhagem viva invisível ao pai. O Set de visitados garante
// terminação sem teto artificial de profundidade; Issue ausente do disco não entra (relates pendente não bloqueia).
// ponytail: varre a fila inteira uma vez por remoção — remoção é rara e manual; indexar se doer.
function requireClosedTree(queue: Queue, root: Issue): void {
  const all = queue.list();
  const visited = new Set([root.id]);
  const pending = [root];
  for (let index = 0; index < pending.length; index += 1) {
    const issue = pending[index] as Issue;
    if (issue.status !== "CLOSED") {
      throw new DomainError(`Issue ${issue.id} está em ${issue.status}: só remove com a árvore de relates toda CLOSED`);
    }
    const neighbours = all.filter((other) => !visited.has(other.id)
      && (issue.relates.some((r) => r.id === other.id) || other.relates.some((r) => r.id === issue.id)));
    for (const neighbour of neighbours) {
      visited.add(neighbour.id);
      pending.push(neighbour);
    }
  }
}

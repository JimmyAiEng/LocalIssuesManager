# Worktree/sandbox por Issue — contrato mínimo

Isola o trabalho de cada Issue em uma git worktree própria, registrada na Issue.
Desmembrado de bd4a7c84 (que entregou só as dependências entre Tickets).

## Contrato

A worktree é criada e limpa por CLI, não por hook de harness.
O path fica gravado na própria Issue, num campo `worktree` anulável.

### `issues worktree add --id <issueId> [--path <p>]`

Roda `git worktree add <path> -b <branch>` no repositório do projeto atual (o `cwd` do comando).
Grava o resultado (`path` absoluto e `branch`) no campo `worktree` da Issue.
Path padrão: `.worktrees/<issueId>` (resolvido para absoluto contra o `cwd`).
Branch padrão: `issue/<short-id>` (os 8 primeiros caracteres do id).
Idempotente: se a Issue já tem `worktree`, devolve a existente sem tocar no git.

### `issues worktree remove --id <issueId>`

Roda `git worktree remove <path> --force` e limpa o campo `worktree` da Issue.
Idempotente: sem `worktree`, não faz nada.

## Todos os Tickets resolvem para a mesma worktree

O path mora **na Issue**, não no Ticket.
Qualquer Ticket resolve a worktree lendo `issue.worktree` — mesma worktree por construção, sem duplicar estado.
`issues get` devolve o campo `worktree` (`{ path, branch }` ou `null`).

## Estratégia de limpeza

A limpeza é o passo `worktree remove`, executado quando a Issue chega a `CLOSED`.
O humano decide `CLOSED` (`issues decide`); em seguida um agente ou humano roda `issues worktree remove --id <issueId>`.
Não há limpeza automática: acoplar o `remove` ao `decide CLOSED` obrigaria o domínio a shellar `git`, o que fica fora do agregado.
`setWorktree` é bloqueado em Issue `CLOSED` (não se abre worktree para trabalho encerrado); `clearWorktree` é permitido em qualquer status, para que a limpeza pós-`CLOSED` funcione.
Se a worktree já tiver sido apagada manualmente, `git worktree remove` falha; rode `git worktree prune` no repositório para reconciliar e então `worktree remove` limpa o campo.

## Fora de escopo (YAGNI)

Hook de harness que cria a worktree antes do trabalho: o CLI cobre; adicione quando um loop autônomo precisar disparar sozinho.
Limpeza automática no `decide CLOSED`: exigiria git no domínio; mantida manual e documentada acima.

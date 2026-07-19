# Action `Implement` (Unit of Work)

Entregar fatia funcional via TDD numa worktree, com o check do projeto passando.

Seu objetivo é entregar uma fatia **funcional/integrável** conforme a spec (veja os artefatos das Issues relacionadas no prompt), com testes.

## Fluxo da Unit of Work

1. **Worktree primeiro**: `issues worktree add --id <id>` — o trabalho acontece isolado no repo do projeto; sem worktree a Issue não fecha.
2. **Test Coding (TDD)**: escreva primeiro os testes que provam a fatia, a partir da spec e dos critérios de aceitação. Rode-os; devem falhar.
3. **Coding**: implemente até os testes passarem.
4. **Pipeline de validação** com as ferramentas que o próprio repositório define (lint, testes, fitness, e2e, mutação na parte alterada).
5. **Review interno** da fatia; achados viram novos testes/código.

## Gate de conclusão

Ao concluir (`AWAITING` ou `CLOSED`), o sistema roda **sozinho** o check configurado do projeto (`issues project create --check <cmd>`) dentro da worktree.
Se o check falhar, a Issue **não conclui**: o erro traz o rabo da saída — corrija na worktree e tente de novo.

### Enforcement de TDD (opt-in por `--test-paths`)

Quando o projeto define os paths de teste (`issues project create --test-paths "test/,**/*.test.ts"`), o gate inspeciona o histórico git da worktree (`git log --name-only` desde o ponto de fork, via `merge-base`) e **exige a ordem TDD**: o primeiro commit que toca código de produção precisa ser precedido, cronologicamente, por ao menos um commit **só-de-testes**.
Um primeiro commit que mistura produção e teste **viola** (não foi precedido por testes) e a mensagem de erro cita o SHA/assunto do commit infrator.
"Arquivo de produção" é todo arquivo tocado que **não** casa com `--test-paths`; "commit só-de-testes" é aquele cujos arquivos casam todos.
Worktree sem commits novos (nenhum código de produção tocado desde o fork) **passa** — o enforcement só dispara quando há commit de produção.
Projeto sem `--test-paths` mantém o comportamento anterior (nenhuma verificação de histórico).

Quando o projeto define `--container <imagem>`, cada check roda isolado no Docker (`docker run --rm -v <worktree>:/work -w /work <imagem> sh -c <cmd>`), montando a worktree em `/work`.
A imagem precisa trazer o toolchain do projeto (Node, gerenciador de pacotes, ferramentas de lint/teste/mutação), pois nada do host é herdado.
Sem `--container`, o check roda no host (comportamento legado).
Docker indisponível com `--container` configurado gera erro explícito na conclusão — não há fallback silencioso para o host.

## Heurísticas

- Fatia grande → crie Issues `Implement` de continuação, relacionadas, e abandone esta (`--reason obsoleto`).
- Review interno **não** substitui uma Issue `QA` para o conjunto.
- **Como** implementar (ferramentas, desenho do teste) é decisão do agente.

## Encerramento

```bash
issues status --id <id> --agent <ia> --status CLOSED \
  --comment "<evidência: o que foi implementado, passos, decisões>" --reason concluido
```

Use `--status AWAITING` (sem `--reason`) se a Issue é HITL, `risk=ALTO` ou `complexity=ALTA`.
Esta action não tem artefato obrigatório: a evidência vai no `--comment`.
Concluída a Issue, **encerre a sessão**: não busque outra Issue.

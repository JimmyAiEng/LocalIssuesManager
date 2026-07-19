# Action `Implement` (Unit of Work)

Entregar uma fatia funcional/integrável conforme a spec, com validação feita pelas ferramentas do próprio repositório.

Seu objetivo é entregar uma fatia **funcional/integrável** conforme a spec (veja os artefatos das Issues relacionadas no prompt), validada.
O issue-manager **orquestra** o trabalho: ele não cria worktree, não força TDD e não roda check nenhum por você.
O **como** implementar (worktree, desenho do teste, ferramentas) é decisão do agente.

## Fluxo da Unit of Work

1. **Isole o trabalho (recomendado)**: trabalhe numa worktree/branch própria do repo do projeto — `git worktree add ../<fatia> -b issue/<id>`.
   É orientação, não obrigação: o CLI não cria a worktree nem exige uma para concluir.
2. **Implemente a fatia** até ela ficar funcional e integrável conforme a spec.
   Escrever os testes antes (TDD) é uma boa prática, mas ninguém a força aqui.
3. **Valide com as ferramentas do próprio repositório** (lint, testes, fitness, build, e2e, mutação na parte alterada — o que o repo oferecer).
   O CLI não executa nada disso: rode você mesmo e guarde o resultado para a evidência.
4. **Review interno** da fatia; achados viram novos testes/código.

## Gate de conclusão

Esta action não tem artefato obrigatório e o CLI não executa código: o gate cobra apenas a **evidência** da conclusão.
A evidência (`--comment`) é um relatório curto do que foi implementado, o que você rodou para validar e o resultado.
Sem worktree, sem check automático, sem verificação de histórico TDD — nada disso bloqueia o fechamento; a qualidade da fatia é sua responsabilidade e será cobrada na Review do conjunto.

## Heurísticas

- Fatia grande → crie Issues `Implement` de continuação, relacionadas, e abandone esta (`--reason obsoleto`).
- Review interno **não** substitui uma Issue `Review` para o conjunto.
- **Como** implementar (ferramentas, desenho do teste, uso de worktree) é decisão do agente.

## Encerramento

```bash
issues status --id <id> --agent <ia> --status CLOSED \
  --comment "<evidência: o que foi implementado, como validou, decisões>" --reason concluido
```

Use `--status AWAITING` (sem `--reason`) se a Issue é HITL, `risk=ALTO` ou `complexity=ALTA`.
Esta action não tem artefato obrigatório: a evidência vai no `--comment`.
Concluída a Issue, **encerre a sessão**: não busque outra Issue.

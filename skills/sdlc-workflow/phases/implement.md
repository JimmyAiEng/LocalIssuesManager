# Action `Implement` (Unit of Work)

Entregar uma fatia funcional/integrável conforme a spec, com validação feita pelas ferramentas do próprio repositório.

Seu objetivo é entregar uma fatia **funcional/integrável** conforme a spec (veja os artefatos das Issues relacionadas no prompt), validada.
O issue-manager **orquestra** o trabalho: ele não cria worktree, não força TDD e não roda check nenhum por você.
O **como** implementar (worktree, desenho do teste, ferramentas) é decisão do agente.

## Fluxo da Unit of Work

1. **Isole o trabalho (obrigatório)**: cada fatia trabalha numa worktree própria, ramificada de `origin/main` atualizado, para dois ou mais agentes não colidirem no mesmo working copy.

   ```bash
   git fetch origin
   git worktree add ../<id> -b <type>/<id> origin/main   # ex.: feat/39a1eb97
   ```

   O `<type>` é o type da Issue em minúsculas (`feat` · `fix` · `refactor` · `research`); o `<id>` é único, então a branch nunca colide com a de outra fatia da mesma família.
   O CLI não cria a worktree nem verifica isso na conclusão — é regra de processo, cobrada mais à frente pela evidência do PR único no Deploy —, mas pular o isolamento é o que faz os trabalhos se misturarem: não pule.
2. **Implemente a fatia** até ela ficar funcional e integrável conforme a spec.
   Escrever os testes antes (TDD) é uma boa prática, mas ninguém a força aqui.
3. **Valide com as ferramentas do próprio repositório** (lint, testes, fitness, build, e2e, mutação na parte alterada — o que o repo oferecer).
   O CLI não executa nada disso: rode você mesmo e guarde o resultado para a evidência.
4. **Review interno** da fatia; achados viram novos testes/código.

## Gate de conclusão

Esta action não tem artefato obrigatório e o CLI não executa código: o gate cobra apenas a **evidência** da conclusão.
A evidência (`--comment`) é um relatório curto do que foi implementado, o que você rodou para validar e o resultado — inclua o nome da branch `<type>/<id>` onde a fatia ficou.
Sem check automático, sem verificação de histórico TDD — nada disso bloqueia o fechamento; a qualidade da fatia é sua responsabilidade e será cobrada na Review do conjunto.
O isolamento em worktree é regra (veja o Fluxo), mas o CLI não o verifica: quem cobra o PR único é o Deploy.

## Heurísticas

- Fatia grande → crie Issues `Implement` de continuação, relacionadas, e abandone esta (`--reason obsoleto`).
- Review interno **não** substitui uma Issue `Review` para o conjunto.
- **Como** implementar (ferramentas, desenho do teste) é decisão do agente; **isolar em worktree de `origin/main`** não é — é regra (veja o Fluxo).

## Refactor

O gate **não** diverge por type: `Implement` cobra a mesma evidência para `Fix`, `Feat`, `Research` e `Refactor`.
O que muda numa Issue `type=Refactor` é a disciplina da fatia — o Refactor não muda funcionalidade:

- **Não altere teste e2e.** Se o comportamento externo não muda, os e2e não deveriam mudar. A Review de Refactor reprova diff que mexe em e2e (`phases/review.md`) — se você precisou alterar um, o comportamento mudou: pare e trate como mudança de escopo.
- A suíte existente é o seu critério: rode-a **antes** e **depois** e cite os dois resultados na evidência. Verde→verde sem editar teste é o que prova que não houve regressão.
- Teste novo é bem-vindo (cobrir o que a refatoração expôs); teste **alterado** para acomodar a mudança é sinal de regressão.
- Comportamento que você quis mudar no meio do caminho vira Issue nova relacionada — nunca entra de carona no Refactor.

## Encerramento

```bash
issues status --id <id> --agent <ia> --status CLOSED \
  --comment "<evidência: o que foi implementado, como validou, decisões>" --reason concluido
```

Esta action não tem artefato obrigatório: a evidência vai no `--comment`.
Se a Issue é HITL, `risk=ALTO` ou `complexity=ALTA`, use `--status AWAITING` (sem `--reason`) — e **grave o `handoff.md` antes**, senão o comando falha (veja "Handoff" na camada 0):

```bash
issues artifact --id <id> --name handoff.md --file ./handoff.md
issues status --id <id> --agent <ia> --status AWAITING --comment "<evidência>"
```
Concluída a Issue, **encerre a sessão**: não busque outra Issue.

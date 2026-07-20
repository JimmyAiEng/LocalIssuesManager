# Action `Review`

Validar o CONJUNTO entregue pelas Issues relacionadas (≠ review interno de Implement).
Você tem a responsabilidade de estressar e encontrar falhas no que foi entregue.

## Sequência (workflow do diagrama)

Execute nesta ordem.
Cada etapa grava um documento, e **só se avança quando a etapa anterior não encontrou problema**.

1. **Understand Intent** — leia as threads (as sessões de chat com o humano que originaram a mudança) e os artefatos das Issues Planning e Design da linhagem.
   É onde a mudança foi pedida e desenhada.
   Registre a intenção compreendida em `intent.md`.
2. **Rebase com a base do projeto** (prd/hml/dev) para revisar contra o estado real de integração.
3. **Conflict Check** — verifique conflitos de integração após o rebase.
   Grave o que verificou em uma `evidence-*.md`.
4. **Adversarial Check** — só se o Conflict Check **não** achou problema.
   Estresse a solução contra cada requisito e critério de aceitação (rodar > ler), procurando falhas.
   Grave o que verificou em outra `evidence-*.md`.
5. **CI Pipeline** — só se o Adversarial Check **não** achou problema.
   Rode o check do projeto sobre o conjunto integrado.

Achou problema em qualquer etapa (conflito, falha adversarial, CI vermelho)?
Não avance para a etapa seguinte: o veredito é REPROVADO e o problema vira retrabalho (veja abaixo).

## Refactor (Diff Check em vez de Understand Intent)

Numa Issue `type=Refactor` a etapa 1 muda: em vez de *Understand Intent*, faça o **Diff Check** — o Refactor não muda funcionalidade, então o foco é caçar **regressão** (bug/vulnerabilidade introduzido pela mudança), não confirmar intenção. No `intent.md`, registre o diff analisado e o que garante que o comportamento não mudou. Invariantes do Refactor a verificar:

- **Mudança de interface** (assinatura pública, contrato) exige ter sido **aprovada por humano** — se apareceu sem aceite, é REPROVADO.
- **Mudança em teste e2e não é permitida** em Refactor: se o comportamento externo não muda, os e2e não deveriam mudar. Teste e2e alterado ⇒ REPROVADO.

As etapas 2–5 (Rebase, Conflict, Adversarial, CI) seguem iguais.

## Documentos e veredito (o gate exige)

O gate `validateReview` só conclui a Issue com o conjunto persistido; sem ele o encerramento falha dizendo o que falta.

- `intent.md` — a intenção compreendida (≤300 palavras).
  `issues artifact --id <id> --name intent.md --file <f>`
- ao menos duas `evidence-*.md` — o que foi verificado, aprovado e reprovado em cada etapa (cada uma ≤300 palavras).
  `issues artifact --id <id> --name evidence-<n>.md --file <f>`
- o **veredito** no artefato legado (sem `--name`), começando por APROVADO | APROVADO com ressalva | REPROVADO (≤300 palavras).
  `issues artifact --id <id> --file artifact.md`

Esqueleto do veredito.
A **primeira palavra do conteúdo** é o veredito: o gate lê a palavra inicial (regex `^\p{L}+`) e recusa qualquer coisa antes dela.
Não ponha título `# Veredito` nem `#` na frente — o artefato começa pela própria palavra do veredito.
Escolha uma: `APROVADO`, `APROVADO com ressalva` (a primeira palavra conta como APROVADO) ou `REPROVADO`.

```markdown
REPROVADO

## Requisito × comportamento

- Feature "<nome>" / <cenário>: OK — <o que você observou rodando>
- Feature "<nome>" / <cenário>: FALHA — <o que aconteceu de fato>

## Achados

- <achado + a Issue de retrabalho criada, ou "Nenhum">
```

## Retrabalho (vínculo obrigatório no REPROVADO)

Veredito REPROVADO só conclui com retrabalho **vivo**.
Crie ao menos uma Issue `Implement` ou `Design` **fora de CLOSED** e vincule-a a esta Review (`--relates <id>` no create, ou `issues relate`).
É a Issue viva que carrega o conserto — distinta das Issues revisadas, já fechadas.
APROVADO (com ou sem ressalva) conclui direto.

## Heurísticas

- **Não** trate isto como o review interno de Implement; a action Review valida o conjunto.
- Preferir **outro** harness/modelo que o da implementação — recomendado, não obrigatório.
- **Como** validar (perspectivas, ferramentas, cobertura) é decisão do agente.

## Encerramento

```bash
issues status --id <id> --agent <ia> --status CLOSED \
  --comment "<veredito + achados>" --reason concluido
```

Use `--status AWAITING` (sem `--reason`) se a Issue é HITL, `risk=ALTO` ou `complexity=ALTA`.
**Toda saída por `AWAITING` exige o `handoff.md` gravado antes** — `issues artifact --id <id> --name handoff.md --file ./handoff.md` —, senão o `status` falha (veja "Handoff" na camada 0).
Concluída a Issue, **encerre a sessão**: não busque outra Issue.

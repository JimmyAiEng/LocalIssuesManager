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
   Revise sobre a branch integrada — `integration/<parent-id>` quando houve mais de uma fatia (a Issue de integração a criou), ou a única `<type>/<id>` quando a fatia foi única.
3. **Conflict Check** — verifique conflitos de integração após o rebase.
   Grave o que verificou em uma `evidence-*.md`.
4. **Adversarial Check** — só se o Conflict Check **não** achou problema.
   Estresse a solução contra cada requisito e critério de aceitação (rodar > ler), procurando falhas.
   Grave o que verificou em outra `evidence-*.md`.
5. **CI Pipeline** — só se o Adversarial Check **não** achou problema.
   Rode o check do projeto sobre o conjunto integrado.

Achou problema em qualquer etapa (conflito, falha adversarial, CI vermelho)?
Não avance para a etapa seguinte: o veredito é REPROVADO.
O retrabalho **não** é criado agora — veja "Retrabalho" abaixo para quando abrir as Issues de correção.

## Refactor (Diff Check em vez de Understand Intent)

Numa Issue `type=Refactor` a etapa 1 muda: em vez de *Understand Intent*, faça o **Diff Check** — o Refactor não muda funcionalidade, então o foco é caçar **regressão** (bug/vulnerabilidade introduzido pela mudança), não confirmar intenção.

O Diff Check vai num documento próprio, `diff-check.md` (o `intent.md` **não** é cobrado em Refactor).
Ele começa por duas declarações em linha; o resto é prosa livre — o diff analisado e o que garante que o comportamento não mudou.

```markdown
interface_publica_alterada: <true|false>
teste_e2e_alterado: <true|false>
```

`issues artifact --id <id> --name diff-check.md --file <f>`

Valor `true|false`, uma declaração por linha, caixa livre, marcação de lista/negrito tolerada.
O bloco acima é **modelo, não declaração**: `<true|false>` é placeholder inválido de propósito — substitua pelo valor real, não cole o bloco por cima da sua declaração.
Faltando (ou com valor inválido) qualquer uma das duas, o encerramento falha nomeando a invariante.
Declarar a mesma invariante duas vezes com valores **conflitantes** (`true` e `false`) recusa o encerramento por ambiguidade, nomeando a invariante; repetição com o mesmo valor é tolerada.

**O sistema confia na declaração: ele nunca lê o diff.**
O issue-manager não executa nada no repositório do projeto — quem analisa o diff e classifica o que é "interface pública" (assinatura, contrato exposto a quem consome o código) é você.
A declaração é auto-reportada; o que o gate cobra é a **consequência** dela.

Invariantes do Refactor e o que o gate faz com cada uma, **só quando o veredito é APROVADO**:

- **Teste e2e alterado** (`teste_e2e_alterado: true`) — se o comportamento externo não muda, os e2e não deveriam mudar. O encerramento é recusado: o veredito é REPROVADO, e ele segue o fluxo da seção "Retrabalho".
- **Interface pública alterada** (`interface_publica_alterada: true`) — exige aceite humano. O encerramento só passa se alguma Issue `Design` da **cadeia de parents** desta Review tiver passado por `APPROVED` (a busca sobe os parents, então no 2º ciclo ela atravessa a Review anterior até o Design). Sem esse Design aprovado: relacione-o (`issues relate --id <id> --relates <design> --kind parent`) ou dê veredito REPROVADO.
- `interface_publica_alterada: false` não consulta a linhagem — interface intacta conclui sem Design aprovado nenhum.

Veredito REPROVADO não cobra nenhuma das duas consequências: o que ele exige é o retrabalho vivo no fechamento, igual para todo type.
As etapas 2–5 (Rebase, Conflict, Adversarial, CI) seguem iguais.

## Documentos e veredito (o gate exige)

O gate `validateReview` só conclui a Issue com o conjunto persistido; sem ele o encerramento falha dizendo o que falta.

- `intent.md` — a intenção compreendida (≤300 palavras).
  `issues artifact --id <id> --name intent.md --file <f>`
  Em `type=Refactor`, no lugar dele: `diff-check.md` com as duas declarações (veja a seção Refactor acima).
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

- <achado + o conserto que ele exige, ou "Nenhum">
```

Descreva o achado e o conserto que ele pede.
**Não** cite Issue de retrabalho criada: no caminho HITL ela ainda não existe quando você escreve o veredito.

## Retrabalho (o REPROVADO abre as Issues de correção **depois** do humano)

O veredito REPROVADO não vem acompanhado de retrabalho na mesma sessão em que é escrito.
Quem julga se a reprovação procede é o humano.

Caminho **HITL** (Issue HITL, `risk=ALTO` ou `complexity=ALTA`):

1. Grave o veredito REPROVADO, o `intent.md` (ou `diff-check.md`) e as evidências.
2. Vá para `AWAITING` **sem nenhuma Issue de correção criada**.
   A trava aqui é **mecânica** e não olha o `kind`: se existir qualquer Issue relacionada a esta Review com action `Implement` ou `Design` em `OPEN` ou `CLAIMED`, o `AWAITING` é recusado.
   `--relates` grava `see-also` por default, e nem assim a correção escapa da trava.
   Ela é segura porque as Issues revisadas estão sempre `CLOSED` — revisa-se trabalho terminado —, então relacionada viva só pode ser retrabalho criado cedo demais.
3. O humano decide no web.
   Aprovar um veredito REPROVADO significa que ele **concorda com a reprovação** — não que o conserto foi feito.
4. Com a Issue de volta em `APPROVED`, aí sim abra as Issues de correção: **só as `Implement`** que carregam o conserto.
   Vincule-as a esta Review (`--relates <id>` no create, ou `issues relate`) e feche.
5. Discordou da reprovação? O humano reabre a Review com `--status OPEN` apontando os erros da sua análise, e você refaz o trabalho.

Caminho **AFK**: nada muda — crie o retrabalho e feche na mesma sessão.

Nos dois caminhos, o gate do `CLOSED` cobra retrabalho **vivo**: ao menos uma Issue `Implement` ou `Design` relacionada a esta Review, em `OPEN` ou `CLAIMED`.
Issue de correção já `CLOSED` (ou em `AWAITING`/`APPROVED`) não conta — é a Issue viva que carrega o conserto, distinta das Issues revisadas, já fechadas.
APROVADO (com ou sem ressalva) não cobra retrabalho nenhum: conclui direto.

**Nunca crie a Review do próximo ciclo.**
Ela nasce sozinha: o sistema a cria automaticamente quando a última `Implement` irmã fecha por `concluido`, já ligada ao pai e às Implement concluídas.
E o gatilho **não dispara** enquanto existir Review irmã fora de `CLOSED`.
Criar a Review na mão, portanto, não adianta o ciclo seguinte — ela **trava** o ciclo, porque a sua própria existência impede o gatilho de rodar.
Abra as `Implement` do conserto e pare por aí.

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
Num veredito REPROVADO, escreva no handoff quais Issues `Implement` de correção você abrirá se o humano concordar com a reprovação: é o próximo passo concreto da sessão pós-`APPROVED`.

O gate se divide pelas duas saídas:

- **`AWAITING`** cobra o veredito, o `intent.md` (ou `diff-check.md`) e as ≥2 `evidence-*.md`, e recusa a Issue se existir qualquer relacionada `Implement`/`Design` viva — é o inverso exato do retrabalho vivo.
- **`CLOSED`** cobra o mesmo conteúdo **mais**, no veredito REPROVADO, esse mesmo retrabalho vivo.

Concluída a Issue, **encerre a sessão**: não busque outra Issue.

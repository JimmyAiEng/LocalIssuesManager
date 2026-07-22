# Action `ConflictReview`

Reconciliar as specs irmãs de um Planning com mais de um Design, resolver conflitos e decompor em Implement.

Você recebe no prompt os artefatos das Issues Design irmãs da linhagem — as specs congeladas dos vários grupos de Features do mesmo Planning.
Seu objetivo é confrontar essas propostas entre si, achar onde elas se contradizem ou se sobrepõem, e congelar **um** plano reconciliado que as Issues Implement possam herdar sem colidir.

## Quando esta action existe

A `ConflictReview` só nasce num Planning com **mais de um** Design vivo (não abandonado).
Planning de Design único **não** passa por aqui: aquele Design decompõe direto em Implement, como sempre (`phases/design.md`).

Ela é **criada pelo próprio sistema**, automaticamente, quando o **último** Design vivo de um Planning multi-Design fecha por `concluido` — já ligada ao Planning (`kind=parent`) e aos Designs concluídos (`see-also`).
**Não a crie na mão**: é o mesmo padrão da `Review` de qualidade, que o sistema cria quando a última Implement irmã fecha.
Criar uma ConflictReview por fora a deixaria aberta antes de existirem os Designs a reconciliar e bloquearia o gatilho, que não dispara com ConflictReview irmã fora de `CLOSED`.

## Por que ela existe

Dois Designs do mesmo Planning cobrem Features de conceitos diferentes, mas podem tocar **o mesmo código**: o mesmo módulo, a mesma tabela, o mesmo contrato exposto.
Cada Design congelou a sua fatia sem ver a do irmão.
A ConflictReview é o único ponto onde as propostas se olham juntas antes de virar código — sem ela, dois Implement de Designs diferentes chegariam à mesma linha com decisões incompatíveis, e o conflito só apareceria na Review de qualidade, tarde demais.

## Heurísticas

- **Estresse o conjunto, não cada Design isolado**: caça sobreposição de arquivos/módulos, contratos divergentes, ordem de dependência entre as fatias e decisões de arquitetura que se anulam.
- **Pacote de Design `CLOSED` é imutável**: você **não** edita as specs irmãs. A reconciliação vira material **seu** — o seu artefato e os seus Small Plans reconciliados.
- Quanto maior o risco/complexidade, mais alinhamento antes de congelar o plano reconciliado.
- **Como** reconciliar (perspectivas, ferramentas, cobertura) é decisão do agente.

## Entrega 1 — o Artefato da reconciliação (o veredito)

```bash
issues artifact --id <id> --file ./artifact.md
```

O **nome do arquivo em disco é irrelevante**; use `./artifact.md`.
Aqui **não** se passa `--name`: sem ele o comando grava o Artefato da Issue, que é o que se quer nesta entrega — e é este texto que viaja no prompt das Issues Implement filhas, então ele precisa estar gravado **antes** da decomposição.
Máximo 300 palavras.
Esqueleto:

```markdown
# Reconciliação

- Designs reconciliados: <grupo A>, <grupo B> — <o que cada um trazia>
- Decisão reconciliada: <o desenho unificado em 2 ou 3 linhas>

## Conflitos encontrados

- <arquivo/contrato em disputa> — <como foi resolvido, quem cede a quem>
- <ou "Nenhum: as fatias não se tocam">

## Fatias reconciliadas

1. <fatia que virou Issue Implement>
2. <fatia que virou Issue Implement>

## Riscos

- <risco remanescente, ou "Nenhum">
```

## Entrega 2 — uma Issue Implement por fatia reconciliada

O gate exige **ao menos uma filha `action=Implement` viva** (`OPEN` ou `CLAIMED`) na transição para `CLOSED`.
Filha `CLOSED`, `AWAITING` ou `APPROVED` não satisfaz o gate.

**No multi-Design, só a ConflictReview cria Implement.**
Os Designs irmãos, por serem um-de-vários, **não** decompõem em Implement (veja `phases/design.md`); o fan-out em Implement acontece aqui, uma única vez, sobre o plano já reconciliado.

**Quando decompor**: só no passo que **fecha** a Issue.

- Vai encerrar por `AWAITING` (HITL, `risk=ALTO`, `complexity=ALTA` ou Projeto `concern=HIGH`)?
  **Não decomponha agora**: a trava aqui é o inverso exato do retrabalho vivo — ir para `AWAITING` é recusado se já existir Implement filha em `OPEN`/`CLAIMED`, exatamente como na `Review` (`rejectEarlyRework`).
  Congele o artefato da reconciliação, envie para decisão humana e registre no `handoff.md` que a decomposição ficou pendente.
  Quando a Issue voltar `APPROVED`, decomponha e **só então** feche.
  Este é o caso da maioria das ConflictReviews, então trate a decomposição como passo pós-aprovação por padrão.
- Vai fechar direto por `CLOSED` (AFK)? Decomponha antes de fechar, na mesma sessão — o caminho AFK não muda.

Cada filha traz o seu **Small Plan reconciliado** no campo `plan` (mesmo formato do `plan.json`, obrigatório).
Como os pacotes de Design estão `CLOSED` e imutáveis, este plano é **seu**: escreva-o já reconciliado, não copie um Small Plan de um Design irmão que ignore o outro.

```bash
issues decompose --id <id> --into ./decompose.json --agent <ia>
```

```json
{
  "mode": "sequential",
  "children": [
    {
      "title": "Implement: sessão compartilhada entre login e busca",
      "type": "Feat",
      "action": "Implement",
      "problem": "Implementar o módulo de sessão que os dois Designs assumiam, com o contrato reconciliado.",
      "acceptance_criteria": "Login e busca usam a mesma sessão sem contrato divergente.",
      "plan": {
        "objetivo": "Unificar o módulo de sessão que os dois Designs tocavam.",
        "passos": [
          "Escrever os testes do contrato de sessão reconciliado.",
          "Implementar o módulo até os testes passarem."
        ],
        "arquivos": ["src/session/session.ts", "test/session/session.test.ts"],
        "criterio_pronto": "Testes do módulo verdes e check do projeto passando."
      }
    }
  ]
}
```

Fatie em Implements pequenos: cada um deve entregar uma fatia funcional/integrável.
`mode`: `sequential` encadeia as filhas para execução em ordem; `concurrent` (default) deixa-as independentes.
`decompose` já grava a linhagem parent/child recíproca — a Implement vira **filha da ConflictReview** —, não chame `relate` depois.

**Só `action=Implement`.**
A ConflictReview não cria a Issue `Review` de qualidade do conjunto: ela é criada **pelo próprio sistema**, automaticamente, quando a última Implement irmã fecha por `concluido` — a cadeia de qualidade segue depois, encadeada normalmente.
Criar uma Review aqui a deixaria aberta antes de existir o que revisar e ainda bloquearia o gatilho, que não dispara com Review irmã fora de `CLOSED`.

## Encerramento

```bash
issues status --id <id> --agent <ia> --status CLOSED \
  --comment "<evidência: conflitos encontrados, como reconciliou, fatias criadas>" --reason concluido
```

Autonomia padrão: AFK fecha direto, com evidência.
Issue HITL, `risk=ALTO`, `complexity=ALTA` ou Projeto `concern=HIGH`: use `--status AWAITING` (sem `--reason`) — o fechamento é do humano, via `decide` no web.

**Toda saída por `AWAITING` exige o `handoff.md` gravado antes** — e a ConflictReview sai por `AWAITING` na maioria dos casos, então é a regra e não a exceção nesta fase:

```bash
issues artifact --id <id> --name handoff.md --file ./handoff.md
issues status --id <id> --agent <ia> --status AWAITING --comment "<evidência>"
```

Sem ele o `status` falha com `Envio para AWAITING exige o handoff` (veja "Handoff" na camada 0).
O `--name handoff.md` **não** é opcional: sem `--name`, o comando grava o Artefato da reconciliação (Entrega 1), não o handoff — são arquivos distintos.
Como a decomposição é passo pós-`APPROVED`, cite no handoff (≤300 palavras) as fatias reconciliadas que virarão Issues Implement — é o próximo passo concreto de quem retomar.

O gate se divide pelas duas saídas:

- **`AWAITING`** cobra o artefato da reconciliação e recusa a Issue se já existir Implement filha viva — o fan-out vem depois da decisão humana (inverso exato do retrabalho vivo, como na `Review`).
- **`CLOSED`** cobra o mesmo conteúdo **mais** ao menos uma filha Implement viva (`OPEN` ou `CLAIMED`).

Concluída a Issue, **encerre a sessão**: não busque outra Issue.

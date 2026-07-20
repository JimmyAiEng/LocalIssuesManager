---
name: sdlc-workflow
description: >-
  SDLC de desenvolvimento com issues-local: modelo Issue-only (type + action),
  autonomia AFK/HITL, gates por action, evidência obrigatória e linhagem entre
  Issues. Use ao reivindicar ou trabalhar qualquer Issue devolvida por `issues next`.
---

# sdlc-workflow (camada 0)

**Não** executa nenhuma fase — só orienta o processo e roteia o guia da action.
Válido em **qualquer projeto** que use este pack + o CLI `issues` do issues-local.

## Modelo: só Issues

Uma **Issue** é a unidade de trabalho de uma sessão: pequena, com uma entrega única.

- **type** diz o problema: `Fix` · `Feat` · `Research` · `Refactor`.
- **action** diz a entrega esperada: `Planning` · `Design` · `Implement` · `Review` · `Deploy`.
- Status: `OPEN → CLAIMED → (AWAITING → APPROVED →) CLOSED`.
- `AWAITING` é a entrega para decisão humana; o `decide` humano no web devolve `APPROVED` (siga) ou fecha a Issue.
- Issue reivindicável é a que está em `OPEN` **ou** `APPROVED`: a aprovada **reentra na fila sem dono** para a sessão seguinte continuar a partir do handoff. `issues next --prompt` pode, portanto, te entregar uma Issue já trabalhada — não é erro.
- Issue `OPEN` só chega até você pelo claim de `issues next` — é ele que entrega o contrato da action junto. `issues get` recusa id em `OPEN`: não dá para contornar o claim com `list` + `get` e trabalhar uma Issue que ninguém reivindicou.
- Trabalho maior vira **novas Issues relacionadas** (`--relates`), nunca uma Issue gorda.
- Não há validação de sequência entre actions: você pode criar uma Issue `Implement` sem `Design` anterior — siga o roteamento e os gates descritos nesta skill.

## Linhagem (relates)

Issues podem se relacionar (`issues relate` ou `--relates` no create).
Quem reivindica uma Issue recebe no prompt os **artefatos das relacionadas** — é assim que o design congelado chega à sessão de implementação.
Ao decompor trabalho, crie as novas Issues já relacionadas à origem.
**Quando** decompor é regra de processo — veja a seção seguinte.

## Ordem do fan-out (as filhas vêm depois do humano)

No caminho **HITL** a decomposição é o **último** passo, e acontece **depois** da aprovação humana:

`CLAIMED` → grave os artefatos, **sem criar filha** → `AWAITING` → o humano decide → `APPROVED` → **agora** crie as filhas → `CLOSED`.

- **Ir para `AWAITING` com filha já criada é recusado**, em qualquer action.
  Só conta a relação `kind=child` (a que o `issues decompose` grava); `see-also` e `parent` são ignorados.
- **Na `Review` a trava é outra**, porque o retrabalho é criado com `--relates` (default `see-also`) e escaparia da regra acima.
  Lá a recusa é o **inverso exato** do retrabalho vivo: ir a `AWAITING` é barrado se existir Issue relacionada — de **qualquer** kind — com action `Implement` ou `Design` em `OPEN`/`CLAIMED`.
  É seguro porque as Issues revisadas estão sempre `CLOSED`: relacionada viva só pode ser retrabalho criado cedo demais.
- **Exceção**: uma Issue que já passou por `APPROVED` pode voltar a `AWAITING` mesmo com filhas — o humano já interveio uma vez, e sem isso ela ficaria presa.
- **Fechar exige a filha viva**: a cobrança de filhas roda na transição para `CLOSED` e só aceita filha em `OPEN` ou `CLAIMED`.
  Filha `CLOSED`, `AWAITING` ou `APPROVED` não satisfaz o gate.
- **Abandono** (`--reason obsoleto|duplicado|errado`) pula tudo isso, como pula qualquer outro gate.
- **AFK não muda**: quem fecha direto (`CLAIMED → CLOSED`) entrega os artefatos **e** as filhas na mesma conclusão.

Quem sai por `AWAITING` registra no `handoff.md` que a decomposição ficou pendente.
É a sessão pós-`APPROVED` que a executa, e só então fecha a Issue.

## Workflow por type

O `type` da Issue escolhe a jornada; a `action` é a fase dentro dela.

- **`Feat`** — jornada completa: `Planning → Design → Implement → Review → Deploy`.
- **`Refactor`** — refatorar sem mudar funcionalidade. **Começa no Design** (não tem Planning — o sistema recusa `Refactor`+`Planning`). O Design **sempre passa pelo engenheiro** (nunca fecha AFK, nem com `architecture_changed=false`). O Review foca em **regressão** (bug/vulnerabilidade introduzido), não em intenção: troca o `intent.md` pelo `diff-check.md`, onde você **declara** se a interface pública mudou e se algum teste e2e mudou. O sistema confia na declaração — ele nunca lê o diff —, mas cobra a consequência dela no encerramento com veredito APROVADO: e2e alterado não conclui (o veredito é REPROVADO) e interface alterada só conclui havendo um Design `APPROVED` na cadeia de parents da Review. Ao fim de um `Fix`, a melhoria arquitetural adiada vira uma Issue `Refactor` relacionada.
- **`Fix`** — mais direto (hot-fix). Guias próprios ainda não separados; siga o guia da action e a ênfase de causa-raiz.

O gate só diverge por type em **dois** pontos, e os guias dessas fases têm a seção correspondente: `phases/design.md` (o Design de Refactor nunca fecha AFK) e `phases/review.md` (Diff Check em vez de Understand Intent).
`phases/implement.md` tem uma seção **Refactor** de disciplina — não de gate: o CLI trata `Implement` igual para todo type.
`phases/planning.md` e `phases/deploy.md` **não** têm seção Refactor porque não divergem: Refactor nem chega ao Planning (o create é recusado) e o Deploy é idêntico para todo type.

## Roteamento por action

Cada action tem um guia **dentro desta skill**, em `phases/`.
Leia o arquivo da action reivindicada — ele traz o workflow, a entrega obrigatória (gate de conclusão) e os formatos exatos dos arquivos que a fase grava.

| action | Leia o arquivo |
|---|---|
| `Planning` | `phases/planning.md` |
| `Design` | `phases/design.md` |
| `Implement` | `phases/implement.md` |
| `Review` | `phases/review.md` |
| `Deploy` | `phases/deploy.md` |

## Qualificação (no claim)

Se a Issue reivindicada não tem `complexity` e `risk`, classifique antes de trabalhar: `issues tag --id <id> --complexity … --risk … --agent <ia>`.
A IA só **escala** tags; rebaixar supervisão é prerrogativa humana.
Se a Issue for grande demais para uma sessão, crie as Issues menores relacionadas e **abandone** esta com `--reason obsoleto` (veja "Correções").

## Autonomia e conclusão

- **AFK (padrão)**: a IA fecha direto — `issues status --id <id> --agent <ia> --status CLOSED --comment "<evidência>" --reason concluido`.
- **HITL**, `risk=ALTO` ou `complexity=ALTA`: a IA **não fecha**; envia para decisão humana — `issues status … --status AWAITING --comment "<evidência>"` — e o humano decide no painel web.
- **Projeto `concern=HIGH`**: piso de supervisão do Projeto — Planning e Design **não fecham por agente**, só por `--status AWAITING` (a decisão é humana, no web), mesmo em Issue AFK.
- Como `concern` é piso e não teto, `concern=LOW` (ou Projeto sem o campo) não muda nada: Planning/Design seguem a regra AFK/HITL acima.
- O gate da action roda nas duas saídas (AWAITING e CLOSED) quando `--reason` é `concluido` ou está ausente; sem a entrega, o comando falha explicando o que falta.
- O gate se divide: os **artefatos** (requisitos, spec, plano, veredito, evidência de PR) são cobrados nas duas saídas — o humano precisa deles para julgar —, enquanto as **filhas** são cobradas só na saída por `CLOSED` (veja "Ordem do fan-out").
- **Toda saída por `AWAITING` exige o `handoff.md`** — veja a seção abaixo. Vale para **todas** as actions, inclusive `Implement`, que não tem outro artefato obrigatório.
- **Abandono**: `--reason obsoleto|duplicado|errado` **pula o gate** da action — a Issue abandonada não tem entrega a cobrar, e também não exige handoff.
- **Pós-`APPROVED`**: uma vez aprovada pelo humano, a Issue pode ser fechada pelo agente (`--status CLOSED --reason concluido`) mesmo sendo HITL, `risk=ALTO`, `complexity=ALTA` ou `action=Deploy` — o humano já decidiu; as travas de supervisão saem do caminho para não prender o agente num loop `AWAITING → APPROVED → AWAITING`. O gate da entrega da action continua valendo.
  É nesta sessão pós-`APPROVED` que a decomposição acontece: crie as filhas e só então feche.

## Handoff (obrigatório em toda saída por `AWAITING`)

Enviar para decisão humana **exige** o documento `handoff.md` gravado **antes** do `issues status`:

```bash
issues artifact --id <id> --name handoff.md --file ./handoff.md
issues status --id <id> --agent <ia> --status AWAITING --comment "<evidência>"
```

Sem ele o comando falha com:
`Envio para AWAITING exige o handoff: grave-o com 'issues artifact --id <id> --name handoff.md --file <f>' antes de enviar para decisão humana`.

- O `--name handoff.md` é obrigatório: **sem** `--name`, `issues artifact` grava o Artefato legado da Issue (aquele que viaja no prompt das filhas), **não** o handoff. São dois arquivos distintos.
- Conteúdo livre em Markdown, **≤300 palavras**. Ele existe para a sessão seguinte: escreva o que foi feito, o que ficou pendente e qual é o próximo passo concreto.
- **Regravar substitui**: retomou uma Issue `APPROVED` e vai devolvê-la a `AWAITING`? Regrave o `handoff.md` com o estado novo — o antigo não serve mais.
- **Ao reivindicar uma Issue `APPROVED`, leia o handoff com `issues handoff --id <id>`**: ele **não** viaja no prompt de `issues next`. O subcomando imprime o Markdown cru (não JSON); se a Issue não tiver handoff, ele falha dizendo como gravá-lo. O arquivo também fica em `$ISSUES_ROOT/projects/<projeto>/artifacts/<id>/handoff.md` (`ISSUES_ROOT` default: `~/issues-manager`), mas o comando é o caminho oficial.
- O prompt do reclaim de uma Issue `APPROVED` já traz `issues handoff --id <id>` como passo 1 — siga o contrato que veio no prompt, não procure o handoff por conta própria.

## Correções (conserte seus próprios erros)

Errou ao criar uma Issue? Conserte, não deixe Issue órfã para trás.

**Linhagem errada / Issue órfã** — adote a órfã depois do fato:

```bash
issues relate --id <órfã> --relates <pai> --kind parent
```

Grava o par recíproco (a órfã vira `child` do pai).
A linhagem é gravável mesmo com Issues já **CLOSED**: dá para adotar uma órfã sob um pai fechado.
Só o conteúdo (comment/tag/status) fica imutável após CLOSED — `relate` é a exceção.

**Issue criada errada, duplicada ou obsoleta** — reivindique e abandone:

```bash
issues next --id <id> --agent <ia>
issues status --id <id> --agent <ia> --status CLOSED --reason errado \
  --comment "Criada por engano: <o quê> — substituída pela Issue <id>."
```

`--reason`: `errado` (criada errada) · `duplicado` (já existe outra) · `obsoleto` (não faz mais sentido).
Issue **HITL**, `risk=ALTO`, `complexity=ALTA` ou `action=Deploy` não fecha pela IA nem no abandono: use `--status AWAITING --reason errado` e deixe o humano decidir no web.

**Título ou problema errado**: não existe comando de edição — abandone a Issue e crie a correta.

## Limite de tamanho (300 palavras)

Todo texto (problema, artefato, comentário, evidência) é limitado a **300 palavras**; requisitos, a **5 Features**.
Se o sistema rejeitar por tamanho, o remédio nunca é resumir à força: crie Issues menores relacionadas e **abandone** esta (veja "Correções").

## Comandos (issues-local)

```text
issues project create --name <p> --repo <path> [--concern LOW|HIGH]   # registra projeto (nome + repositório git, que viaja no prompt do agente)
issues project list
issues create --title <t> --project <p> --type <T> --action <A> --problem <txt>
              [--acceptance-criteria <c>] [--relates a,b] [--artifact-file <a.md>]
              [--complexity …] [--risk …] [--human-need HITL|AFK] --agent <ia>
issues next --prompt --project <p> --agent <ia>      # reivindica a Issue mais antiga aberta do projeto
issues next --id <id> --agent <ia>                   # reivindica uma Issue específica
issues get --id <id> [REQUIREMENTS|DESIGN|PLAN]      # recusa Issue OPEN: reivindique antes com `issues next`
issues list [--status --project --type --title]
issues comment --id <id> --comment <t> --agent <ia> [--attach <arquivo>] [--role <papel>]
issues tag --id <id> [--complexity …] [--risk …] [--human-need …] --agent <ia>
issues relate --id <id> --relates <a,b> [--kind parent|child|see-also]   # linhagem entre Issues (default see-also)
issues decompose --id <id> --into <arquivo.json> --agent <ia>  # fan-out: cria as filhas (Design por grupo de Features / Implement por Small Plan)
issues artifact --id <id> --file <a.md>              # grava/substitui o Artefato .md da Issue (≤300 palavras; o nome do arquivo em disco é irrelevante)
issues artifact --id <id> --name handoff.md --file <f>   # grava um documento nomeado; handoff.md é exigido em toda saída por AWAITING
issues handoff --id <id>                             # imprime o handoff.md cru (Markdown, não JSON) — leia ao retomar uma Issue APPROVED
issues status --id <id> --agent <ia> --status AWAITING|CLOSED --comment <evidência> [--reason <r>] [--role <papel>]
issues requirements set --id <id> --file <req.jsonl> # Features estruturadas, uma por linha (entrega de Planning)
issues design doc --issue <id> --file <f>             # documento de Design (entrega de Design)
issues design add --issue <id> --kind <k> --file <f>  # diagrama; --kind é obrigatório aqui
issues design changed --issue <id> --value true|false        # decisão de arquitetura (entrega de Design)
issues plan set --id <id> --file <plan.json>         # plano de implementação (entrega de Design)
```

`HITL` = human in the loop (a conclusão é decisão humana, no web).
`AFK` = away from keyboard (a IA fecha sozinha, com evidência).
Detalhes de sintaxe: `issues --help`.
`--agent` pode receber: pi | claude-code | codex | cursor 

## Progressive disclosure (obrigatório)

1. Você está na camada 0 (este arquivo) — carregue-o em todo claim.
2. **Leia o arquivo da action** da Issue reivindicada (tabela acima): `phases/<action>.md`, dentro do diretório desta skill.
   É uma **leitura de arquivo** — não é skill, não é subagente, não é slash command.
   Sem ele você não sabe o formato dos arquivos que a fase grava, e vai errar em loop.
3. Não conseguiu ler o arquivo? **Pare e reporte** — não improvise o formato.
4. O guia da action diz o que a fase entrega e como concluí-la; o **como** executar é decisão do agente.
5. **Não** leia os guias das outras actions neste claim.

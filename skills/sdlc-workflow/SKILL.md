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
- Status: `OPEN → CLAIMED → (AWAITING →) CLOSED`.
- Issue `OPEN` só chega até você pelo claim de `issues next` — é ele que entrega o contrato da action junto. `issues get` recusa id em `OPEN`: não dá para contornar o claim com `list` + `get` e trabalhar uma Issue que ninguém reivindicou.
- Trabalho maior vira **novas Issues relacionadas** (`--relates`), nunca uma Issue gorda.
- Não há validação de sequência entre actions: você pode criar uma Issue `Implement` sem `Design` anterior — siga o roteamento e os gates descritos nesta skill.

## Linhagem (relates)

Issues podem se relacionar (`issues relate` ou `--relates` no create).
Quem reivindica uma Issue recebe no prompt os **artefatos das relacionadas** — é assim que o design congelado chega à sessão de implementação.
Ao decompor trabalho, crie as novas Issues já relacionadas à origem.

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
- A **evidência é obrigatória**: um relatório curto do que foi feito, os passos e as decisões tomadas.
- O gate da action roda nas duas saídas (AWAITING e CLOSED) quando `--reason` é `concluido` ou está ausente; sem a entrega, o comando falha explicando o que falta.
- **Abandono**: `--reason obsoleto|duplicado|errado` **pula o gate** da action — a Issue abandonada não tem entrega a cobrar.

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
issues project create --name <p> --repo <path> [--container <img>] [--check <cmd>] [--test-paths <csv>]   # registra projeto (repo + check de Implement; --container = imagem Docker com o toolchain, roda cada check isolado; --test-paths liga o enforcement de TDD)
issues project list
issues create --title <t> --project <p> --type <T> --action <A> --problem <txt>
              [--acceptance-criteria <c>] [--relates a,b] [--artifact-file <a.md>]
              [--complexity …] [--risk …] [--human-need HITL|AFK] --agent <ia>
issues next --prompt --project <p> --agent <ia>      # reivindica a Issue mais antiga aberta do projeto
issues next --id <id> --agent <ia>                   # reivindica uma Issue específica
issues get --id <id> [REQUIREMENTS|DESIGN|PLAN]      # recusa Issue OPEN: reivindique antes com `issues next`
issues list [--status --project --type --title]
issues comment --id <id> --comment <t> [--attach <arquivo>] [--role <papel>]
issues tag --id <id> [--complexity …] [--risk …] [--human-need …] --agent <ia>
issues relate --id <id> --relates <a,b> [--kind parent|child|see-also]   # linhagem entre Issues (default see-also)
issues decompose --id <id> --into <arquivo.json> --agent <ia>  # fan-out: cria as filhas (Design por grupo de Features / Implement por Small Plan)
issues artifact --id <id> --file <a.md>              # grava/substitui o Artefato .md (≤300 palavras; o nome do arquivo é irrelevante)
issues status --id <id> --agent <ia> --status AWAITING|CLOSED --comment <evidência> [--reason <r>] [--role <papel>]
issues worktree add|remove --id <id>                 # worktree git no repo do projeto
issues requirements set --id <id> --file <req.jsonl> # Features estruturadas, uma por linha (entrega de Planning)
issues design doc|add --issue <id> [--kind <k>] --file <f>   # entrega de Design
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

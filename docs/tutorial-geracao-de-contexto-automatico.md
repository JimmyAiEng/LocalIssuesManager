# Tutorial — Geração de Contexto Automático (`issues next --prompt`)

## O que foi feito

O comando `issues next` passou a aceitar a flag `--prompt`.
Com ela, em vez de devolver JSON (`{ issue, ticket }`), o comando devolve um **prompt em Markdown já pronto** para o agente.
O prompt é montado de forma **determinística** a partir do estado da fila — sem carregar skills nem ler arquivos em runtime.

Sem a flag, o contrato JSON antigo permanece **intacto** (retrocompatível).

## Por que foi feito assim

Antes, o agente dependia de progressive disclosure (carregar a skill certa por tipo de Ticket/Issue).
Mas qual prompt usar é **determinístico** dado o tipo da Issue e o tipo do Ticket.
Então o próprio sistema passa a montar o prompt, embutindo os textos como **constantes no código** (seed condensado das skills atuais).
Isso é o primeiro passo para eliminar as skills — a deleção dos diretórios fica como passo manual posterior, como decidido no gate G1.

## Como o prompt é composto

O prompt tem até 5 seções, sempre nesta ordem:

1. `## SDLC` — o modelo de workflow (constante `SDLC_PROMPT`).
2. `## Tipo da Issue` — texto por tipo (`Fix` · `Feat` · `Research` · `Refactor`).
3. `## Issue` — dados da Issue (título, tipo, status, problema, critérios, tags).
4. `## Tipo do Ticket` — texto por tipo (`Planning` · `Design` · `Implement` · `QA` · `Deploy` · `Confirmation`) — **só se houver Ticket**.
5. `## Ticket` — dados do Ticket (objetivo, tarefa, critérios, status, referências/artefatos se houver) — **só se houver Ticket**.

Quando `next` devolve apenas uma Issue para decompor (sem Ticket), as seções 4 e 5 são omitidas.

## Onde está no código

- `src/app/prompt_composition.ts` — camada app, sem I/O.
  - `SDLC_PROMPT`, `ISSUE_TYPE_PROMPTS`, `TICKET_TYPE_PROMPTS`: constantes de texto (seed das skills).
  - `composePrompt(issue, ticket?)`: função pura que monta o Markdown; omite as seções 4-5 quando não há Ticket.
- `src/cli.ts`:
  - `parseOptions` reconhece `prompt` como flag booleana.
  - `main()` desvia `next + --prompt` para `nextPrompt()` **antes** do caminho JSON, preservando o contrato antigo.
  - `claimNext()` centraliza o claim (usado por `next` JSON e por `nextPrompt`), sem duplicação.
  - `nextPrompt()` imprime o prompt via `stdout`; fila vazia → stdout vazio, exit 0.

## Como usar

```bash
# Prompt pronto (fila): próximo Ticket OPEN de uma Issue ON-GOING, senão claim de Issue OPEN
issues next --project <projeto> --agent <agente> --prompt

# Prompt de uma Issue específica
issues next --id <issue-id> --agent <agente> --prompt

# Contrato JSON antigo (sem a flag), inalterado
issues next --project <projeto> --agent <agente>
```

## Como foi verificado

- `test/app/prompt_composition.test.ts`: ordem das 5 seções, omissão das seções 4-5 sem Ticket, `ticket=null` tratado como ausente, cada `IssueType`/`TicketType` injeta seu texto, infos de Issue/Ticket presentes, references/artifacts omitidos quando vazios, determinismo.
- `test/cli/cli.test.ts`: `--prompt` na fila retorna Markdown (não JSON), `--prompt --id`, Ticket claimado inclui `## Ticket`, regressão do JSON sem a flag, fila vazia = stdout vazio e exit 0.
- Gate de qualidade completo verde: `typecheck` limpo, `lint` sem issues (37 arquivos), **179/179** testes passando.

## Critérios de aceitação da Issue — todos atendidos

- [x] `issues next --project <p> --agent <a> --prompt` retorna prompt em vez de JSON.
- [x] Informações do SDLC dentro do prompt (`## SDLC`).
- [x] Informações do Tipo da Issue dentro do prompt (`## Tipo da Issue`).
- [x] Informações da Issue dentro do prompt (`## Issue`).
- [x] Tipo de Ticket dentro do prompt **apenas** se houver Ticket (`## Tipo do Ticket`).
- [x] Informações do Ticket dentro do prompt **apenas** se houver Ticket (`## Ticket`).

## Passo manual restante (fora do escopo desta Issue)

Deletar os diretórios de skills (`.claude/skills/*`), agora que o `--prompt` cobre a geração de contexto.
Decidido no G1 como ação manual pós-validação — não faz parte desta entrega automatizada.

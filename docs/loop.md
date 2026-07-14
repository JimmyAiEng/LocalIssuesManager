# Loop autônomo (agnóstico de harness)

Roda a fila `issues-local` sem execução manual: a cada disparo, **drena** a fila — puxa itens (`issues next`) e dispara agentes concorrentes (até um limite), até não sobrar Ticket/Issue `OPEN`.
Cada item vai a um harness — `claude` (Claude Code), `codex`, `pi` ou qualquer comando — via prompt que segue `AGENTS.md` + `sdlc-workflow`.
Configurado inteiramente pela CLI `issues`; o agendamento vive no SO (systemd/cron).

## Conceitos

- **Harness** — runner registrado: `{ name, agent, command }`. `agent` é um dos `AGENT_IDS` (`cursor·claude-code·codex·pi`), usado no `issues next --agent`; `command` é o template de invocação e **deve** conter `{prompt}`.
- **Loop** — config de execução: `{ name, harness, project?, interval, concurrency }`. Diz qual harness usar, qual projeto trabalhar, com que intervalo e quantos agentes simultâneos.
- **Tick / dreno** — um disparo: `issues loop run --name <n>` esvazia a fila, mantendo até `concurrency` agentes rodando ao mesmo tempo, até `issues next` retornar `null`. A repetição (re-checar a cada intervalo) é do agendador, não de um laço interno.

## Passo a passo

```bash
# 1. Registrar um harness (uma vez por runner)
issues harness add --name claude --agent claude-code --command 'claude -p {prompt}'
issues harness add --name pi     --agent pi          --command 'pi -p {prompt} --no-session'
issues harness list

# 2. Configurar um loop (harness + projeto + intervalo + concorrência)
issues loop add --name pi-dev --harness claude --project pi-dev --interval 1h --concurrency 3
issues loop list

# 3. Agendar
issues loop install --name pi-dev          # gera unit systemd (user) e imprime o enable
issues loop install --name pi-dev --now    # gera e já habilita o timer
issues loop install --name pi-dev --cron   # em vez de systemd, imprime a linha de crontab

# 4. (opcional) drenar a fila à mão agora
issues loop run --name pi-dev
```

`--interval` aceita `30s`, `30m`, `1h` (`s|m|h`). `--concurrency` é opcional (**default 3**). Projeto ausente = fila global.

## O que o dreno faz

A cada disparo, em laço até esvaziar:

1. Enquanto há menos de `concurrency` agentes rodando, puxa o próximo item: `issues next --agent <harness.agent> [--project <loop.project>]`.
2. Fila vazia (`null`) e nada rodando → encerra (`result=empty` se nada foi feito).
3. Cada item vira um agente: o `{prompt}` (instruções `AGENTS.md`+`sdlc-workflow` + regras de fechamento + item em JSON) é injetado como **um único argumento** — o conteúdo do item (aspas, `$`, `;`) não escapa para o shell.
4. Quando um agente termina, seu slot libera e o dreno puxa o próximo — inclusive trabalho novo que os próprios agentes criam (ex.: uma Issue decomposta em Tickets).
5. Ao fim, registra o resumo do dreno.

Como cada `issues next` **claima** o item (`OPEN → CLAIMED`), o item não é puxado duas vezes: agentes concorrentes pegam itens distintos.

### Concorrência

- **Um loop:** até `concurrency` agentes simultâneos (default 3). O systemd `Type=oneshot` garante que o mesmo loop não drena duas vezes em paralelo.
- **Vários loops:** cada `issues loop add --name X` tem seu timer próprio e drena de forma independente — mais paralelismo entre projetos/filas.

### Regras de fechamento embutidas no prompt

- O agente **decide**: fecha o próprio Ticket (`issues ticket status … --status CLOSED`) ou o move para `AWAITING` se houver ponto obscuro/arriscado.
- O agente **nunca** fecha a Issue: quando todos os Tickets estão `CLOSED`, move a Issue para `AWAITING`; o `OPEN|CLOSED` da Issue é gate humano (`issues decide`).

## Alterar o intervalo (ou a concorrência)

Não há `loop set` — re-adicionar com o **mesmo `--name` sobrescreve** a config; depois regenere o agendamento:

```bash
issues loop add --name pi-dev --harness claude --project pi-dev --interval 30m --concurrency 4
issues loop install --name pi-dev
systemctl --user daemon-reload && systemctl --user restart issues-loop-pi-dev.timer
```

O `restart` aplica o novo `OnUnitActiveSec` no timer já em execução. (Cron: rode `issues loop install --name pi-dev --cron` de novo e troque a linha no `crontab -e`.)

## Log e auditoria

Append-only em `${ISSUES_ROOT}/loop/<n>.log`: uma linha por agente + uma linha de resumo por dreno:

```
2026-07-14T10:05:31Z loop=pi-dev result=worked harness=claude agent=claude-code issue=6eb81ec1 ticket=— rc=0
2026-07-14T10:05:31Z loop=pi-dev result=error  harness=claude agent=claude-code issue=b39f3dad ticket=a1b2c3d4 type=Implement rc=1
2026-07-14T10:05:32Z loop=pi-dev result=drained worked=1 error=1 timeout=0 total=2
```

`result` do agente ∈ `{worked, error, timeout}`; o resumo é `drained` (ou `empty` se a fila já estava vazia).

## Config

| Variável | Default | Uso |
|---|---|---|
| `ISSUES_ROOT` | `~/issues-manager` | Raiz de dados; base de `loop/` (config, logs). |
| `TICK_TIMEOUT` | `1800` (s) | `timeout` de **cada** agente; evita agente travado. |

Harness, projeto, intervalo e concorrência ficam na config (`issues harness`/`issues loop`), não em env.

## Agendamento

**systemd (preferido, user units):** `issues loop install --name <n>` escreve `~/.config/systemd/user/issues-loop-<n>.{service,timer}` (`Type=oneshot` + `OnUnitActiveSec`) e imprime o `systemctl --user enable --now …`. Um dreno por disparo, sem root. Para rodar deslogado: `loginctl enable-linger $USER`.

**cron:** `--cron` imprime a linha equivalente (intervalos: divisores de 60min ou de 24h).

**dev/teste:** `while true; do issues loop run --name <n>; sleep 3600; done`.

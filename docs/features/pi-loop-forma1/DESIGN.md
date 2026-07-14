# Design (Spec) — Loop autônomo agnóstico via CLI `issues`

Issue: `6f29bfeb` — originalmente "Loop autônomo do pi via wrapper pi -p + cron (Forma 1)", **re-escopada** (direção humana, gate de direção do Design) para um **loop agnóstico de harness**, configurável pela CLI `issues` deste repositório.
Ticket de Design: `554e76e7`.
Entrada: [`PLANNING.md`](./PLANNING.md) e [`../../research/pi-loop-integration.md`](../../research/pi-loop-integration.md) (Forma 1).

## Re-escopo (o que mudou vs. Planning)

O Planning fixou um wrapper **pi-específico** em shell puro, zero código no repo.
A direção humana redefiniu o alvo:

1. **Agnóstico de harness:** o mesmo loop roda `claude` (Claude Code), `codex`, `pi` **ou outro comando** arbitrário.
2. **Registro de harness:** um harness é registrado como `{ name, agent, command }` — o `command` é o template de invocação; `agent` é um dos 4 do enum fixo `AGENT_IDS` (`cursor·claude-code·codex·pi`), usado no `issues next --agent`.
3. **Configurável pela CLI `issues`:** novos subcomandos `issues harness` e `issues loop` gerenciam o registro de harnesses e as configs de loop (harness + projeto + intervalo) e **geram** o agendamento (systemd/cron).

Decisões de direção (respostas do humano no gate):

- **Runner sobre agent fixo** — `AGENT_IDS` permanece const de domínio; o harness é só um runner mapeado a um agent existente. Registrar "outro comando" = novo mapeamento sobre um dos 4 agentes. **Sem** mudança no domínio de Issue/Ticket/owner.
- **CLI = config + gera agendamento** — `issues loop` persiste config em `ISSUES_ROOT` e gera unit systemd/cron; um `work-queue.sh` genérico lê a config; o SO agenda.

Invariantes do Planning que **permanecem**: um item por tick; agente decide fechar o próprio Ticket ou mover para `AWAITING`; **nunca** fecha a Issue; durável; auditável.

## Modelo de dados (persistência)

Dois registros JSON simples sob `${ISSUES_ROOT}/loop/` (default `~/issues-manager/loop/`), fora do domínio de Issue/Ticket — são config de operação, não agregados:

`harnesses.json` — mapa `name → { agent, command }`:

```json
{
  "claude": { "agent": "claude-code", "command": "claude -p {prompt}" },
  "pi":     { "agent": "pi",          "command": "pi -p {prompt} --no-session" }
}
```

`loops.json` — mapa `name → { harness, project?, interval, enabled }`:

```json
{
  "pi-dev-30m": { "harness": "claude", "project": "pi-dev", "interval": "30m", "enabled": true }
}
```

- `{prompt}` é o **único** placeholder do template; ver "Substituição segura" abaixo.
- `interval` aceita sufixos `s|m|h` (ex.: `30m`, `1h`); traduzido para `OnUnitActiveSec` (systemd) ou expressão cron.
- `project` vazio/ausente = fila global (`issues next` sem `--project`).

## Novos subcomandos da CLI `issues`

Seguem o estilo atual de `src/cli.ts` (parse de flags, saída JSON, use-cases em `src/app/`). Persistência via um adapter simples de filesystem, sem Thread/status (não é agregado de domínio).

### `issues harness`

| Comando | Efeito |
|---|---|
| `issues harness add --name <n> --agent <a∈AGENT_IDS> --command "<tpl>"` | Registra/sobrescreve um runner. Valida `agent` contra `AGENT_IDS` e exige `{prompt}` no template. |
| `issues harness list` | Lista os harnesses registrados (JSON). |
| `issues harness remove --name <n>` | Remove o runner. |

### `issues loop`

| Comando | Efeito |
|---|---|
| `issues loop add --name <n> --harness <h> [--project <p>] --interval <30m>` | Cria/atualiza uma config de loop. Valida que `harness` existe. |
| `issues loop list` | Lista as configs de loop. |
| `issues loop remove --name <n>` | Remove a config (e desinstala o agendamento, se instalado). |
| `issues loop install --name <n> [--cron] [--now]` | Gera o agendamento: por padrão unit systemd *user* (`~/.config/systemd/user/issues-loop-<n>.{service,timer}`) e imprime o comando de `enable`; `--now` roda `systemctl --user enable --now`; `--cron` imprime a linha de crontab equivalente em vez de systemd. |
| `issues loop uninstall --name <n>` | Remove as units geradas (e para o timer). |
| `issues loop run --name <n>` | Executa **um tick** da config `<n>` no processo atual (usado pelo service/cron e para teste manual). Delega ao mesmo caminho do `work-queue.sh`. |

Saída sempre JSON (padrão da CLI); `--pretty` aplica.

## O tick (contrato único de execução)

`issues loop run --name <n>` **é** o tick (fonte única da lógica); systemd/cron o chamam direto.
O `work-queue.sh` da spec original foi descartado (YAGNI): um wrapper que só faz `exec issues loop run` não agrega — as units geradas já invocam a CLI. Um tick:

```
1. Carrega loops.json[n] e harnesses.json[loop.harness]. Ausência → erro claro, rc≠0.
2. flock não-bloqueante em ${ISSUES_ROOT}/loop/<n>.lock → já travado ⇒ log skip=locked, exit 0.
3. item = issues next --agent <harness.agent> [--project <loop.project>]
4. item == "null" ⇒ log result=empty, exit 0.                              (fila vazia)
5. prompt = PROMPT_BASE + bloco JSON do item (ver abaixo).
6. Substitui {prompt} no command template por UM argv (substituição segura) e roda
   sob timeout TICK_TIMEOUT. Captura rc, stdout, stderr.
7. log result=worked|error|timeout com issue_id, ticket_id, type, rc, dur.
8. exit 0 em fechamento controlado; rc≠0 só em falha de infra (harness/CLI ausente).
```

O tick **não** faz transições de status: quem move Ticket/Issue é o harness, guiado pelo prompt. O wrapper só orquestra e audita — o gate humano da Issue fica intacto.

### Substituição segura de `{prompt}`

O template é tokenizado por *shell-words* **uma vez**; em runtime o token `{prompt}` é trocado pelo prompt como **um único elemento de argv** (sem re-split, sem glob, sem eval).
Isso evita injeção de shell a partir do conteúdo do item (que pode conter aspas, `$`, `;`).
Ex.: `claude -p {prompt}` → argv `["claude","-p", <prompt inteiro>]`.

### Prompt base (agnóstico de harness)

Congelado no código, pt-BR, válido para qualquer harness que descubra `AGENTS.md`:

```
Você é um agente de código trabalhando a fila issues-local de forma autônoma.
Siga AGENTS.md e a skill sdlc-workflow (camada 0) e, pelo tipo do Ticket, a
skill de fase correspondente (camada 1). Trabalhe o item abaixo.

Regras de fechamento (obrigatórias):
- Ao concluir o Ticket, DECIDA: se o resultado está claro e seguro, feche o
  próprio Ticket (issues ticket status … --status CLOSED); se houver ponto
  obscuro/arriscado, mova-o para AWAITING pedindo revisão humana.
- NUNCA feche a Issue. Quando todos os Tickets estiverem CLOSED, mova a Issue
  para AWAITING (issues status … --status AWAITING) e pare; a decisão
  OPEN|CLOSED da Issue é do humano (issues decide).

Item da fila:
```json
<stdout de issues next>
```
```

## Configuração (env / defaults)

| Variável | Default | Uso |
|---|---|---|
| `ISSUES_ROOT` | `~/issues-manager` | Raiz de dados; base de `loop/` (config, locks, logs). |
| `TICK_TIMEOUT` | `1800` (s) | `timeout` do tick; evita tick travado. |
| `LOG_FILE` | `${ISSUES_ROOT}/loop/<n>.log` | Log append-only por loop. |

Nomes de harness/comando, projeto e intervalo vivem na config (não em env), pois são gerenciados pela CLI.

## Log de auditoria (por tick)

Append-only, **uma linha por tick**, texto `chave=valor` (humano-legível e greppável):

```
2026-07-14T09:20:01Z loop=pi-dev-30m tick=start
2026-07-14T09:20:02Z loop=pi-dev-30m result=empty dur=1s
2026-07-14T09:50:03Z loop=pi-dev-30m result=worked harness=claude agent=claude-code issue=6f29bfeb ticket=f7fe65e4 type=Implement rc=0 dur=812s
2026-07-14T10:20:01Z loop=pi-dev-30m result=error harness=claude agent=claude-code issue=bd4a7c84 ticket=— type=Design rc=1 dur=4s
2026-07-14T10:50:00Z loop=pi-dev-30m result=skip=locked
```

`result ∈ {empty, worked, error, timeout, skip=locked}`. stdout/stderr completos do harness vão para `${LOG_FILE}.detail` apenas em `error`/`timeout`.

## Agendamento gerado

**systemd (preferido, user units):** `issues loop install --name <n>` gera:

- `issues-loop-<n>.service` — `Type=oneshot`, `ExecStart=issues loop run --name <n>`, `WorkingDirectory=` no repo, `Environment=ISSUES_ROOT=…`.
- `issues-loop-<n>.timer` — `OnUnitActiveSec=<interval>`, `Persistent=true`.

`oneshot` + timer = um tick por disparo, sem sobreposição (reforçado pelo `flock`). Sem root.

**cron (alternativa):** `--cron` imprime `*/30 * * * * issues loop run --name <n> >> …/<n>.log 2>&1` (intervalo derivado da config).

**dev/teste:** `while true; do issues loop run --name <n>; sleep <interval>; done`, documentado no README.

## Rastreabilidade RF → spec (Planning)

| RF | Onde |
|---|---|
| RF1 puxar 1 item | Tick passo 3 |
| RF2 fila vazia (`null`) | Tick passo 4 + log `result=empty` |
| RF3 harness com prompt AGENTS.md+sdlc-workflow | Tick passos 5–6 + Prompt base (agora agnóstico) |
| RF4 agente fecha Ticket ou → AWAITING | Prompt base (regras de fechamento) |
| RF5 nunca fecha Issue | Prompt base + tick não faz transições |
| RF6 log por tick | Log de auditoria |
| RF7 agendamento configurável | `issues loop` + `interval` na config + install systemd/cron |
| RF8 README | Artefato `pi-loop/README.md` |

Novos (do re-escopo): registro de harness (`issues harness`), config de loop multi-projeto/intervalo (`issues loop`), substituição segura de `{prompt}`.
Riscos do Planning cobertos: tick travado → `TICK_TIMEOUT`; concorrência → `flock`/`oneshot`; fechamento indevido da Issue → prompt + wrapper sem transições.

## Artefatos a entregar

| Arquivo | Papel |
|---|---|
| `src/app/harness_use_case.ts` + `src/app/loop_use_case.ts` | Use-cases de CRUD de harness/loop + install/run, no estilo `src/app/`. |
| `src/app/loop_store.ts` | Adapter FS: lê/escreve `harnesses.json` / `loops.json` sob `ISSUES_ROOT/loop/`. |
| `src/app/loop_scheduling.ts` | Puros: `buildArgv`/`buildPrompt`/`parseIntervalSeconds`/render systemd·cron. |
| `src/cli.ts` | Roteia `harness` e `loop` (novos comandos). |
| gerador de unit systemd/cron | Templates emitidos por `issues loop install`. |
| `docs/loop.md` | Uso, instalação e operação. |

Entregue como **uma fatia** (não precisou o corte A/B): CLI + persistência + scheduling + tick + testes + doc, com `issues loop run` no lugar de um `work-queue.sh` separado.

## Fatiamento sugerido para Implement

Duas fatias **independentes** (o `.sh` é fino e desenvolvível contra esta spec antes da CLI existir):

- **Slice A — CLI (TS):** `issues harness` + `issues loop` (add/list/remove/install/uninstall/run), persistência FS, substituição segura, prompt base, geração de units, **com testes** (padrão do repo). É o núcleo.
- **Slice B — Ops (shell/docs):** `work-queue.sh` fino, exemplos de unit/cron, `README.md`, self-check runnable (fila vazia → `result=empty`; item → harness recebe o prompt).

O Ticket Implement existente `f7fe65e4` (hoje pi-específico) cobre a fatia; se ficar grande, feche-o entregando o Slice A e crie continuação para o Slice B (mecanismo do `sdlc-workflow`).

## Pronto para Implement

Modelo de dados, subcomandos da CLI, contrato do tick, substituição segura, prompt agnóstico, config, log e agendamento estão definidos.
QA `a9295e38` valida os cenários (fila vazia, item real por harness, gates humanos, log, timer, `{prompt}` sem injeção).

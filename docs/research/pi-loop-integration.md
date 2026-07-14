# Pesquisa — Loop/cron com o pi (pi-dev) para trabalhar Issues OPEN

Issue: `46ae2971` — "Loop com Pi-dev" (tipo `Research`, projeto `pi-dev`).
Ticket de Planning: `434fd62d`.
Data: 2026-07-13.

## Problema

Hoje o `pi` (agente de código, harness `pi`) só entra no fluxo por execução **explícita** de comando no CLI.
Falta uma forma de **agendar** (cron) ou **iterar** (estilo `/loop` do Claude Code) para que o `pi` puxe periodicamente os Issues/Tickets `OPEN` (`issues next --agent pi`) e trabalhe cada um.

## Contexto factual do pi (levantado da instalação local)

Fonte primária: binário `pi` v0.80.6 instalado, a extensão `pi-subagents` v0.34.0 já instalada, e a doc oficial `packages/coding-agent/docs/extensions.md` do repositório [`earendil-works/pi`](https://github.com/earendil-works/pi).

O `pi` é feito para ser estendido e automatizado. O que importa para esta Issue:

- **Modo não-interativo:** `pi -p "<prompt>"` (`--print`) processa e sai. Também há `--mode json` e `--mode rpc`, `--continue`/`--session-id` para sessão persistente e `--no-session` para efêmero. Isso é o que torna o `pi` "scriptável" por um agendador externo.
- **Sistema de extensões (TypeScript):** um módulo que faz `export default function (pi: ExtensionAPI) { … }`. Descoberta automática em `~/.pi/agent/extensions/*.ts` (global) e `.pi/extensions/*.ts` (local ao projeto), ou empacotado com um manifesto `pi` no `package.json` e instalado via `pi install npm:<pkg>` / `git:<repo>` / `./caminho`.
- **A `ExtensionAPI` registra:** `pi.registerTool()` (ferramenta chamável pelo LLM), `pi.registerCommand()` (slash command `/x`), `pi.registerShortcut()`, `pi.registerFlag()`, e assinaturas de evento `pi.on(evento, handler)`.
- **Eventos de ciclo de vida:** `session_start`, `session_shutdown`, `before_agent_start`, `turn_start`/`turn_end`, `tool_call`/`tool_result`, `input`. O handler recebe `ctx: ExtensionContext` com `ctx.exec(cmd,args)`, `ctx.ui.*`, `ctx.sessionManager`, `ctx.isIdle()`, e — em comandos — `ctx.waitForIdle()`, `ctx.newSession()`, `ctx.fork()`.
- **A extensão `pi-subagents` já traz um primitivo de agendamento:** um `ScheduledRunManager` com ações `schedule`, `schedule-list`, `schedule-status`, `schedule-cancel` (arquivo `src/runs/background/scheduled-runs.ts`). Ou seja, "agendar um run" já existe no ecossistema do `pi`, hoje apilcado a subagentes.

Consequência: **não é preciso "hackear" o pi**. Ele oferece três degraus de integração, do mais simples ao mais acoplado.

---

## (a) Três+ formas de estender o pi para o loop

Ordenadas do menor ao maior acoplamento. **Recomendação: comece pela Forma 1.**

### Forma 1 — Wrapper externo sobre `pi -p` (cron/loop no SO) — *recomendada*

Nenhum código de extensão. Um script shell puxa a fila e chama o `pi` em modo `--print`, uma vez por Ticket:

```bash
#!/usr/bin/env bash
# work-queue.sh — puxa 1 item da fila e manda o pi trabalhar
set -euo pipefail
item="$(issues next --agent pi)"   # fila vazia => imprime literalmente: null
[ "$item" = "null" ] && { echo "fila vazia"; exit 0; }
echo "$item" | pi -p "Você é o harness 'pi'. Trabalhe este item da fila issues-local \
seguindo AGENTS.md + sdlc-workflow. Item: $(cat). Ao terminar, mova o Ticket para AWAITING."
```

Agendamento: `crontab` (`*/30 * * * * /caminho/work-queue.sh`), `systemd timer`, ou um `while true; do work-queue.sh; sleep 1800; done`.

- **Prós:** zero código no pi, durável (sobrevive a fechar o terminal), isolável por `--no-session` ou `--session-id`, trivial de auditar/logar.
- **Contras:** cada tick é uma sessão nova (sem memória entre ticks, a não ser via `--continue`); o agendamento vive fora do pi.
- **Melhor quando:** você quer autonomia real "24/7" e desacoplada da sessão interativa. É o análogo do padrão *Ralph loop* (ver §c).

### Forma 2 — Slash command `/work-queue` dentro do pi (extensão)

Uma extensão registra um comando que roda um **loop interno** à sessão do pi (análogo direto ao `/loop` do Claude Code): a cada iteração chama `issues next --agent pi`, injeta o item como prompt e espera o agente terminar antes do próximo.

```typescript
// .pi/extensions/work-queue.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("work-queue", {
    description: "Puxa Issues/Tickets OPEN e trabalha cada um em sequência",
    async run(args, ctx) {
      const max = Number(args?.trim() || "5");
      for (let i = 0; i < max; i++) {
        const out = await ctx.exec("issues", ["next", "--agent", "pi"]);
        const res = JSON.parse(out.stdout);      // null quando a fila está vazia
        if (!res?.ticket) { ctx.ui.notify("Fila vazia", "info"); break; }
        pi.sendUserMessage(
          `Trabalhe este Ticket seguindo sdlc-workflow e a skill de fase do tipo ` +
          `'${ticket.type}'. Ao concluir, mova-o para AWAITING.\n\n` +
          "```json\n" + out.stdout + "\n```"
        );
        await ctx.waitForIdle(); // barreira: só puxa o próximo quando o agente parar
      }
    },
  });
}
```

- **Prós:** vive dentro do pi, reaproveita a sessão/contexto entre itens, UX de `/loop`.
- **Contras:** escopo da **sessão** — para se o terminal fechar; não é cron real.
- **Melhor quando:** você quer, numa sessão de trabalho aberta, "esvaziar a fila" de forma supervisionada.

### Forma 3 — Ferramenta agendável reaproveitando o `ScheduledRunManager` (extensão + `pi-subagents`)

O `pi-subagents` já implementa `schedule`/`schedule-list`/`schedule-status`/`schedule-cancel` para runs de subagente em background. Uma extensão específica do projeto pode registrar uma **tool** `queue_tick` que faz `issues next --agent pi` + delega a um subagente, e **agendá-la** com esse mesmo mecanismo — obtendo "cron dentro do pi" com re-wake e monitoramento já prontos.

- **Prós:** re-wake/monitoramento de background reaproveitados; agendamento como cidadão de primeira classe do pi.
- **Contras:** maior acoplamento; depende do `pi-subagents`; o timer do processo do pi precisa estar vivo (é um timer in-process, não um cron do SO).
- **Melhor quando:** o loop precisa rodar em background **e** você já usa subagentes.

### Forma 4 — Orquestrador externo via RPC/SDK

`pi --mode rpc` (ou o SDK `@earendil-works/pi-coding-agent`) permite um processo hospedeiro dirigir o pi programaticamente: o orquestrador é dono do cron e da fila, e trata cada sessão do pi como um worker.

- **Prós:** controle total (filas, retries, worktrees, paralelismo, dashboard); linguagem/infra à sua escolha.
- **Contras:** é construir um mini-Alfred (ver §c); maior custo de operação.
- **Melhor quando:** múltiplos agentes/harnesses, paralelismo por worktree, relatórios — escala de time.

### Bônus — Instrução no `AGENTS.md`/`SKILL.md` (sem cron)

O `pi` descobre `AGENTS.md`. Uma skill `work-queue` (ou uma linha no AGENTS.md) instruindo "sempre que ocioso, rode `issues next --agent pi` e trabalhe o próximo" transforma qualquer sessão pi num consumidor de fila **sob demanda**, sem agendamento. É o degrau 1 da escada: se resolve, pare aqui.

| Forma | Agendamento | Persistência | Código | Acoplamento |
|---|---|---|---|---|
| 1 Wrapper `pi -p` | cron/systemd/SO | durável | shell | nenhum |
| 2 `/work-queue` | manual/`/loop` | sessão | extensão TS | baixo |
| 3 `ScheduledRunManager` | in-process | processo pi | extensão + pi-subagents | médio |
| 4 RPC/SDK | orquestrador | do host | app externo | alto |

---

## (b) Tutorial — como estender o pi

### 1. Anatomia de uma extensão

Uma extensão é um módulo TS com **default export** que recebe a `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 1. reagir a eventos
  pi.on("session_start", (_e, ctx) => ctx.ui.notify("carregado", "info"));

  // 2. registrar ferramenta chamável pelo LLM
  pi.registerTool({
    name: "queue_next",
    description: "Puxa o próximo Ticket OPEN da fila issues-local para o agente pi",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute(_input, ctx) {
      const r = await ctx.exec("issues", ["next", "--agent", "pi"]);
      return { output: r.stdout };
    },
  });

  // 3. registrar slash command
  pi.registerCommand("queue", {
    description: "Mostra o próximo item da fila",
    async run(_args, ctx) {
      const r = await ctx.exec("issues", ["next", "--agent", "pi"]);
      ctx.ui.notify(r.stdout, "info");
    },
  });
}
```

### 2. Onde colocar o arquivo

- **Local ao projeto (recomendado para este repo):** `.pi/extensions/work-queue.ts` — versionável no git, aplicável só aqui. Requer confiar nos arquivos do projeto (`pi --approve` ou o prompt de trust).
- **Global (todas as sessões):** `~/.pi/agent/extensions/work-queue.ts`.
- **Empacotada (compartilhável):** `package.json` com manifesto `pi` e publicada no npm/git.

```json
{
  "name": "pi-issues-loop",
  "type": "module",
  "pi": { "extensions": ["./src/index.ts"], "skills": ["./skills"] },
  "peerDependencies": { "@earendil-works/pi-coding-agent": "*" }
}
```

Instalação: `pi install npm:pi-issues-loop` (global) ou `pi install ./pi-issues-loop -l` (local), depois `pi list` para conferir e `pi config` para habilitar/desabilitar recursos.

### 3. Superfície útil da API (o essencial)

| Registrar | Método |
|---|---|
| Ferramenta (LLM) | `pi.registerTool({ name, description, parameters, execute })` |
| Slash command | `pi.registerCommand(nome, { description, run })` |
| Atalho de teclado | `pi.registerShortcut(...)` |
| Flag de CLI | `pi.registerFlag(...)` |
| Evento | `pi.on(evento, handler)` |

Eventos úteis para automação de fila: `session_start` (bootstrap), `before_agent_start` (injetar contexto/prompt de sistema), `turn_end`/`ctx.isIdle()`/`ctx.waitForIdle()` (saber quando o agente terminou um item antes de puxar o próximo), `tool_call` (gate de segurança).

No `ctx`: `ctx.exec(cmd, args)` para chamar o CLI `issues`, `ctx.ui.*` para notificar/confirmar, `ctx.newSession()`/`ctx.fork()` para reciclar contexto entre itens, `ctx.sessionManager` para ler o histórico.

### 4. Testar

```bash
pi -e .pi/extensions/work-queue.ts   # carrega a extensão explicitamente
/queue                               # dispara o slash command
```

Comece pela **Forma 2** (`/work-queue`) acima — ela é o "hello world" com valor real: um comando que esvazia a fila. Depois promova para wrapper cron (Forma 1) quando quiser autonomia fora da sessão.

---

## (c) ≥3 alternativas da comunidade para `/loop` (com arquitetura e GitHub)

### 1. Claude Code `/loop` (referência do pedido) — *scheduler de sessão*

- **Onde:** skill embutida do Claude Code; análise da implementação (v2.1.71) no gist [`sorrycc/1b21662…`](https://gist.github.com/sorrycc/1b2166228413234928039e84a26a3b8f); docs [Scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks).
- **Arquitetura:** timer **dentro da sessão**. `/loop "<prompt>" --interval 30m --expires 8h` (ou linguagem natural) reenfileira o próprio prompt a cada intervalo, com **jitter de até 10%** para não sincronizar carga entre muitos usuários. Escopo de sessão: fecha o terminal, o loop para. Aceita uma skill como prompt (`/loop 20m /review-pr 1234`). Para durabilidade além da sessão, delega a GitHub Actions/cron do SO.
- **Lição para o pi:** é exatamente a **Forma 2** (loop in-session). Simples, supervisionado, efêmero.

### 2. `AnandChowdhary/continuous-claude` — *Ralph loop com PRs*

- **Onde:** [github.com/AnandChowdhary/continuous-claude](https://github.com/AnandChowdhary/continuous-claude).
- **Arquitetura:** wrapper **externo** que roda o Claude Code em loop contínuo: a cada iteração cria uma branch/PR, espera os checks de CI, e faz merge — repetindo por N iterações. É o padrão *"Ralph loop"* (timer/loop fora, sessão nova a cada volta, entrega = PR).
- **Lição para o pi:** é a **Forma 1** (wrapper sobre `pi -p`) levada a sério, com git worktree/PR e verificação por CI como gate entre iterações.

### 3. Alfred — *runtime self-hosted, cron + worktrees + label-driven*

- **Onde:** projeto self-hosted para Claude Code/Codex (categoria "issues → PRs revisados"); ver a coleção abaixo para o repo.
- **Arquitetura:** daemon que, a cada tick de **cron** (`0 */6 * * *` etc.), abre uma sessão nova num **git worktree por disparo**, entrega um prompt de wake-up ("escolha o trabalho de maior valor e faça progresso; verifique o que entregar"), roteia por **labels** (estado dirigido por rótulos, ex. as próprias Issues) e reporta no Slack. Roteamento por papel/engine (Claude vs Codex).
- **Lição para o pi:** é a **Forma 4** (orquestrador externo). O "estado por label" corresponde 1:1 ao `status` das Issues/Tickets do issues-local (`OPEN`→`CLAIMED`→…); o worktree por disparo dá isolamento/paralelismo.

### 4. `serenakeyitan/awesome-agent-loops` — *catálogo de padrões*

- **Onde:** [github.com/serenakeyitan/awesome-agent-loops](https://github.com/serenakeyitan/awesome-agent-loops) (+ registry `loops.elorm.xyz`, e `serenakeyitan/loopable` para sugestão de padrões).
- **Arquitetura:** coleção curada de comandos `/loop`, `/goal` e `/schedule` (Claude Code e Codex). O princípio recorrente é **"timer por fora, condição por dentro, skill no núcleo"** (`/schedule` cron → `/loop` intervalo → `/goal` até condição → skill de trabalho). Útil como cardápio de composição.
- **Lição para o pi:** modela a fila como `/goal` ("continuar até a fila esvaziar") em vez de intervalo fixo — evita ticks vazios.

### 5. `ByBrawe/opencode-loop` — *auto-continue para OpenCode*

- **Onde:** [github.com/ByBrawe/opencode-loop](https://github.com/ByBrawe/opencode-loop).
- **Arquitetura:** porta o "auto-continue estilo Claude Code" para o OpenCode — mostra que o mesmo padrão de loop-in-session é reimplementável em qualquer harness com uma camada de plugin, exatamente como a **Forma 2** faria no pi.

### Bônus dentro do ecossistema pi

O `pi-subagents` ([github.com/nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents)) já traz `schedule`/`schedule-list`/`schedule-status`/`schedule-cancel` para runs de background — a base pronta da **Forma 3**.

---

## Recomendação

1. **Agora (custo ~zero):** adotar a **Forma 1** — `work-queue.sh` chamando `pi -p` a partir de `issues next --agent pi`, agendado por `systemd timer`/cron. Durável, auditável, sem código no pi.
2. **Se quiser UX interativa:** adicionar a extensão `/work-queue` (**Forma 2**) para esvaziar a fila numa sessão aberta, usando `ctx.waitForIdle()` como barreira entre itens.
3. **Só se escalar para time/paralelismo:** evoluir para orquestrador RPC (**Forma 4**), espelhando o Alfred, com worktree por disparo e estado dirigido pelo `status` das Issues.

O `status` do issues-local já é a máquina de estados "label-driven" que o Alfred implementa à mão — o loop do pi só precisa **respeitar os gates humanos** (não pular de `AWAITING` sozinho) e mover Tickets para `AWAITING` ao terminar, deixando a decisão `OPEN|CLOSED` para o humano.

## Fontes

- pi (código/docs): [earendil-works/pi](https://github.com/earendil-works/pi) · [docs/extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) · [docs/sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md) · instalação local `pi` v0.80.6
- pi-subagents: [github.com/nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) (v0.34.0 local)
- Claude Code /loop: [docs Scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks) · [gist sorrycc](https://gist.github.com/sorrycc/1b2166228413234928039e84a26a3b8f)
- continuous-claude: [github.com/AnandChowdhary/continuous-claude](https://github.com/AnandChowdhary/continuous-claude)
- awesome-agent-loops: [github.com/serenakeyitan/awesome-agent-loops](https://github.com/serenakeyitan/awesome-agent-loops)
- opencode-loop: [github.com/ByBrawe/opencode-loop](https://github.com/ByBrawe/opencode-loop)

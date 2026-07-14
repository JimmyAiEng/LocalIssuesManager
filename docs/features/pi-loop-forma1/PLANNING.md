# Planning — Loop autônomo do pi (Forma 1)

Issue: `6f29bfeb` — "Loop autônomo do pi via wrapper pi -p + cron (Forma 1)" (tipo `Feat`, projeto `pi-dev`).
Ticket de Planning: `80dc8a41`.
Artefato de origem: `docs/research/pi-loop-integration.md`.

## Problema

O `pi` só trabalha a fila `issues-local` por execução manual de comando.
Falta um mecanismo durável e agendado que puxe periodicamente o próximo item (`issues next --agent pi`) e faça o `pi` trabalhá-lo.
A pesquisa recomenda a **Forma 1**: um wrapper de shell sobre `pi -p` (modo `--print`), agendado por `systemd timer`/cron, sem nenhum código de extensão dentro do `pi`.

## Decisões de escopo

- **Forma 1 apenas.** Wrapper externo sobre `pi -p`; zero código de extensão no `pi`. Formas 2–4 ficam fora desta Issue (YAGNI).
- **Um item por tick.** Cada disparo puxa exatamente 1 item da fila e encerra; a repetição é responsabilidade do agendador, não de um loop interno.
- **Agente decide o fechamento do Ticket.** Ao concluir, o `pi` pode **fechar o próprio Ticket** (`ticket status … --status CLOSED`) ou, se o resultado tiver ponto obscuro/arriscado, movê-lo para `AWAITING` pedindo intervenção humana. A escolha é do agente.
- **Fechamento da Issue é o único gate humano obrigatório do loop.** O agente **nunca** fecha a Issue: quando todos os Tickets estiverem `CLOSED`, move a Issue para `AWAITING` (`issues status … --status AWAITING`) e o humano decide via `issues decide`.
- **Sessão efêmera por tick.** Padrão `--no-session` (sem memória entre ticks); `--continue` fica como opção documentada, não default.

## Requisitos funcionais (RF)

| RF | Descrição | Rastreia AC da Issue |
|---|---|---|
| RF1 | Puxar 1 item via `issues next --agent pi`. | AC1 |
| RF2 | Tratar fila vazia (`issues next` imprime literalmente `null`): encerrar o tick limpo, sem chamar o `pi`. | AC1 |
| RF3 | Passar o item ao `pi -p` com um prompt que instrui seguir `AGENTS.md` + `sdlc-workflow` e a skill de fase do tipo do Ticket. | AC1 |
| RF4 | Ao concluir o trabalho, o agente **decide**: fechar o próprio Ticket (`ticket status … --status CLOSED`) ou movê-lo para `AWAITING` quando houver ponto obscuro/arriscado que peça revisão humana. | AC1, AC3 |
| RF5 | **Nunca** fechar a **Issue** sozinho: quando todos os Tickets estiverem `CLOSED`, mover a Issue para `AWAITING` e deixar o `CLOSED` da Issue para o humano (`issues decide`). | AC3 |
| RF6 | Registrar log/auditoria por tick: timestamp, item trabalhado (ids), resultado (trabalhado / fila vazia / erro). | AC4 |
| RF7 | Fornecer agendamento configurável (intervalo) via `systemd timer` e alternativa cron. | AC2 |
| RF8 | Documentar uso e instalação do loop (README). | AC5 |

## Requisitos não-funcionais (RNF)

- **Durabilidade:** o loop sobrevive ao fechamento do terminal (agendamento no SO).
- **Auditabilidade:** cada tick deixa rastro em log append-only, legível por humano.
- **Robustez:** `set -euo pipefail`; falha de um tick não corrompe estado da fila nem impede o próximo tick.
- **Configurabilidade:** intervalo, `--project`, `ISSUES_ROOT` e caminho de log parametrizáveis por variável de ambiente/env-file.
- **Portabilidade:** shell POSIX-friendly + `systemd`; cron como alternativa onde não há `systemd`.
- **Zero acoplamento ao pi:** nenhuma extensão instalada; só o binário `pi` v0.80.6 e o CLI `issues`.

## Riscos

- **Tick longo/travado:** um item pode levar o `pi` a rodar muito tempo; mitigar com timeout no tick e sobreposição evitada (`systemd` `RemainAfterExit=no` / lock).
- **Concorrência:** dois ticks simultâneos poderiam puxar itens em paralelo; mitigar com lock simples (flock) — a decidir na Design.
- **Fechamento indevido da Issue:** garantir no prompt e no script que o `pi` pode fechar Tickets, mas **nunca** fecha a Issue — no máximo a move para `AWAITING`.

## Gates humanos

- **G1 (agora):** humano aceita este Planning → fecha Planning → abre Design.
- Gates seguintes (G2 Spec, fatia Implement, G3 QA, G4 Deploy) seguem o `sdlc-workflow`.

## Rastreabilidade

Todas as 5 acceptance criteria da Issue estão cobertas por RF1–RF8 (coluna "Rastreia AC" acima).
Nenhum requisito órfão; nenhum RF sem AC de origem.

**Correção sobre a Issue:** o texto de AC1 ("move o Ticket para AWAITING ao concluir") e AC3 ("nao fecha Ticket/Issue sozinho, apenas move para AWAITING") reflete uma regra desatualizada.
A regra correta: o agente **pode fechar o próprio Ticket** e decide entre fechar ou pedir revisão humana (`AWAITING`) caso haja ponto obscuro/arriscado; apenas o **fechamento da Issue** é gate humano.
RF4/RF5 acima adotam a regra correta. Sugerido atualizar o texto da AC da Issue para evitar ambiguidade futura.

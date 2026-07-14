# Pack de discovery — workflow de novo desenvolvimento (camadas 0–1)

Pack portátil de progressive disclosure para **novo desenvolvimento**, usável em **qualquer projeto** e nos harnesses `cursor` · `claude-code` · `codex` · `pi`.
Entrada do pack: o `AGENTS.md` instalado na raiz do projeto.
Instalação: [`INSTALL.md`](INSTALL.md).

Contrato estável: `AGENTS.md` na raiz + `<dir de skills>/<nome>/SKILL.md`.
Os arquivos do pack são **auto-contidos**: nenhuma skill depende de documentos do repositório que as produziu.

As skills orientam **como usar o workflow** (fases, gates, entregáveis, issues-local).
O **como executar** cada fase é decisão do agente — não há skills de execução no pack (YAGNI).

| Skill | Camada | Papel |
|---|---|---|
| `sdlc-workflow` | 0 | Mapa SDLC + comandos issues-local; sempre via `AGENTS.md` |
| `planning-phase` | 1 | Fase Planning (Ticket type=`Planning`) → gate G1 |
| `design-phase` | 1 | Fase Design (Ticket type=`Design`) → gate G2 |
| `implement-phase` | 1 | Fase Implement (Ticket type=`Implement`) → revisão de fatia |
| `qa-phase` | 1 | Fase QA (Ticket type=`QA`) → gate G3 |
| `deployment-phase` | 1 | Fase Deploy (Ticket type=`Deploy`) → gate G4 |

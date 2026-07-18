# Pack de discovery — workflow de novo desenvolvimento (camadas 0–1)

Pack portátil de progressive disclosure para **novo desenvolvimento**, usável em **qualquer projeto** e nos harnesses `cursor` · `claude-code` · `codex` · `pi`.
Entrada do pack: o `AGENTS.md` instalado na raiz do projeto.
Instalação e wiring de harnesses: [`INSTALL.md`](INSTALL.md).

Contrato estável: `AGENTS.md` na raiz + discovery em `.agents/skills/<nome>/SKILL.md` (paths espelhados por harness).
No pack source deste repo, o conteúdo editável vive em `skills/`; use `npm run skills:link` para publicar nos paths de discovery.

Os arquivos do pack são **auto-contidos**: nenhuma skill depende de documentos do repositório que as produziu.

As skills orientam **como usar o workflow** (fases, gates, entregáveis, issues-local).
O **como executar** cada fase é decisão do agente — não há skills de execução no pack (YAGNI).

| Skill | Camada | Papel |
|---|---|---|
| `sdlc-workflow` | 0 | Mapa SDLC + comandos issues-local; sempre via `AGENTS.md` |
| `planning-phase` | 1 | Issue action=`Planning` → requisitos Gherkin (gate de conclusão) |
| `design-phase` | 1 | Issue action=`Design` → design.md + diagramas PlantUML (gate de conclusão) |
| `implement-phase` | 1 | Issue action=`Implement` → worktree + check do projeto (gate de conclusão) |
| `qa-phase` | 1 | Issue action=`QA` → validação do conjunto (evidência) |
| `deployment-phase` | 1 | Issue action=`Deploy` → PR + go/no-go humano (evidência) |

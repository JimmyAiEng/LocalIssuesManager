# Pack de discovery — workflow de novo desenvolvimento

Pack portátil de progressive disclosure para **novo desenvolvimento**, usável em **qualquer projeto** e nos harnesses `cursor` · `claude-code` · `codex` · `pi`.
Entrada do pack: o `AGENTS.md` instalado na raiz do projeto.
Instalação e wiring de harnesses: [`INSTALL.md`](INSTALL.md).

Contrato estável: `AGENTS.md` na raiz + discovery em `.agents/skills/<nome>/SKILL.md` (paths espelhados por harness).
No pack source deste repo, o conteúdo editável vive em `skills/`; use `npm run skills:link` para publicar nos paths de discovery.

Os arquivos do pack são **auto-contidos**: nenhuma skill depende de documentos do repositório que as produziu.

O pack orienta **como usar o workflow** (fases, gates, entregáveis, issues-local).
O **como executar** cada fase é decisão do agente — não há skills de execução no pack (YAGNI).

## Uma skill só, com os guias de fase dentro

`sdlc-workflow` é a **única** skill do pack. Os guias das actions são arquivos comuns em `phases/`,
lidos por caminho — não são skills, não dependem do mecanismo de discovery do harness:

```text
sdlc-workflow/
├── SKILL.md              ← camada 0: mapa SDLC, comandos issues-local, roteamento
└── phases/
    ├── planning.md       ← action=Planning  → requisitos em JSONL (gate de conclusão)
    ├── design.md         ← action=Design    → design.md + diagramas PlantUML (gate de conclusão)
    ├── implement.md      ← action=Implement → worktree + check do projeto (gate de conclusão)
    ├── qa.md             ← action=QA        → validação do conjunto (evidência)
    └── deploy.md         ← action=Deploy    → PR + go/no-go humano (evidência)
```

O progressive disclosure continua: o agente carrega só `SKILL.md` no claim e lê **um** `phases/*.md`,
o da action da Issue. A diferença é que a segunda camada é uma leitura de arquivo, e não um segundo
carregamento de skill — que era um hop opcional, com nome ambíguo, que agentes erravam em silêncio.

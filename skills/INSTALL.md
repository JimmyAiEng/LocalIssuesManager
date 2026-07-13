# Instalação do pack (qualquer projeto · qualquer harness)

Este diretório `skills/` + o `AGENTS.md` na raiz do pack são o **entregável**. Copie-os para o projeto consumidor; não dependem do repositório que os produz.

## Conteúdo mínimo

```text
<projeto>/
├── AGENTS.md                 ← entrada do pack (camada 0+1 + issues-local)
└── skills/
    ├── sdlc-workflow/SKILL.md
    ├── planning-phase/SKILL.md
    ├── design-phase/SKILL.md
    ├── implement-phase/SKILL.md
    ├── qa-phase/SKILL.md
    └── deployment-phase/SKILL.md
```

Pré-requisito: CLI **issues** no PATH (issues-local).

## Por harness

Caminhos abaixo são os lugares onde o harness costuma descobrir skills. O contrato do pack continua sendo `AGENTS.md` + `skills/<nome>/SKILL.md` no projeto (ou symlinks para esses arquivos).

| Harness | O que fazer |
|---|---|
| **Cursor** | `AGENTS.md` na raiz do projeto. Skills: mantenha `skills/` **ou** copie/symlink cada skill para `.cursor/skills/<nome>/` (Cursor auto-descobre esse dir). |
| **Claude Code** | `AGENTS.md` (e/ou `CLAUDE.md` apontando para ele). Skills em `.claude/skills/<nome>/` via copy/symlink para `skills/<nome>/`, ou plugin/marketplace se você empacotar depois. |
| **Codex** | `AGENTS.md` na raiz. Skills no diretório de skills do agente (ex. `.agents/skills/<nome>/`) apontando para este pack. |
| **Pi** | `AGENTS.md` na raiz. Skills no path de skills que o Pi carrega; symlink para `skills/<nome>/`. |

Regra: **uma cópia canônica** do texto (`skills/` + `AGENTS.md`); harnesses só linkam/copiam. Evite forks divergentes por ferramenta.

## Skills concretas (camada 2)

Instale no mesmo layout `skills/<nome>/SKILL.md` (ou symlink no dir do harness). O disclosure das fases lista os nomes.

Já no repositório produtor:

- **Planning:** `wayfinder`, `research`, `domain-modeling`, `teach`, `handoff`
- **Design:** `codebase-design`, `prototype`, `to-spec`, `to-tickets`
- **Implement:** `implement`, `tdd`, `code-review`
- **QA:** `quality-assurance`, `software-architect`, `qa-engineer`, `data-engineer`, `security-engineer`, `devops-engineer`
- **Deployment:** `devops-engineer` (mesmo arquivo; modo entrega)

Copie conforme as TAGs que o consumidor for usar.

## Verificação rápida

1. Abrir o projeto no harness.
2. Confirmar que `AGENTS.md` está no contexto.
3. Claimar uma Issue (`issues next --agent <ia>`) e ver a skill `*-phase` da TAG ser lida.

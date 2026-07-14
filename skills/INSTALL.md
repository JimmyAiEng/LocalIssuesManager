# Instalação do pack (qualquer projeto · qualquer harness)

O pack (CLI `issues` + `AGENTS.md` + skills) viaja num único pacote npm.
Instalação num projeto consumidor é um comando:

```bash
npx @jimmypgomes/issues-local init            # todos os harnesses
npx @jimmypgomes/issues-local init --harness claude-code|cursor|codex|pi
```

O `init` materializa no projeto:

```text
<projeto>/
├── AGENTS.md                 ← entrada do pack, com a versão gravada no cabeçalho
├── CLAUDE.md                 ← criado com "@AGENTS.md" se não existir (claude-code)
├── .agents/skills/<nome>/    ← cópia canônica das skills (padrão aberto Agent Skills)
├── .claude/skills            ← symlink → .agents/skills (claude-code)
└── .cursor/skills            ← symlink → .agents/skills (cursor)
```

Regra: **uma cópia canônica** em `.agents/skills/`; harnesses só linkam.
Se symlink não estiver disponível (ex.: Windows sem privilégio), o `init` cai para cópia e avisa.

## Por harness

| Harness | Descoberta |
|---|---|
| **Codex** | Lê `AGENTS.md` e `.agents/skills/` nativamente; nada a fazer. |
| **Claude Code** | Skills via `.claude/skills`; contexto via `CLAUDE.md` → `@AGENTS.md`. |
| **Cursor** | Lê `AGENTS.md` nativamente; skills via `.cursor/skills`. |
| **Pi** | Lê `AGENTS.md`; aponte o path de skills do pi para `.agents/skills/`. |

## Atualização

Rode o `init` de novo com a versão nova do pacote.
`AGENTS.md` gerenciado pelo pack (cabeçalho `<!-- issues-local pack v… -->`) é atualizado no lugar; um `AGENTS.md` seu só é sobrescrito com `--force`.

## Verificação rápida

1. Abrir o projeto no harness e confirmar que `AGENTS.md` está no contexto.
2. `issues list --pretty` responde (CLI no PATH via `npx` ou install global).
3. Reivindicar trabalho (`issues next --agent <ia>`) e ver a skill `*-phase` do tipo do Ticket ser lida.

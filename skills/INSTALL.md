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
├── AGENTS.md                 ← cria se ausente; se existe, só acrescenta o ponteiro sdlc-workflow
├── CLAUDE.md                 ← criado com "@AGENTS.md" se não existir (claude-code)
├── .agents/skills/<nome>/    ← cópia canônica das skills (padrão Agent Skills)
├── .cursor/skills            ← symlink → .agents/skills
├── .claude/skills            ← symlink → .agents/skills
├── .codex/skills             ← symlink → .agents/skills
└── .pi/skills                ← symlink → .agents/skills
```

Regra: **uma cópia canônica** em `.agents/skills/`; os demais dirs só linkam.
Se symlink não estiver disponível (ex.: Windows sem privilégio), o `init` cai para cópia e avisa.

## Por harness — discovery automática

| Harness | O que o `init` faz | Como o harness descobre |
|---|---|---|
| **Cursor** | `.cursor/skills` → `.agents/skills` | Lê `.agents/skills` e `.cursor/skills` (e compat: `.claude`/`.codex`) |
| **Claude Code** | `.claude/skills` → `.agents/skills` + `CLAUDE.md` | Lê `.claude/skills`; contexto via `CLAUDE.md` → `@AGENTS.md` |
| **Codex** | `.codex/skills` → `.agents/skills` | Lê `.agents/skills` e `.codex/skills` |
| **Pi** | `.pi/skills` → `.agents/skills` | Lê `.agents/skills` e `.pi/skills` (após **trust** do projeto: `pi --approve`) |

Não é preciso apontar path manual no Pi: com `.agents/skills` (ou `.pi/skills`) no projeto e trust concedido, as skills entram no system prompt (descrições) e carregam sob demanda.

## Dogfood neste repositório (pack source)

Aqui o source canônico das skills é `skills/` (publicado no npm). Os harnesses **não** leem `skills/` diretamente.

Para discovery local no pack source (não toca em `AGENTS.md`):

```bash
npm run skills:link
# ou: issues init --dogfood
```

Isso cria (e versiona) os symlinks:

```text
.agents/skills → ../skills
.cursor/skills → ../.agents/skills
.claude/skills → ../.agents/skills
.pi/skills     → ../.agents/skills
.codex/skills  → ../.agents/skills
```

`issues init` sem `--dogfood` na raiz deste repo só acrescentaria o ponteiro se faltasse; prefira `--dogfood` / `skills:link` para ligar as skills.

## Atualização

Rode o `init` de novo com a versão nova do pacote no projeto consumidor.
`AGENTS.md`: se ausente, cria com o ponteiro; se já existe e não cita `sdlc-workflow`, acrescenta o ponteiro; `--force` sobrescreve o arquivo inteiro pelo ponteiro do pack.
Skills em `.agents/skills/` são re-copiadas; links corretos do pack são reutilizados.

Skills extras do consumidor (camada 2) podem viver ao lado em `.agents/skills/<sua-skill>/` — o `init` **sobrescreve** skills com o mesmo nome do pack; use nomes distintos.

## Verificação rápida

1. Abrir o projeto no harness e confirmar `AGENTS.md` no contexto.
2. Confirmar skills do pack na UI do harness (Cursor: Customize → Skills; Pi: `/skill:sdlc-workflow` ou listagem no startup).
3. `issues list --pretty` responde (CLI no PATH via `npx` ou install global).
4. `issues next --agent <ia>` e ver o guia `phases/<action>.md` da Action da Issue ser lido.

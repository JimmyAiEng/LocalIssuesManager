---
name: prototype
description: >-
  Protótipo descartável em git worktree para responder uma pergunta de desenho
  (lógica/estado ou UI). Use na fase Design após design-phase, antes e/ou depois
  do gate de direção; nunca como substituto de TDD de produto.
---

# prototype (camada 2 · Design)

Obtida só após disclosure de [`design-phase`](../design-phase/SKILL.md). Spec: `WORKFLOW.md` §Proto · decisão D03.

## Objetivo

Validar **uma** pergunta de desenho com artefato **throwaway**. O aprendizado (não o código) é o que importa.

Heurística: UI nova, modelo de estado difícil de raciocinar no papel, dúvida estrutural. Se a Spec já é clara → pule proto.

## Obrigatório: worktree

Todo protótipo vive em **git worktree** separado da working tree principal (D03).

```bash
# exemplo — adapte branch/path ao repo
git fetch 2>/dev/null || true
git worktree add -b proto/<nome-curto> .worktrees/proto-<nome-curto> HEAD
cd .worktrees/proto-<nome-curto>
# …trabalhe só aqui…
```

Regras:

1. **Nunca** commitar protótipo na branch principal / default.
2. Nomeie branch e pasta com `proto-` / `prototype` óbvio.
3. Ao terminar: capture a resposta (comentário da Issue Design, `NOTES.md` no worktree, ou ADR) e remova o worktree (`git worktree remove …`) ou deixe branch throwaway referenciada — **não** misture com código de produto.
4. Protótipo **não** substitui TDD da fase Implement.

Se o repo não for git: declare o bloqueio e peça direção humana; não invente “proto” na árvore de produto sem marcação extrema e acordo explícito.

## Escolha o ramo

A pergunta decide a forma:

| Pergunta | Ramo |
|---|---|
| “Esse modelo de estado / lógica faz sentido?” | [LOGIC.md](LOGIC.md) — TUI mínima |
| “Como isso deve parecer?” | [UI.md](UI.md) — N variantes + switcher |

Se ambíguo e o humano não está disponível: backend → LOGIC; página/componente → UI. Declare a assunção no topo do protótipo.

## Regras comuns

1. **Throwaway desde o dia 1**, marcado no nome/path.
2. **Um comando** para rodar (script do task runner do projeto ou README no worktree).
3. **Sem persistência** por padrão (memória). Se a pergunta for persistência, use scratch explícito `PROTOTYPE — wipe me`.
4. **Sem polish:** sem testes, sem abstrações, sem error handling além do necessário para rodar.
5. **Exponha o estado** após cada ação (LOGIC) ou ao trocar variante (UI).
6. **Capture a resposta** e descarte o artefato; só decisões validadas entram na Spec / produto (via Implement).

## Posição no fluxo

Permitido **antes e/ou depois** do gate de direção. Não congela Spec sozinho — após o aprendizado, use `to-spec` (e `to-tickets`).

## Fora de escopo

- Código de produto na working tree principal.
- Skills de Implement (`tdd`, `implement`).

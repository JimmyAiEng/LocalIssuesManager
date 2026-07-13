# Protótipo de lógica (LOGIC)

TUI mínima para o humano dirigir um modelo de estado. Use quando a pergunta é **lógica, transições ou forma dos dados**.

Se a pergunta é visual → [UI.md](UI.md).

Pré-requisito: worktree (`SKILL.md`).

## Quando usar

- Máquina de estados com arestas difíceis no papel.
- “Esse modelo de dados consegue representar o caso X?”
- Sentir a forma de uma API antes de escrevê-la de verdade.

## Processo

### 1. Declare a pergunta

Um parágrafo no README ou comentário no topo do arquivo no worktree.

### 2. Runtime do host

Use a linguagem/tooling do projeto. Não adicione package manager novo só para o proto.

### 3. Isole a lógica num módulo portátil

A lógica que responde a pergunta fica atrás de interface pequena e pura; a TUI é descartável.

Formas úteis: reducer `(state, action) => state` · state machine · funções puras · módulo com superfície clara.

Sem I/O / `console.log` de controle de fluxo na lógica — a TUI importa e chama.

### 4. Menor TUI que exponha o estado

A cada tick: limpe a tela e re-renderize o frame inteiro.

1. Estado atual (pretty-print / JSON).
2. Atalhos no rodapé: `[a] …  [q] quit`.

Loop: init → tecla → dispatch → re-render → até quit. Cabe numa tela.

### 5. Um comando

Script no task runner do projeto **no worktree**, ou comando no README do worktree.

### 6. Entregue e capture

Passe o comando ao humano. Quando responder a pergunta, registre o veredito (Issue Design / `NOTES.md`) e remova o worktree.

## Anti-padrões

- Testes no protótipo.
- Banco real (salvo se a pergunta for persistência).
- Generalizar “para depois”.
- Misturar lógica e TUI.
- Promover a TUI a produto.

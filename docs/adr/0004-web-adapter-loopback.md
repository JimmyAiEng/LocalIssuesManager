# Web adapter local em loopback

## Contexto

A UI v1 precisa mostrar e acionar os mesmos casos de uso da CLI, mantendo os arquivos de Issues como fonte de verdade e sem duplicar regras de domínio. O produto é local, desktop-first e para um Humano; a CLI continua podendo alterar os mesmos arquivos.

## Decisão

`issues web` iniciará um servidor HTTP no mesmo processo, limitado a `127.0.0.1`, que entrega um client estático e uma API JSON. O código ficará em `src/web/` e será um adaptador fino: seus handlers importam apenas `app/*`; não importam `domain/*`, `cli.ts` nem acessam o filesystem das Issues.

O client mantém apenas estado de apresentação (rotas, filtros, scroll, rascunhos e feedback). O servidor é stateless por requisição. Toda leitura e mutação chama os casos de uso existentes. Falha de salvamento obsoleto será exposta como `409 Conflict`; o client preserva o rascunho e relê explicitamente.

A implementação inicial usa Node/TypeScript e assets estáticos, sem framework ou dependência HTTP obrigatória.

## Consequências

- CLI e web preservam uma única fonte de verdade e a matriz de transições existente.
- Não há exposição de rede, autenticação, polling ou sincronização na v1.
- A API é local e interna ao client; não constitui compromisso de API pública.
- `ListIssuesUseCase` deverá aceitar filtro por TAG antes de a interface declarar filtros completos.
- Assets precisam ser incluídos na distribuição do pacote.

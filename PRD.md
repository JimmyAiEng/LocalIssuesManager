# PRD — Issues Locais (CLI)

| Campo | Valor |
|-------|--------|
| Produto | Gerenciador local de Issues via CLI |
| Versão do documento | 1.0 |
| Status | Aprovado (requisitos fechados) |
| Escopo | Single-user, máquina local, Linux PATH |
| Fora de escopo | Orquestração de IAs, sync multi-máquina, UI web, links entre Issues, ritual de trabalho humano, qualidade semântica dos critérios de aceite |

---

## 1. Visão

Substituir GitHub Issues por um sistema local mínimo, acionável por humanos e por IAs (Cursor, Claude Code, Codex, Pi), para que o trabalho diário do humano se concentre em **planejar Issues** e **validar entregas**, enquanto agentes consomem Issues via CLI e seguem um fluxo de status previsível.

O sistema **não** define workflow de engenharia nem orquestra agentes. Ele apenas persiste Issues, histórico e transições de status com regras de autorização.

---

## 2. Objetivos

1. Permitir criar, consultar, listar, claimar e transicionar Issues por CLI instalada no PATH.
2. Garantir que cada Issue em execução tenha no máximo um claim ativo (uma IA por vez).
3. Registrar histórico Human ↔ IA como thread (append-only), atrelado a mudanças de status.
4. Separar claramente o que IA pode fazer do que só humano pode fazer (validação em `AWAITING`, reset de claim).
5. Agrupar Issues por projeto (nome livre) e filtrar a fila / listagens por projeto, status e título.

### Não-objetivos

- Validar se critérios de aceite são bons ou completos.
- Ligar Issues entre si (pai/filho, bloqueios, épicos).
- Migrar TAG SDLC dentro da mesma Issue.
- Reabrir Issue `CLOSED`.
- Apagar Issues (delete físico).
- Conhecer ou agendar agentes além de gravar um enum de identidade no claim.

---

## 3. Personas e atores

| Ator | Identidade no sistema | Papel |
|------|------------------------|--------|
| Humano | Ator distinto das IAs (não faz parte do enum de IA) | Cria Issues, valida `AWAITING`, reseta claims, pode fechar Issues |
| IA | Enum: `cursor` \| `claude-code` \| `codex` \| `pi` | Claima `OPEN`, move para `AWAITING`, pode fechar `OPEN` sob restrições |

O sistema não autentica usuários de rede; a “identidade” é o valor passado na CLI (enum para IA; indicação de humano nos comandos humanos).

---

## 4. Modelo de dados

### 4.1 Issue

Campos obrigatórios na criação:

| Campo | Tipo / regra | Descrição |
|-------|----------------|-----------|
| `id` | gerado pelo sistema | Identificador estável para consulta |
| `title` | string | Título da Issue |
| `project` | string (nome livre) | Exatamente um projeto por Issue; obrigatório |
| `tag` | enum SDLC | Ver §4.2; definido na criação; **imutável** |
| `problem` | texto | Problema a ser resolvido |
| `artifacts` | texto | Menções a arquivos, outras Issues (texto livre), caminhos locais, etc. |
| `acceptance_criteria` | texto | Critérios para considerar concluído |
| `status` | enum de status | Ver §4.3; inicia em `OPEN` |
| `owner` | IA enum ou vazio | Identidade do **último claim**; limpo no reset |
| `closed_reason` | enum ou vazio | Obrigatório quando `status = CLOSED` |

Não há validação de unicidade de título (nem global, nem por projeto).

### 4.2 TAG (fase SDLC)

Enum imutável por Issue:

| TAG | Significado |
|-----|-------------|
| `Planning` | Escopo, requisitos, clareza do que deve ser cumprido |
| `Design` | Arquitetura, especificação técnica, design de interface |
| `Implement` | TDD + codificação |
| `QA` | Validação técnica (stress, análise estática, etc.) |
| `Deployment` | Deploy HML/PROD |
| `Maintenance` | Bug fix |

**Regra:** não há migração de TAG. Avançar no ciclo de vida implica **fechar** a Issue atual e **criar** outra com a nova TAG.

### 4.3 Status

| Status | Significado |
|--------|-------------|
| `OPEN` | Disponível na fila FIFO para claim |
| `CLAIMED` | Travada por uma IA (owner = IA do claim) |
| `AWAITING` | Trabalho da IA concluído; aguarda decisão humana |
| `CLOSED` | Encerrada; motivo obrigatório; **não reabre** |

Motivos de `CLOSED` (enum fixo):

| Motivo | Uso típico |
|--------|------------|
| `obsoleto` | Não faz mais sentido |
| `duplicado` | Redundante com outra Issue (referência só em texto) |
| `concluido` | Aceito / feito |
| `errado` | Criada por engano / incorreta |

### 4.4 Histórico (thread)

Toda mudança de status **exceto** `→ CLAIMED` gera uma entrada de histórico com:

- autor (humano ou IA enum)
- timestamp
- texto do comentário (obrigatório)
- status resultante
- `closed_reason` quando o status resultante for `CLOSED`

Não existe comentário sem mudança de status.

`OPEN → CLAIMED` registra claim (IA + data) nos metadados da Issue, **sem** entrada de thread de comentário.

---

## 5. Matriz de transições

| De | Para | Quem | Comando / mecanismo | Comentário na thread? |
|----|------|------|---------------------|------------------------|
| `OPEN` | `CLAIMED` | IA (enum) | `next` (FIFO + filtro projeto opcional) | Não |
| `CLAIMED` | `AWAITING` | IA owner | Comando de mudança de status (agente) | Sim |
| `CLAIMED` | `OPEN` | **Só humano** | Reset de claim | Sim |
| `AWAITING` | `OPEN` | **Só humano** | Comando humano de decisão | Sim |
| `AWAITING` | `CLOSED` | **Só humano** | Comando humano de decisão + motivo | Sim |
| `OPEN` | `CLOSED` | Humano **ou** IA* | Comando de status + motivo | Sim |
| `CLAIMED` | `CLOSED` | — | **Proibido** | — |
| `CLOSED` | `OPEN` | — | **Proibido** | — |
| `CLOSED` | qualquer | — | **Proibido** (Issue imutável em status) | — |

\* Restrição da IA em `OPEN → CLOSED`: a IA **só** pode fechar se o histórico **não contiver nenhuma ação humana**. Se já houve criação/comentário/reset/decisão humana, apenas o humano pode fechar.

### 5.1 Ownership

- `owner` = identidade da IA do **último claim**.
- Humano pode **resetar**: limpa `owner`, status → `OPEN`.
- Enquanto `CLAIMED`, a Issue não entra na fila do `next`.

### 5.2 Cancelamento em `CLAIMED`

Como `CLAIMED → CLOSED` é proibido:

1. Humano faz reset → `OPEN` (com comentário).
2. Em seguida, humano ou IA elegível faz `OPEN → CLOSED` com motivo.

---

## 6. Comandos CLI (requisitos funcionais)

Os nomes exatos dos binários/subcomandos são de design; o PRD exige **capacidade** equivalente no PATH após instalação.

### RF-01 — Criar Issue

**Entrada obrigatória:** título, projeto, TAG, problema, artefatos, critérios de aceite.  
**Efeito:** Issue criada com `status = OPEN`, sem owner.  
**Ator:** humano ou IA.

**Exemplo:** humano cria Issue de implementação para o projeto `workflowdev`.

**Exceção:** recusar criação se faltar campo obrigatório ou TAG/projeto inválidos (projeto vazio; TAG fora do enum).

### RF-02 — Próxima Issue (`next`)

**Entrada:** identidade IA (enum); filtro opcional de projeto.  
**Seleção:** FIFO entre Issues `OPEN` (mais antiga primeiro), respeitando filtro.  
**Efeito:** `OPEN → CLAIMED`; grava owner = IA e timestamp do claim; **não** cria comentário de thread.  
**Saída:** dados da Issue (incluindo TAG e corpo) para a IA trabalhar.

**Caso de uso:** sessão Cursor inicia o dia, roda `next --project workflowdev --agent cursor`, recebe a Issue mais antiga `OPEN` daquele projeto.

**Exceções:**

- Nenhuma Issue `OPEN` (com o filtro): retorno vazio / erro claro, sem side effect.
- IA fora do enum: rejeitar.
- Issue já `CLAIMED` / `AWAITING` / `CLOSED`: nunca selecionada.

### RF-03 — Mudança de status (comando de agente)

**Uso principal:** `CLAIMED → AWAITING` com texto obrigatório.  
**Também:** `OPEN → CLOSED` quando a IA for elegível (sem histórico humano), com texto + motivo.

**Exceções / bloqueios:**

- IA **não** pode, por este comando, fazer `AWAITING → OPEN` nem `AWAITING → CLOSED` (reservado ao comando humano).
- IA **não** pode `CLAIMED → CLOSED`.
- IA **não** pode `CLAIMED → OPEN` (só reset humano).
- `CLAIMED → AWAITING` só pelo **owner** atual (IA do claim).
- `OPEN → CLOSED` por IA bloqueado se existir qualquer ação humana no histórico.

### RF-04 — Decisão humana em `AWAITING`

Comando **separado**, exclusivo de humano.

**Entradas:** id da Issue; decisão `OPEN` (rejeitar / pedir correção) ou `CLOSED` (aceitar ou encerrar); texto obrigatório; motivo se `CLOSED`.

**Caso de uso:** humano lê entrega da IA, rejeita com lista de problemas → `AWAITING → OPEN`; a Issue volta à fila FIFO; próximo claim vê o histórico completo.

**Caso de uso:** humano aceita → `AWAITING → CLOSED` com motivo `concluido`.

**Exceções:**

- Issue não está `AWAITING`: rejeitar.
- Tentativa de uso por IA / sem indicação humana: rejeitar.
- `CLOSED` sem motivo: rejeitar.

### RF-05 — Reset de claim (humano)

**Efeito:** `CLAIMED → OPEN`; limpa owner; gera comentário na thread.

**Caso de uso:** IA travou ou claim abandonado; humano libera a Issue.

**Exceções:** Issue não está `CLAIMED`; ator não humano.

### RF-06 — Obter Issue por ID

**Entrada:** id (obrigatório).  
**Saída:** Issue completa **incluindo histórico completo** da thread, mesmo se `CLOSED`.

**Exceção:** id inexistente → erro claro.

### RF-07 — Listar / folhear Issues

**Filtros:** status, projeto, título.  
**Saída por item:** metadados + título + **histórico de fases** (pares status + timestamp), **sem** corpo dos comentários.  
**UX:** permitir ir lendo no próprio terminal (paginação / sequencial).

**Caso de uso:** humano lista `AWAITING` do projeto `workflowdev` para validar o inbox do dia.

**Exceção:** filtros sem match → lista vazia (não é erro).

---

## 7. Casos de uso ponta a ponta

### UC-01 — Fluxo feliz (IA + validação humana)

1. Humano cria Issue (`OPEN`, TAG `Implement`, projeto `app`).
2. IA `codex` roda `next --project app` → Issue `CLAIMED` por `codex`.
3. IA implementa fora do sistema; ao final, status → `AWAITING` com texto descrevendo o feito.
4. Humano, no comando de decisão, fecha com `concluido`.
5. Issue permanece `CLOSED`; consultável por ID com histórico completo.

### UC-02 — Rejeição humana

1. Issue em `AWAITING`.
2. Humano decide `OPEN` com comentário dos problemas.
3. Issue volta à fila FIFO.
4. Próximo `next` claima; a IA recebe problema, artefatos, critérios **e** todo o histórico (criação, AWAITING, rejeição).

### UC-03 — IA cria Issue errada e cancela

1. IA `pi` cria Issue (`OPEN`). Histórico ainda sem humano.
2. IA fecha (`OPEN → CLOSED`, motivo `errado`) via comando de status.
3. Sucesso: elegível porque não há ação humana na thread.

### UC-04 — IA tenta fechar Issue tocada por humano

1. Humano criou a Issue (ação humana no histórico).
2. IA tenta `OPEN → CLOSED`.
3. Sistema **rejeita**. Apenas humano pode fechar.

### UC-05 — Tentativa inválida de cancelar em CLAIMED

1. Issue `CLAIMED` por `cursor`.
2. Qualquer ator tenta `CLAIMED → CLOSED`.
3. Sistema **rejeita**.
4. Caminho válido: humano reset → `OPEN`; depois `OPEN → CLOSED`.

### UC-06 — IA tenta decidir AWAITING

1. Issue `AWAITING`.
2. IA chama comando de status para `CLOSED` ou `OPEN`.
3. Sistema **rejeita**; só o comando humano de decisão é aceito.

### UC-07 — Avanço de fase SDLC

1. Issue TAG `Design` é `CLOSED` com `concluido`.
2. Nova Issue é criada com TAG `Implement`, referenciando a anterior apenas em `artifacts`/texto (sistema **não** cria link estrutural).

### UC-08 — Dois projetos na fila

1. Existem Issues `OPEN` em `alpha` e `beta`.
2. `next --project beta --agent cursor` retorna apenas a mais antiga `OPEN` de `beta`.
3. Issues de `alpha` permanecem `OPEN`.

---

## 8. Regras de negócio (resumo normativo)

1. Toda Issue nasce `OPEN` e com TAG definida.
2. TAG nunca muda; ciclo de vida = fechar + criar outra.
3. Projeto é obrigatório e único por Issue (um nome).
4. Fila `next` = FIFO estrito entre `OPEN`, com filtro opcional de projeto.
5. Claim registra IA (enum) + data; owner = último claim.
6. Sem comentário sem mudança de status; claim é a única transição sem thread de comentário.
7. Só humano: reset (`CLAIMED → OPEN`) e decisão (`AWAITING → OPEN|CLOSED`).
8. `CLAIMED → CLOSED` e `CLOSED → *` são impossíveis.
9. IA em `OPEN → CLOSED` somente se histórico sem ação humana.
10. Sem delete físico; encerramento = `CLOSED` + motivo enum.
11. Sistema não valida qualidade de texto nem liga Issues.
12. Listagem não devolve corpos de comentário; get-by-id devolve thread completa.

---

## 9. Exceções e erros (comportamento esperado)

| Situação | Comportamento |
|----------|----------------|
| Campo obrigatório ausente na criação | Recusar |
| TAG / motivo / IA fora do enum | Recusar |
| `next` sem candidatos | Sem mutação; sinalizar vazio |
| Transição inexistente na matriz | Recusar; status inalterado |
| IA age em comando humano | Recusar |
| Não-owner tenta `CLAIMED → AWAITING` | Recusar |
| IA fecha `OPEN` com histórico humano | Recusar |
| Operação em id inexistente | Recusar |
| Comentário vazio em transição que exige thread | Recusar |
| `CLOSED` sem motivo | Recusar |

---

## 10. Requisitos não funcionais

| ID | Requisito |
|----|-----------|
| RNF-01 | Instalável de forma que os comandos básicos fiquem no PATH do Linux nesta máquina |
| RNF-02 | Operação local apenas; sem requisito de rede |
| RNF-03 | Single-user: sem modelo de permissões multi-usuário além das regras humano vs IA da matriz |
| RNF-04 | Saída de `next` e get-by-id deve ser suficiente para uma IA consumir o trabalho sem outra UI |
| RNF-05 | Listagem usável em terminal (leitura sequencial / paginada) |

---

## 11. Fora de escopo (explícito)

- Skill/prompts que ensinam a IA a escrever boas Issues ou bons critérios de aceite  
- Definição do ritual diário do humano  
- Relacionamento estrutural entre Issues  
- Prioridade além de FIFO  
- Sync, backup remoto, multi-máquina  
- UI gráfica / integração nativa com GitHub  
- Comentários neutros (sem mudança de status)  
- Delete físico de Issues  

---

## 12. Critérios de aceite do produto (v1)

O v1 está aceito quando:

1. É possível criar Issue com todos os campos obrigatórios e vê-la `OPEN`.
2. `next` claima em FIFO, grava IA enum + data, e a Issue deixa de aparecer no `next` até voltar a `OPEN`.
3. IA owner consegue `CLAIMED → AWAITING` com texto no histórico.
4. Só o comando humano move `AWAITING` para `OPEN` ou `CLOSED` (com motivo).
5. Humano consegue reset `CLAIMED → OPEN` com texto no histórico.
6. `CLAIMED → CLOSED` e `CLOSED → OPEN` são sempre rejeitados.
7. IA consegue `OPEN → CLOSED` só sem histórico humano; com histórico humano, é rejeitado.
8. Get-by-id mostra thread completa; listagem mostra metadados + título + fases (status + timestamp) e filtra por status, projeto e título.
9. Comandos básicos disponíveis no PATH após instalação.

---

## 13. Glossário

| Termo | Definição |
|-------|-----------|
| Claim | Transição `OPEN → CLAIMED` que reserva a Issue a uma IA |
| Owner | IA do último claim; limpo no reset |
| Thread | Histórico append-only de mudanças de status com comentário |
| FIFO | Ordem da mais antiga `OPEN` para a mais nova |
| TAG | Fase SDLC imutável da Issue |
| Decisão humana | Único caminho de `AWAITING` para `OPEN` ou `CLOSED` |

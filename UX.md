# UX — Interface local de Issues

Status: **proposta validada em descoberta**  
Escopo: design gráfico e interface geral da v1; sem especificação técnica de implementação.

## 1. Princípios

1. **Fluxo visível:** os quatro Status permanecem reconhecíveis ao mesmo tempo.
2. **Decisão com contexto:** transições humanas acontecem somente após abrir todos os detalhes.
3. **Densidade sem ruído:** cards resumem operação; corpos longos ficam na página da Issue.
4. **Estado verdadeiro:** alterações da CLI aparecem mediante atualização explícita; conflitos nunca são ocultados.
5. **Irreversibilidade evidente:** fechar exige confirmação; ações reversíveis não recebem atrito extra.

## 2. Arquitetura da informação

```text
Quadro
├── Controles globais
│   ├── Nova Issue
│   ├── Busca por título
│   ├── Filtro de Projeto
│   ├── Filtro de TAG
│   └── Atualizar + horário da última leitura
├── OPEN
├── CLAIMED
├── AWAITING
└── CLOSED

Issue
├── Voltar ao quadro
├── Identidade e metadados
├── Problema
├── Artefatos
├── Critérios de aceite
├── Thread
└── Ações válidas para o Status

Nova Issue
├── Identificação
├── Definição do trabalho
└── Salvar / Cancelar
```

### Navegação

- O quadro é a entrada e a visão principal.
- Clique em qualquer card leva a `/issues/<id>` conceitualmente; a tecnologia de rotas fica em aberto.
- `Voltar ao quadro` restaura filtros e rolagem da sessão.
- `Nova Issue` abre uma página dedicada de formulário.
- Não existem atalhos de transição nos cards.

## 3. Quadro principal

### Wireframe de desktop

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ISSUES                         [ Buscar título… ] [Projeto ▾] [TAG ▾]  [↻ Atualizar]     │
│ Todos os Projetos                         Atualizado às 14:32             [+ Nova Issue] │
├─────────────────────┬─────────────────────┬─────────────────────┬────────────────────────┤
│ OPEN             12 │ CLAIMED           3 │ AWAITING          2 │ CLOSED              48 │
│ Fila disponível     │ Em trabalho         │ Requer sua decisão  │ Histórico encerrado    │
│                     │                     │                     │                        │
│ ┌─────────────────┐ │ ┌─────────────────┐ │ ┌─────────────────┐ │ ┌────────────────────┐ │
│ │ Corrigir filtro │ │ │ Criar endpoint  │ │ │ Validar login   │ │ │ Migrar configuração│ │
│ │ workflowdev     │ │ │ api             │ │ │ app             │ │ │ infra              │ │
│ │ Maintenance     │ │ │ Implement       │ │ │ QA              │ │ │ Deployment         │ │
│ │ há 2 dias       │ │ │ pi · há 3 horas │ │ │ há 1 dia        │ │ │ há 5 dias          │ │
│ └─────────────────┘ │ └─────────────────┘ │ └─────────────────┘ │ └────────────────────┘ │
│                     │                     │                     │                        │
│       ⋮             │       ⋮             │       ⋮             │        ⋮               │
└─────────────────────┴─────────────────────┴─────────────────────┴────────────────────────┘
```

### Comportamento

- Colunas têm largura equivalente; rolagem vertical acontece por página na proposta inicial.
- Cabeçalho de cada coluna permanece visível durante a leitura quando tecnicamente viável.
- Contagens refletem os filtros ativos.
- Cards são ordenados por `created_at`, crescente.
- Projeto e TAG usam texto; podem receber chips discretos, sem depender apenas de cor.
- Owner aparece apenas quando houver valor.
- Tempo no Status usa formato humano (`há 3 horas`, `há 2 dias`) e data exata em texto auxiliar/tooltip.
- `AWAITING` recebe maior ênfase de borda/cabeçalho por ser o inbox humano, sem mudar sua posição.
- Filtros ativos ficam visíveis e `Limpar filtros` aparece quando qualquer um estiver aplicado.

### Estados do quadro

| Estado | Representação |
|---|---|
| Carregando | esqueletos de cards; controles que dependem dos dados ficam indisponíveis |
| Coluna vazia | mensagem curta dentro da coluna, por exemplo `Nenhuma Issue AWAITING` |
| Busca sem resultado | quatro colunas vazias + `Nenhuma Issue corresponde aos filtros` + limpar filtros |
| Erro inicial | painel de erro com causa útil e botão `Tentar novamente` |
| Atualizando | indicador dentro do botão, mantendo os dados anteriores visíveis |
| Atualizado | horário da última leitura muda; aviso discreto se cards mudaram de coluna |

## 4. Representação visual dos Status

A direção é **escura e técnica**, com superfícies neutras e cores de Status usadas como apoio.

| Status | Semântica | Tratamento sugerido |
|---|---|---|
| `OPEN` | disponível na Fila | azul; ícone de círculo aberto |
| `CLAIMED` | trabalho reservado a uma IA | violeta; ícone de ferramenta/atividade |
| `AWAITING` | aguarda Decisão humana | âmbar; ícone de atenção/inbox; maior destaque |
| `CLOSED` | encerrada e imutável | verde neutro ou cinza; ícone de check |

Regras:

- O nome textual do Status está sempre presente.
- Contraste mínimo adequado deve ser verificado na implementação.
- Vermelho é reservado a erros e ações destrutivas, não a um Status normal.
- TAGs compartilham um estilo neutro para não competir com Status.

### Tokens conceituais

```text
Fundo da aplicação: quase preto azulado
Superfície: cinza azulado escuro
Borda: cinza médio discreto
Texto primário: quase branco
Texto secundário: cinza claro
Ação primária: azul
Ação destrutiva: vermelho
Raio: 6–8 px
Espaçamento base: 8 px
Tipografia UI: sans-serif legível
Dados/IDs: monoespaçada
```

Os valores finais são responsabilidade da implementação e devem atender contraste e foco visível.

## 5. Página da Issue

### Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Voltar ao quadro                                      [↻ Atualizar]       │
├──────────────────────────────────────────────────────────────────────────────┤
│ [AWAITING] [QA]  Validar login                                              │
│ Projeto: app     ID: 7448…     Owner: pi     No Status há 1 dia             │
├──────────────────────────────────────────────┬───────────────────────────────┤
│ PROBLEMA                                     │ AÇÕES                         │
│ Texto completo…                              │ Requer sua Decisão            │
│                                              │ [Devolver para OPEN]          │
│ ARTEFATOS                                    │ [Fechar Issue]                │
│ Texto completo…                              │                               │
│                                              │ DATAS                         │
│ CRITÉRIOS DE ACEITE                          │ Criada …                      │
│ ☐ Critério…                                  │ Claim …                       │
│                                              │ Mudança de Status …           │
│ THREAD                                       │                               │
│ ● Humano · OPEN · data                       │                               │
│ │ Issue created                              │                               │
│ ● pi · AWAITING · data                       │                               │
│   Entrega…                                   │                               │
└──────────────────────────────────────────────┴───────────────────────────────┘
```

### Hierarquia

- Título e Status dominam o cabeçalho.
- Conteúdo e Thread ocupam a área principal de leitura.
- Metadados e ações ficam em uma coluna lateral fixa quando houver espaço.
- Em `CLOSED`, a área de ações é substituída por Motivo de fechamento e mensagem de imutabilidade.
- IDs completos podem ser copiados sem competir visualmente com o título.

### Ações por Status

| Status | Ações humanas disponíveis |
|---|---|
| `OPEN` | Fechar Issue |
| `CLAIMED` | Reset |
| `AWAITING` | Devolver para `OPEN`; fechar Issue |
| `CLOSED` | Nenhuma |

A UI não oferece Claim: essa ação permanece destinada às IAs pela CLI.

## 6. Padrões de transição

### Devolver AWAITING para OPEN

1. Botão `Devolver para OPEN` abre área de comentário.
2. Comentário é obrigatório, com erro junto ao campo.
3. `Confirmar devolução` executa diretamente, sem diálogo adicional.
4. Em sucesso, detalhes são relidos e o novo Status é anunciado.

### Reset de CLAIMED

1. Botão `Fazer Reset` abre área de comentário.
2. Texto explica: “A Issue voltará para OPEN e o Owner será removido”.
3. Comentário é obrigatório.
4. Envio ocorre sem confirmação adicional.

### Fechamento irreversível

1. `Fechar Issue` abre formulário com comentário e Motivo de fechamento.
2. Após validação, abre confirmação final.
3. A confirmação nomeia a Issue e diz que ela não poderá ser reaberta.
4. A ação destrutiva usa rótulo explícito `Fechar definitivamente`, nunca apenas `Confirmar`.

```text
┌──────────────────────────────────────────────────────┐
│ Fechar “Validar login”?                              │
│ Esta ação moverá a Issue para CLOSED e não poderá    │
│ ser desfeita. Motivo: concluido.                     │
│                                                      │
│                         [Cancelar] [Fechar definitivamente] │
└──────────────────────────────────────────────────────┘
```

### Conflito com alteração externa

- Se o Status mudou pela CLI, nenhuma transição otimista é mantida.
- Mostrar: `Esta Issue mudou desde a última atualização.`
- Oferecer `Atualizar Issue`; preservar comentário digitado enquanto ele ainda puder ser útil.
- Após atualizar, esconder ações que deixaram de ser válidas.

## 7. Formulário Nova Issue

Ordem dos campos:

1. título;
2. Projeto;
3. TAG;
4. problema;
5. artefatos;
6. critérios de aceite.

Diretrizes:

- Campos longos usam áreas de texto redimensionáveis.
- TAG usa opções do enum, sem entrada livre.
- Projeto é texto livre, podendo sugerir Projetos existentes sem restringi-los.
- Erros aparecem junto aos campos e há resumo no topo após tentativa inválida.
- `Salvar Issue` é a ação primária; `Cancelar` retorna ao quadro.
- Em erro de persistência, todos os valores permanecem preenchidos.

## 8. Feedback e linguagem

- Sucesso: mensagem curta, por exemplo `Issue devolvida para OPEN`.
- Erro: explicar o que falhou e a próxima ação possível; evitar apenas `Erro inesperado`.
- Botões usam verbo + objeto: `Atualizar quadro`, `Salvar Issue`, `Fazer Reset`.
- Nomes normativos permanecem como definidos em `CONTEXT.md`: Issue, Projeto, TAG, Status, Claim, Owner, Thread, Decisão e Reset.
- Datas relativas sempre têm alternativa exata acessível.

## 9. Acessibilidade e teclado

- Ordem de foco acompanha a leitura: navegação, filtros, colunas da esquerda para a direita, cards de cima para baixo.
- Cards são links reais e acionáveis por teclado.
- Foco é restaurado ao card de origem quando o Humano volta ao quadro.
- Mudanças de Status e mensagens de erro/sucesso são anunciadas por tecnologia assistiva.
- Ícones têm rótulos; cores nunca carregam significado sozinhas.
- Diálogo de fechamento prende o foco até cancelar ou concluir e fecha com `Esc` apenas como cancelamento.

## 10. Limites desta especificação

Este documento não define framework, servidor local, API, acesso ao filesystem, processo de instalação ou estratégia de concorrência técnica. Também não autoriza novas transições de domínio. Essas decisões pertencem à fase técnica posterior e devem preservar o `PRD.md` vigente (§ UI).

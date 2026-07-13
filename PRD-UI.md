# PRD temporário — Interface de Issues

| Campo | Valor |
|---|---|
| Produto | Interface local do Issues Locais |
| Status | Descoberta validada; temporário até sincronização documental |
| Público | Um único Humano, no desktop local |
| Fonte | Diálogo de descoberta de 13/07/2026 e `PRD.md` da CLI |
| Escopo desta Issue | Requisitos funcionais e UX; sem implementação |

> Este documento não substitui o `PRD.md` aprovado da CLI. Ele isola os requisitos propostos para a UI até a revisão humana e a posterior sincronização da documentação principal.

## 1. Problema validado

O Humano que opera o gerenciador local precisa hoje consultar comandos e respostas JSON para entender o andamento do trabalho e tomar Decisões. Isso dificulta a leitura simultânea da Fila, dos Claims, das pendências de validação e do histórico encerrado.

A primeira versão deve oferecer uma visão gráfica única dos quatro Status e reduzir o esforço para acompanhar e decidir, sem remover a CLI nem alterar suas regras de domínio.

### Contexto e público

- Um único Humano, no desktop da mesma máquina onde as Issues são persistidas.
- Uso recorrente para acompanhamento do fluxo e tratamento de `AWAITING`.
- IAs continuam usando a CLI; não são usuárias da interface.
- Todos os Projetos devem poder ser vistos juntos.

### Necessidades e objetivos

1. Reconhecer rapidamente quantas Issues existem em cada Status.
2. Identificar Projeto, TAG, Owner e tempo no Status sem abrir cada Issue.
3. Abrir uma Issue para ler seu conteúdo e sua Thread completa.
4. Executar pela UI as ações humanas já previstas no domínio.
5. Continuar enxergando alterações feitas externamente pela CLI, sob atualização manual.

### Dores tratadas

- JSON e comandos não oferecem visão espacial do fluxo inteiro.
- A triagem de `AWAITING` exige consultas repetidas.
- Claims parados e Issues antigas são menos perceptíveis em uma listagem genérica.
- A execução das ações humanas depende de lembrar comandos e flags.

## 2. Escopo funcional da v1

### RF-UI-01 — Quadro dos quatro Status

Exibir um quadro agregado, com colunas fixas nesta ordem:

1. `OPEN`
2. `CLAIMED`
3. `AWAITING`
4. `CLOSED`

Cada coluna mostra sua contagem e cards ordenados da Issue mais antiga para a mais nova. Todos os Projetos aparecem misturados e cada card identifica seu Projeto.

### RF-UI-02 — Resumo operacional no card

Cada card mostra, no mínimo:

- título;
- Projeto;
- TAG;
- Owner, quando existir;
- tempo decorrido no Status atual.

O card inteiro abre a página dedicada da Issue. Não há mudança de Status por arrastar e soltar nem por menu no card.

### RF-UI-03 — Filtros e busca

O quadro permite combinar:

- busca textual por título;
- filtro por Projeto;
- filtro por TAG.

As quatro colunas permanecem visíveis mesmo sem resultados. Deve existir uma ação clara para limpar filtros.

### RF-UI-04 — Atualização manual

Um botão `Atualizar` relê a fonte local e atualiza quadro, contagens e detalhes. A UI também relê os dados depois de uma ação executada por ela.

Não há atualização automática ou em tempo real na v1. A interface comunica a data e hora da última atualização.

### RF-UI-05 — Página dedicada da Issue

A página de detalhes mostra:

- título, ID, Status, Projeto, TAG e Owner;
- datas de criação, Claim e última mudança de Status, quando aplicáveis;
- problema, artefatos e critérios de aceite;
- Thread completa em ordem cronológica;
- Motivo de fechamento, quando houver;
- ações válidas para o Status atual.

Deve haver retorno explícito ao quadro, preservando filtros e posição de rolagem durante a mesma sessão.

### RF-UI-06 — Criar Issue

A UI oferece formulário com todos os campos obrigatórios atuais:

- título;
- Projeto;
- TAG;
- problema;
- artefatos;
- critérios de aceite.

A criação é registrada como ação Humana e resulta em `OPEN`. O formulário valida campos obrigatórios e enums antes do envio, preserva os valores se houver erro e, em caso de sucesso, abre a Issue criada.

### RF-UI-07 — Decisão humana

Em uma Issue `AWAITING`, a página permite:

- devolver para `OPEN`, exigindo comentário;
- fechar como `CLOSED`, exigindo comentário e Motivo de fechamento.

O fechamento, por ser irreversível, exige confirmação explícita. A devolução para `OPEN` não exige uma segunda confirmação.

### RF-UI-08 — Reset de Claim

Em uma Issue `CLAIMED`, a página permite Reset para `OPEN`, exigindo comentário. A ação não exige confirmação adicional e deve explicar que o Owner será limpo.

### RF-UI-09 — Fechar Issue OPEN

Em uma Issue `OPEN`, a página permite fechamento Humano com comentário e Motivo de fechamento. A ação exige confirmação explícita e informa que uma Issue `CLOSED` não reabre.

### RF-UI-10 — Regras e concorrência

- A UI respeita integralmente a matriz de transições do `PRD.md`.
- Somente ações válidas para o Status atual são apresentadas.
- Antes de persistir uma transição, a UI considera os dados atuais da Issue.
- Se a CLI tiver alterado a Issue desde a última leitura, a UI não presume sucesso: informa o conflito, mantém o texto digitado quando aplicável e oferece `Atualizar`.
- Erros não podem deixar a interface representando uma transição que não foi persistida.

### RF-UI-11 — Estados de interface

Quadro e página de detalhes devem tratar explicitamente:

- carregamento;
- resultado vazio;
- erro de leitura;
- erro de validação;
- conflito por alteração externa;
- sucesso de ação.

## 3. Casos de uso prioritários

### UC-UI-01 — Acompanhar o fluxo

1. Humano abre o quadro.
2. Visualiza contagens e cards nos quatro Status, entre todos os Projetos.
3. Usa busca ou filtros se necessário.
4. Aciona `Atualizar` para incorporar mudanças feitas pela CLI.

### UC-UI-02 — Aceitar uma entrega

1. Humano abre um card em `AWAITING`.
2. Lê problema, critérios, artefatos e Thread.
3. Escolhe fechar, informa comentário e Motivo.
4. Confirma a ação irreversível.
5. A Issue passa a `CLOSED` e os dados são relidos.

### UC-UI-03 — Pedir retrabalho

1. Humano abre uma Issue `AWAITING`.
2. Escolhe devolver para `OPEN` e escreve o comentário.
3. A UI executa a Decisão sem confirmação adicional.
4. A Issue reaparece em `OPEN` após releitura.

### UC-UI-04 — Liberar um Claim

1. Humano identifica uma Issue antiga em `CLAIMED`.
2. Abre os detalhes, escolhe Reset e informa o comentário.
3. A Issue volta a `OPEN` e perde o Owner.

### UC-UI-05 — Criar trabalho

1. Humano abre `Nova Issue`.
2. Preenche os campos obrigatórios.
3. Corrige eventuais erros sem perder os dados.
4. Salva e é direcionado aos detalhes da nova Issue `OPEN`.

## 4. Requisitos não funcionais e limites

- **Local e single-user:** nenhum requisito de autenticação, conta ou colaboração remota na v1.
- **Desktop-first:** a experiência é desenhada para tela de desktop; responsividade móvel não é critério de aceite.
- **Consistência:** a CLI permanece válida e pode alterar os mesmos dados fora da UI.
- **Terminologia:** usar os termos normativos de `CONTEXT.md`, sem traduzir nomes de Status, TAG ou Motivo.
- **Acessibilidade básica:** navegação por teclado, foco visível, rótulos textuais e contraste suficiente; cor não pode ser o único indicador de Status ou erro.
- **Desempenho percebido:** ações devem fornecer feedback imediato de carregamento, sucesso ou falha; metas quantitativas dependem da definição técnica posterior.

## 5. Fora de escopo

- Implementar a UI nesta Issue.
- Alterar regras, enums, persistência ou comandos existentes da CLI.
- Uso por IAs, múltiplos Humanos, autenticação ou autorização de rede.
- Acesso remoto, sincronização entre máquinas e colaboração em tempo real.
- Atualização automática, notificações push ou polling.
- Drag-and-drop entre Status.
- Editar uma Issue existente.
- Reabrir `CLOSED`, apagar Issue ou adicionar comentários sem transição.
- Prioridade manual diferente da ordenação por antiguidade.
- Experiência móvel dedicada.

## 6. Decisões registradas

| Tema | Decisão validada |
|---|---|
| Público | Só o Humano, em desktop local |
| Objetivo principal | Acompanhar e decidir |
| Cobertura | Visualizar todos os Status e executar filtros, detalhes, Decisão, Reset, criação e fechamento Humano de `OPEN` |
| Organização | Quadro com quatro colunas e todos os Projetos misturados |
| Detalhes | Página dedicada |
| Atualização | Manual por botão e automática apenas após ação da própria UI |
| Confirmações | Somente fechamentos irreversíveis |
| Aparência | Escura e técnica |
| Cards | Resumo operacional |
| Ordenação | Mais antigas primeiro |
| Transições | Botões nos detalhes; sem arrastar |

## 7. Premissas

- A UI consumirá a mesma fonte de verdade local da CLI; o mecanismo técnico será definido em uma Issue posterior.
- “Mais antiga” no quadro significa `created_at`, mantendo uma regra simples e coerente com a Fila FIFO.
- O tempo no Status deriva do último registro de `phases`/`status_changed_at`.
- Filtro de Projeto aceita um ou mais Projetos sem separar o quadro em seções.
- `CLOSED` participa inicialmente da mesma ordenação e filtragem; paginação ou limite visual serão definidos após medir volume real.

## 8. Questões em aberto

Não bloqueiam a validação do problema nem o design geral, mas devem ser resolvidas antes da implementação:

1. Qual tecnologia e processo local servirão a interface sem duplicar regras de domínio?
2. Qual volume real de Issues exige paginação, carregamento incremental ou limite em `CLOSED`?
3. O filtro de Projeto será seleção única ou múltipla no componente final?
4. Qual intervalo define as faixas visuais de “tempo no Status” sem criar uma prioridade nova?
5. A UI deve ser aberta por comando próprio ou integrada ao comando `issues`?

## 9. Critérios de aceite desta descoberta

- [x] Problema, público, contexto, necessidades, objetivos, dores, casos de uso, escopo e limites definidos e validados por diálogo.
- [x] Requisitos funcionais da UI registrados separadamente do PRD vigente, cobrindo `OPEN`, `CLAIMED`, `AWAITING` e `CLOSED`.
- [x] Decisões, premissas e questões em aberto registradas.
- [x] Organização, navegação e representação dos quatro Status especificadas em `UX.md`.
- [x] Nenhuma implementação de UI incluída nesta Issue.

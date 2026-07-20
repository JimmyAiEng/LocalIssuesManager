# QA Visual — issues web

Revisão de qualidade visual e comportamental do painel `issues web`, dirigida por Playwright (Chromium headless) contra o binário real (`./bin/issues web`) com uma fila temporária semeada via CLI.
Data: 2026-07-17.
Base de comparação render × código: `src/web/client/*` e `src/web/api.ts`.

## Resumo executivo

Veredito: APROVADO COM RESSALVAS.
O painel está sólido e coerente com o contrato do código na esmagadora maioria dos fluxos; nenhum bug bloqueante foi encontrado.
Há 1 divergência render × código de severidade Média (aviso contraditório na Design sem mudança de arquitetura) e 3 achados menores (ruído de console/rede, rejeição de clipboard não tratada, caixa de AC vazia).

Contagem por severidade: Alta 0 · Média 1 · Baixa 3.
Screenshots gerados: 24, em `docs/qa/web-screenshots/`.

## Remediação (2026-07-17)

- M-1 (Média) — CORRIGIDO: `detail_view.js` suprime o aviso "Spec sem diagrama" quando `architecture_changed === false` (atalho ao plano). Coberto por teste E2E de UI `UI-12d` em `test/e2e/ui.test.ts`.
- B-2 (Baixa) — CORRIGIDO: `handlers.js` trata a Promise de `navigator.clipboard.writeText` — "ID copiado" só no sucesso, "Falha ao copiar" na rejeição; sem `pageerror` não tratado.
- B-3 (Baixa) — ACEITO como está: a seção "Critérios de aceite" é placeholder consistente e o teste `UI-04a` verifica sua presença; escondê-la para AC ausente é decisão cosmética que o usuário pode pedir depois.
- B-1 (Baixa) — ACEITO como está: os 404 de requirements/design são o padrão "tenta e 404" (tela limpa; só ruído no DevTools). O conserto exigiria serializar o fetch (buscar a Issue e só então requirements/design pela action), piorando a latência de abrir cada detalhe — trade-off que não compensa por ruído de console. Fica registrado para decisão do usuário.

Após as correções: `typecheck` ok, `lint` ok, suíte cheia verde (416 testes, +1 `UI-12d`).

Erros de console/pageerror capturados na sessão:
- 8× `Failed to load resource: the server responded with a status of 404 (Not Found)` (GET `/requirements` e `/design` de Issues sem esses artefatos).
- 1× `pageerror: NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write permission denied` (ao clicar "Copiar ID").

## Achados

### M-1 (Média) — Design sem mudança de arquitetura ainda avisa "Spec sem diagrama"

Numa Issue de Design com `architecture_changed = false`, o painel mostra, lado a lado e se contradizendo:
a decisão "Arquitetura inalterada — atalho ao plano, sem diagramas" e, logo abaixo, o alerta "Spec sem diagrama — use `issues design add`."
O gate de domínio trata `false` como atalho que dispensa diagramas (`src/domain/design_gate.ts:112`, `if (!changed) return []`), e o pacote retorna `validation.ready = true` sem nenhum erro.
Ou seja: o alerta é puramente cosmético e falsamente sugere um estado incompleto/ inválido de uma Issue que está, na verdade, conforme.

O que se esperava: sem diagrama exigido quando a arquitetura não muda, portanto sem aviso de diagrama faltando.
O que apareceu: aviso de diagrama faltando contradizendo a própria decisão exibida acima.

Evidência: `docs/qa/web-screenshots/09-design-arch-false.png`.
Código: `src/web/client/detail_view.js:94-96` — o ramo `else` (`kinds.length` falso) emite o aviso sem checar `pack.architecture_changed === false`.
Sugestão: suprimir o aviso "Spec sem diagrama" quando `pack.architecture_changed === false` (mantê-lo apenas para `true`, em que o diagrama é de fato exigido).

### B-1 (Baixa) — Console e rede poluídos com 404 a cada detalhe e a cada poll (10s)

Ao abrir qualquer detalhe, o cliente dispara `GET /api/issues/<id>/requirements` e `GET /api/issues/<id>/design`; para Issues que não são Planning/Design a API responde 404.
O cliente engole o erro (`fetchRequirements`/`fetchDesign` retornam `null`) e a tela fica limpa — mas o navegador registra cada 404 no console e na aba de rede, e o poll de `refreshIssue` re-dispara isso a cada 10s.
Numa única passagem pelos detalhes, 8 respostas 404 distintas foram capturadas; num detalhe aberto por minutos, o acúmulo é contínuo.

O que se esperava: silêncio também no console/rede para um estado esperado (artefato ausente).
O que apareceu: 404 recorrentes no DevTools a cada 10s.

Evidência: seção "console/pageerror" acima; lista de requests 4xx no log da execução.
Código: `src/web/client/mutations.js:177-185` (o comentário diz "sem ruído na tela", verdadeiro para a tela mas não para o console/rede) e `src/web/api.ts:51-56` (404 para requirements/design ausentes).
Sugestão: expor um flag `has_requirements`/`has_design` no resumo/detalhe da Issue, ou responder 200 com corpo `null`, evitando o 404 recorrente. É um trade-off do padrão "tenta e 404"; funcionalmente inofensivo, mas é ruído de engenharia.

### B-2 (Baixa) — "Copiar ID" gera rejeição de Promise não tratada e feedback possivelmente falso

O clique em "Copiar ID" chama `navigator.clipboard?.writeText(...)` sem tratar a Promise retornada.
Em contexto sem permissão de clipboard (headless/inseguro), a Promise rejeita e emana como `pageerror` (`NotAllowedError`).
Pior: o texto do botão vira "ID copiado" independentemente de sucesso ou falha da cópia, podendo mentir para o usuário.

O que se esperava: cópia com tratamento de falha e feedback condicionado ao sucesso.
O que apareceu: rejeição não tratada e "ID copiado" mesmo quando a cópia falha.

Evidência: `pageerror` capturado logo após o clique (cena 19 do driver).
Código: `src/web/client/handlers.js:57-61`.
Observação: em https/localhost com permissão concedida a cópia normalmente funciona, então pode não reproduzir para o usuário final; ainda assim a rejeição sem `.catch` e o feedback incondicional são lacunas reais.

### B-3 (Baixa) — Seção "Critérios de aceite" renderiza caixa vazia quando não há AC

Issues sem `acceptance_criteria` (ex. as de Deploy e Design semeadas) exibem a caixa "Critérios de aceite" só com o título, sem conteúdo.
`criteriaField` sempre renderiza a seção, mesmo com valor vazio.

O que se esperava: omitir a seção (ou um placeholder discreto) quando não há critérios.
O que apareceu: caixa titulada vazia, levemente ruidosa.

Evidência: `docs/qa/web-screenshots/13b-deploy-viewport.png` e `09-design-arch-false.png`.
Código: `src/web/client/detail_view.js:129-135`.

## Notas (não são defeitos)

Sobre a `.actionbar`: nas capturas em modo `fullPage` a barra "Ações" aparece sobreposta ao conteúdo do meio da página.
Isso é artefato do casamento `fullPage` + `position: sticky` do Playwright (`src/web/client/style.css:161-162`), não um bug: nas capturas em viewport a barra funciona corretamente como rodapé fixo (ver `04b`, `21`, `13b`).

Sobre checklist de AC: `parseChecklist` (`src/web/client/view_model.js:89-96`) só reconhece `[ ]`/`[x]` sem hífen, enquanto `renderMarkdown` reconhece o formato markdown `- [ ]`.
Não há bug visível: entradas `- [ ]` caem no fallback de markdown e ainda renderizam checkboxes desabilitados; é apenas uma duplicação de caminhos de código.

## Componentes exercitados (checklist)

- [x] Quadro: 4 colunas, contagem por Status (OPEN 2 / CLAIMED 4 / AWAITING 2 / CLOSED 1), ordenação, cards (título/projeto/tipo/action/owner/tempo/relacionadas/tags).
- [x] Badge e inbox de "Decisões pendentes" (abrir/fechar; lista as Issues AWAITING com badge de action).
- [x] Filtros: título, projeto, tipo, owner; "Limpar filtros"; "Atualizar quadro" com hora da última leitura.
- [x] Chips de classificação nos cards (human_need/complexity/risk) e badge "não classificada".
- [x] Detalhe: metadados, "Copiar ID", "No Status há…", Problema (markdown), Critérios de aceite (checklist markdown).
- [x] Editor de tags ("Classificar Issue") expansível.
- [x] Linhagem "Issues relacionadas" com kinds tipados (parent/child) e artefatos das relacionadas, navegável.
- [x] Requisitos: painel Gherkin renderizado (Feature/Scenario/Given/When/Then).
- [x] Design: decisão de arquitetura (true → 4 níveis; false → atalho), design.md renderizado, 4 diagramas PlantUML renderizados como SVG (class/component/package/activity).
- [x] Worktree: seção com path e branch (Issue Implement).
- [x] Artefato: seção da Issue QA (relatório .md renderizado).
- [x] Thread append-only com badges de papel (architect, test-coding), autor e status.
- [x] Ações por Status: OPEN (Assumir/Fechar), CLAIMED (Reset), AWAITING (Aprovar / Devolver para OPEN / Fechar), CLOSED (imutável, sem barra, sem comentar).
- [x] Confirmação irreversível de fechamento (alertdialog "Fechar definitivamente").
- [x] Comentar: painel de comentário com campo de anexo.
- [x] Nova Issue: formulário, validação prévia (5 erros de campo no submit vazio), campo de anexo.
- [x] Console/pageerror/requests 4xx-5xx capturados durante toda a navegação.
- [x] Acessibilidade básica: labels envolvendo controles, `h1` único, regiões `aria-live`.

## O que está sólido

O quadro, os filtros, o inbox de decisões, a linhagem tipada, os papéis na thread, os diagramas PlantUML, a decisão de arquitetura, os gates de ação por Status, a confirmação de fechamento irreversível, a preservação de expansão dos `<details>` e a validação do formulário de criação estão todos corretos e alinhados ao contrato do código.
Nenhum layout quebrado, texto truncado ou estado inconsistente foi observado nos fluxos de viewport.
As 4 imagens de diagrama carregaram e decodificaram (SVG real servido pela rota `/design/<kind>.svg`).

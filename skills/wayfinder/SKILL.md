---
name: wayfinder
description: >-
  Planeja trabalho grande demais para uma sessão como mapa compartilhado de
  Issues de decisão no issues-local, e resolve uma de cada vez até o caminho
  ficar claro. Use sob TAG=Planning quando o escopo estiver em névoa (user-invoked).
disable-model-invocation: true
---

# wayfinder

Uma ideia frouxa chegou — grande demais para uma sessão, envolta em névoa: o caminho até o **destino** ainda não é visível. Wayfinding acha esse caminho; não corre cego até o destino. Esta skill desenha o caminho como **mapa compartilhado** no issues-local e trabalha **Issues de decisão** (perguntas cuja resolução é uma decisão, não fatias de build) uma de cada vez até a rota ficar clara.

## Planejar, não fazer

Por padrão, wayfinder é **planejamento**: cada Issue resolve uma decisão; o mapa termina quando o caminho está claro — nada mais a decidir antes de alguém ir fazer. A tentação de “já implementar” costuma sinalizar a borda do mapa: hora de encerrar Planning e abrir Design/Implement. Uma Nota no mapa pode autorizar execução pontual; sem isso, produza decisões, não entregáveis de produto.

## Referir pelo nome

Toda Issue tem **título**. Na narração e no índice “Decisões até agora”, cite pelo **título** (o id pode ir entre parênteses), nunca só por UUID. Nomes legíveis > paredes de ids.

## O mapa

O mapa canônico é um **arquivo Markdown no repo** (formato em [map-format.md](map-format.md)), referenciado pela Issue índice em `artifacts`. A Issue índice tem TAG=`Planning` e o mesmo **projeto** das Issues-ticket.

O mapa é **índice**, não armazém: lista decisões e aponta para as Issues que guardam o detalhe. A decisão vive em um só lugar — a Issue-ticket.

Sem labels de tracker externo. Sem grafo de blocking: Issues são **independentes**. Ordem sugerida e fronteira ficam no próprio mapa.

### Issues-ticket

Cada ticket é uma **Issue irmã independente** (mesmo projeto recomendado), TAG=`Planning` (ou a TAG que o humano pedir para investigação). Corpo mínimo no campo `problem`:

```markdown
## Pergunta

<decisão ou investigação que esta Issue resolve>
```

Tipos (anote no título ou em `artifacts`, não como label GitHub):

| Tipo | HITL / AFK | Como resolver |
|---|---|---|
| `research` | AFK | Skill `research` |
| `domain` | HITL | Skill `domain-modeling` — conversa + glossário/ADR |
| `esboço` | HITL | Artefato barato na conversa ou Issue **Design** futura; **não** carregue `prototype` (fase Design) nesta TAG |
| `tarefa` | HITL ou AFK | Trabalho manual que desbloqueia uma *decisão* (acesso, amostra de dados) — não entrega o destino |

HITL: humano fala por si; o agente não responde no lugar dele. Resolução HITL tipicamente passa por `AWAITING` → `issues decide --human`.

## Névoa e fora de escopo

Não cartografe o que ainda não enxerga. **Ainda não especificado** = no escopo, mas sem pergunta afiada. Ticket quando a pergunta já é precisa (mesmo que você ainda não possa respondê-la). Fora de escopo = além do destino; fechar a Issue se já existir e registrar uma linha em **Fora de escopo**.

## Operações issues-local

| Ação | Comando / prática |
|---|---|
| Criar mapa + tickets | `issues create … --agent <ia>` (ou `--human`); arquivo do mapa no repo; `artifacts` aponta para o arquivo |
| Ver fronteira | Ler o mapa + `issues list --project <p> --status OPEN` |
| Claim de ticket | `issues next --agent <ia> --project <p>` (FIFO; filtre pelo projeto do esforço) |
| Precisa do humano | `issues status … --status AWAITING --comment "…"` |
| Fechar ticket resolvido | `issues status … --status CLOSED --reason concluido --comment "…"` (se `human_presence` impedir, `AWAITING` + decide) |
| Atualizar índice | Editar o Markdown do mapa (Decisões / Fronteira / Névoa) |

Paralelo entre tickets OPEN do mesmo projeto é permitido; espere edição concorrente do mapa.

## Invocação

Nunca resolva mais de **um** ticket HITL por sessão (research AFK em paralelo ok).

### Traçar o mapa

1. Nomear o **destino** com `domain-modeling` (e conversa) — fixa o escopo.
2. Mapear a fronteira em largura: decisões abertas e primeiros passos. Se não houver névoa (tudo cabe numa sessão), **não** crie mapa; pergunte como seguir.
3. Criar o arquivo do mapa + Issue índice.
4. Criar Issues-ticket que já forem especificáveis; listá-las em **Fronteira sugerida**. O resto fica em **Ainda não especificado**.
5. Disparar `research` em paralelo para tickets `research`.
6. Parar — traçar o mapa é o trabalho desta sessão; não resolva tickets HITL aqui.

### Trabalhar o mapa

1. Carregar o mapa (arquivo) — visão de baixa resolução.
2. Escolher o ticket: o que o humano nomeou, ou o primeiro da **Fronteira sugerida** ainda OPEN. Claim via `issues next --project …` (garanta que a fila do projeto corresponda).
3. Resolver com a skill do tipo; zoom sob demanda em Issues fechadas ligadas.
4. Registrar: comentário de resolução, fechar (ou `AWAITING`), append em **Decisões até agora**, atualizar fronteira/névoa.
5. Se a resposta invalidar partes do mapa, atualize ou feche Issues (`obsoleto` / `errado`) e ajuste **Fora de escopo**.

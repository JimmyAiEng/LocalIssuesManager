---
name: research
description: >-
  Investiga uma pergunta em fontes primárias de alta confiança e grava os
  achados em Markdown no repo. Use sob TAG=Planning quando faltar fato externo
  ou de docs/API (model-invoked; preferir agente em background).
---

# research

Dispare um **agente em background** (ou subtarefa equivalente do harness) para pesquisar, enquanto a sessão principal segue.

Trabalho do pesquisador:

1. Investigar a pergunta em **fontes primárias** — docs oficiais, código-fonte, specs, APIs de primeira parte — não resumos secundários. Cada afirmação deve apontar para a fonte que a possui.
2. Escrever os achados em **um** arquivo Markdown, com citação por afirmação (URL ou caminho + trecho/âncora quando possível).
3. Salvar onde o repo já guarda notas semelhantes; se não houver convenção, usar algo sensato (ex.: `docs/research/<slug>.md`) e dizer onde ficou.
4. Idioma do artefato: **pt-BR**, salvo se a Issue/pedido pedir outro.

Adaptada de [mattpocock/skills · research](https://github.com/mattpocock/skills).

## Quando usar

- Ticket `research` do [`wayfinder`](../wayfinder/SKILL.md).
- Planning precisa de fato fora do working tree atual (API de terceiro, RFC, comportamento de lib).
- Humano pediu pesquisa citada.

## O que não fazer

- Não inventar a partir de conhecimento paramétrico sem checar a fonte.
- Não substituir [`domain-modeling`](../domain-modeling/SKILL.md): research traz fatos; domínio afia linguagem/decisões.
- Não carregar skills de outras fases.

## Saída mínima

Arquivo Markdown com: pergunta, achados, limitações/incertezas, lista de fontes. Se veio de uma Issue, referencie o **título** da Issue e atualize `artifacts` / comentário de fechamento apontando o caminho do arquivo.

## Operações issues-local

Ao fechar o ticket de pesquisa: `issues status … --status CLOSED --reason concluido --comment "Achados em <caminho>"` (ou `AWAITING` se `human_presence` exigir Decisão).

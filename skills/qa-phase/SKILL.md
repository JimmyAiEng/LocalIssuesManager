---
name: qa-phase
description: >-
  Fase QA do workflow: validar o conjunto entregue (≠ review de Implement) e
  pedir o gate G3. Use quando o Ticket claimado tem type=QA.
---

Você tem a responsabilidade de estressar e encontrar falhas no processo de solução da Issue. 
Com base apenas na Issue e com o código atual (após implementação), você deverá testar rigorosamente:
1. A execução dos testes 
2. As evidências da solução, e se a solução atende a Issue
3. O design da implementação (se segue a linguagem ubíqua, os padrões do repositório, os padrões de arquitetura, etc)
4. A segurança dos endpoints e do código em si

Você somente valida o conjunto entregue se não encontrar nenhum problema grave. Se encontrar, você deve criar novo ticket de design ou de implement para resolver o problema identificado. 

## Detalhes das Validações da fase

- Cada requisito/critério de aceitação da Issue confrontado com o comportamento real do produto (rodar > ler).
- Integração entre as fatias entregues (o conjunto funciona junto, não só cada fatia isolada).
- Registre o veredicto e os achados no Artefato da Issue: `issues artifact --id <issueId> --file <qa.md>`.

## Heurísticas

- **Não** trate isto como o review interno de Implement; QA valida o conjunto, não a fatia.
- Preferir **outro** harness/modelo que o da Implement — recomendado, não obrigatório.
- Retrabalho: `decide OPEN` ou cria Tickets Design ou Implement novos (independentes).
- **Como** validar (perspectivas, ferramentas, cobertura) é decisão do agente.

## Saídas

Veredicto + achados; pedido claro de G3 no comentário.

## Encerramento

Mova o **Ticket** para `AWAITING`:
`issues ticket status --issue <id> --id <tid> --agent <ia> --status AWAITING --comment "…"`.

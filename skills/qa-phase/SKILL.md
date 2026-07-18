---
name: qa-phase
description: >-
  Action QA do workflow: validar o conjunto entregue (≠ review de Implement).
  Use quando a Issue reivindicada tem action=QA.
---

Você tem a responsabilidade de estressar e encontrar falhas no que foi entregue pelas Issues relacionadas.
Com base na Issue e no código atual, teste rigorosamente:
1. A execução dos testes.
2. As evidências da solução, e se a solução atende ao problema original.
3. O design da implementação (linguagem ubíqua, padrões do repositório, arquitetura).
4. A segurança dos endpoints e do código em si.

Se encontrar problema grave, crie uma nova Issue (`Design` ou `Implement`) relacionada para resolvê-lo.

## Detalhes das validações

- Cada requisito/critério de aceitação confrontado com o comportamento real do produto (rodar > ler).
- Integração entre as fatias entregues (o conjunto funciona junto, não só cada fatia isolada).
- Registre o veredicto e os achados no Artefato: `issues artifact --id <id> --file <qa.md>` (≤300 palavras).

## Heurísticas

- **Não** trate isto como o review interno de Implement; QA valida o conjunto.
- Preferir **outro** harness/modelo que o da implementação — recomendado, não obrigatório.
- **Como** validar (perspectivas, ferramentas, cobertura) é decisão do agente.

## Encerramento

O gate de conclusão exige o Artefato .md persistido com o resultado da validação requisito×comportamento — sem ele a Issue não conclui (nem AFK nem para decisão humana).
Grave o veredito antes de concluir: `issues artifact --id <id> --file <qa.md>` (≤300 palavras).
Depois conclua: `issues status --id <id> --agent <ia> --status AWAITING|CLOSED --comment "<veredicto + achados>" [--reason concluido]`.

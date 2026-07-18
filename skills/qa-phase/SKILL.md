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

## Heurísticas

- **Não** trate isto como o review interno de Implement; QA valida o conjunto.
- Preferir **outro** harness/modelo que o da implementação — recomendado, não obrigatório.
- **Como** validar (perspectivas, ferramentas, cobertura) é decisão do agente.

## Entrega — o Artefato do veredito

O gate exige este artefato persistido: sem ele a Issue não conclui (nem AFK nem para decisão humana).

```bash
issues artifact --id <id> --file ./artifact.md
```

O **nome do arquivo é irrelevante** (o conteúdo é gravado na Issue); use `./artifact.md` e não gaste tempo decidindo.
Máximo 300 palavras.
Esqueleto:

```markdown
# Veredito

APROVADO | APROVADO com ressalva | REPROVADO

## Requisito × comportamento

- Feature "<nome>" / <cenário>: OK — <o que você observou rodando>
- Feature "<nome>" / <cenário>: FALHA — <o que aconteceu de fato>

## Achados

- <achado + a Issue criada para resolvê-lo, ou "Nenhum">

## Como validei

<comandos rodados e o que foi exercitado de verdade>
```

## Encerramento

```bash
issues status --id <id> --agent <ia> --status CLOSED \
  --comment "<veredicto + achados>" --reason concluido
```

Use `--status AWAITING` (sem `--reason`) se a Issue é HITL, `risk=ALTO` ou `complexity=ALTA`.
Concluída a Issue, **encerre a sessão**: não busque outra Issue.

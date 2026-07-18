---
name: planning-phase
description: >-
  Action Planning do workflow: alinhar problema, requisitos e domínio, e entregar
  requisitos Gherkin válidos. Use quando a Issue reivindicada tem action=Planning.
---

Estude o problema da Issue, o repositório do projeto e me entreviste ativamente sobre cada aspecto até termos um entendimento comum do que deve ser feito.
Busque identificar os requisitos funcionais e não funcionais, e resolva as dúvidas por meio de grupos de 3 perguntas.
Para cada pergunta, sugira uma resposta, e espere o feedback do grupo antes de continuar.
Se um *fato* puder ser encontrado explorando o codebase ou o texto da Issue, explore-o em vez de perguntar.
As decisões de requisitos funcionais, contudo, são do humano.

**Heurísticas**:
- Escopo grande demais para uma sessão → crie Issues menores relacionadas e abandone esta (`--reason obsoleto`).
- Foque nos requisitos funcionais, descritos em termos do usuário/domínio, não da solução.
- **Como** planejar (pesquisa, glossário, ADRs, etc.) é decisão do agente.

## Entrega 1 — requisitos Gherkin

```bash
issues requirements set --id <id> --file ./req.json
```

Um JSON com o campo `features`: de 1 a 5 Features em Gherkin pt-BR, cada uma uma string.
O validador é rígido — copie este formato:

```json
{
  "features": [
    "Feature: Login com e-mail\nComo um usuário cadastrado\nEu quero poder entrar com e-mail e senha\nPara que eu acesse minha conta\n\nScenario: Credenciais válidas\nGiven que eu tenho uma conta ativa\nWhen eu envio e-mail e senha corretos\nThen eu vejo a minha área logada\n\nScenario: Senha errada\nGiven que eu tenho uma conta ativa\nWhen eu envio a senha errada\nThen eu vejo a mensagem de credenciais inválidas\nAnd eu continuo na tela de login",
    "Feature: Recuperação de senha\nComo um usuário cadastrado\nEu quero poder redefinir minha senha\nPara que eu volte a acessar a conta quando esquecer\n\nScenario: Link enviado\nGiven que eu informo um e-mail cadastrado\nWhen eu peço a redefinição\nThen eu recebo um e-mail com o link de redefinição"
  ]
}
```

Regras que o validador cobra em **cada** Feature, nesta ordem exata:
1. Primeira linha: `Feature: <nome>`.
2. Três linhas de user story: `Como um …`, `Eu quero poder …`, `Para que eu …` — nesta ordem, cada uma com conteúdo.
3. Depois, só `Scenario: <nome>` e steps começando com `Given`, `When`, `Then` ou `And`.
4. Todo Scenario precisa de pelo menos um step; nenhum texto solto antes do primeiro Scenario.

Linhas em branco são ignoradas; cada Feature tem no máximo 300 palavras.

## Entrega 2 — uma Issue Design por Feature

O gate exige **uma filha `action=Design` por Feature** antes de fechar.
O casamento é pelo **nome da Feature contido no título da filha**: o nome é o que vem depois de `Feature:` no cabeçalho.

```bash
issues decompose --id <id> --into ./decompose.json --agent <ia>
```

```json
{
  "mode": "concurrent",
  "children": [
    {
      "title": "Design: Login com e-mail",
      "type": "Feat",
      "action": "Design",
      "problem": "Desenhar a autenticação por e-mail e senha.",
      "acceptance_criteria": "Plano de implementação aprovado para a Feature."
    },
    {
      "title": "Design: Recuperação de senha",
      "type": "Feat",
      "action": "Design",
      "problem": "Desenhar o fluxo de redefinição de senha por link.",
      "acceptance_criteria": "Plano de implementação aprovado para a Feature."
    }
  ]
}
```

`title`, `type`, `action` e `problem` são obrigatórios; `acceptance_criteria` é opcional.
`action` de toda filha tem que ser `Design`.
`mode`: `concurrent` (default, filhas independentes) ou `sequential` (encadeadas para execução em ordem).
`decompose` já grava a linhagem parent/child recíproca — não chame `relate` depois.

## Entrega 3 — o Artefato do alinhamento

```bash
issues artifact --id <id> --file ./artifact.md
```

O **nome do arquivo é irrelevante** (o conteúdo é gravado na Issue); use `./artifact.md` e não gaste tempo decidindo.
Máximo 300 palavras.
Esqueleto:

```markdown
# Alinhamento

- Problema: <o problema real, em uma linha>
- Escopo: <o que entra>
- Fora de escopo: <o que não entra>

## Decisões

- <decisão tomada com o humano>

## Dúvidas em aberto

- <o que ficou pendente, ou "Nenhuma">
```

## Encerramento

```bash
issues status --id <id> --agent <ia> --status CLOSED \
  --comment "<evidência: o que foi alinhado, decisões tomadas>" --reason concluido
```

Use `--status AWAITING` (sem `--reason`) se a Issue é HITL, `risk=ALTO` ou `complexity=ALTA`.
Sem requisitos válidos **e** uma filha Design por Feature, o comando falha apontando a Feature descoberta — entregue as duas antes.
Concluída a Issue, **encerre a sessão**: não busque outra Issue.

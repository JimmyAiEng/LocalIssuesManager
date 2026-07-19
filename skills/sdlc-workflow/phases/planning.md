# Action `Planning`

Alinhar problema, requisitos e domínio, e entregar requisitos Gherkin válidos.

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
    "Feature: Recuperação de senha\nComo um usuário cadastrado\nEu quero poder redefinir minha senha\nPara que eu volte a acessar a conta quando esquecer\n\nScenario: Link enviado\nGiven que eu informo um e-mail cadastrado\nWhen eu peço a redefinição\nThen eu recebo um e-mail com o link de redefinição",
    "Feature: Busca no catálogo\nComo um usuário logado\nEu quero poder buscar itens pelo nome\nPara que eu encontre o que preciso sem navegar página a página\n\nScenario: Termo com resultados\nGiven que existem itens cadastrados\nWhen eu busco por um termo presente no nome\nThen eu vejo os itens correspondentes"
  ]
}
```

Regras que o validador cobra em **cada** Feature, nesta ordem exata:
1. Primeira linha: `Feature: <nome>`.
2. Três linhas de user story: `Como um …`, `Eu quero poder …`, `Para que eu …` — nesta ordem, cada uma com conteúdo.
3. Depois, só `Scenario: <nome>` e steps começando com `Given`, `When`, `Then` ou `And`.
4. Todo Scenario precisa de pelo menos um step; nenhum texto solto antes do primeiro Scenario.

Linhas em branco são ignoradas; cada Feature tem no máximo 300 palavras.

## Entrega 2 — uma Issue Design por grupo de Features

```bash
issues decompose --id <id> --into ./decompose.json --agent <ia>
```

Cada filha declara em `features` os nomes das Features que ela cobre — o **grupo é a própria filha Design**.
Nas três Features da Entrega 1, login e recuperação de senha são o mesmo conceito (autenticação) e viram **um** grupo; a busca é outro conceito e vira **outro**:

```json
{
  "mode": "concurrent",
  "children": [
    {
      "title": "Design: Autenticação",
      "type": "Feat",
      "action": "Design",
      "problem": "Desenhar a autenticação: entrada por e-mail e senha e redefinição por link.",
      "acceptance_criteria": "Spec congelada cobrindo as Features do grupo.",
      "features": ["Login com e-mail", "Recuperação de senha"]
    },
    {
      "title": "Design: Busca",
      "type": "Feat",
      "action": "Design",
      "problem": "Desenhar a busca de itens do catálogo por nome.",
      "acceptance_criteria": "Spec congelada cobrindo as Features do grupo.",
      "features": ["Busca no catálogo"]
    }
  ]
}
```

Regras que o validador cobra:
1. `title`, `type`, `action` e `problem` são obrigatórios; `acceptance_criteria` é opcional.
2. `action` de toda filha tem que ser `Design`.
3. `features` é obrigatório: array não vazio com os nomes das Features do pai, **exatamente** como escritos depois de `Feature:` no `req.json` — não abrevie, não reescreva.
4. Nome que não existe nos requisitos é recusado, e o erro lista os nomes disponíveis.
5. A mesma Feature em duas filhas é recusada, inclusive entre chamadas: você pode chamar `decompose` outra vez para os grupos que faltam, mas nunca repetir Feature já coberta.
6. O gate de fechamento cobra a **partição**: toda Feature do pai coberta por exatamente uma filha Design, nenhuma solta, nenhuma repetida.

O `title` é **livre** — nomeie o conceito do grupo (`Design: Autenticação`), não a Feature.
O `decompose` grava o Gherkin do grupo como os requisitos da própria filha, e ela o recebe no prompt sob `## Features desta Issue`.
Filha Design criada por fora (`issues create`) não cobre Feature nenhuma: as Features dela continuam descobertas no gate.
`mode`: `concurrent` (default, filhas independentes) ou `sequential` (encadeadas para execução em ordem).
`decompose` já grava a linhagem parent/child recíproca — não chame `relate` depois.

**Como agrupar**:
- Junte as Features que compartilham o **mesmo conceito de domínio** ou que tocariam os **mesmos módulos/arquivos**.
- **Na dúvida, agrupe**: duas Issues Design desenhando o mesmo conceito produzem specs conflitantes, e esse é o erro caro.
Uma Design um pouco larga é barata, porque ela mesma se fatia em vários Implement depois.
- Cada Feature pertence a exatamente um grupo.

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
Sem requisitos válidos **e** toda Feature coberta por exatamente uma filha Design, o comando falha apontando a Feature descoberta ou repetida — entregue as duas antes.
Concluída a Issue, **encerre a sessão**: não busque outra Issue.

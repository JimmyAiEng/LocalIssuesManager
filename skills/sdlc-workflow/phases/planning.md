# Action `Planning`

Alinhar problema, requisitos e domínio, e entregar requisitos estruturados válidos.

Estude o problema da Issue, o repositório do projeto e me entreviste ativamente sobre cada aspecto até termos um entendimento comum do que deve ser feito.
Busque identificar os requisitos funcionais e não funcionais, e resolva as dúvidas por meio de grupos de 3 perguntas.
Para cada pergunta, sugira uma resposta, e espere o feedback do grupo antes de continuar.
Se um *fato* puder ser encontrado explorando o codebase ou o texto da Issue, explore-o em vez de perguntar.
As decisões de requisitos funcionais, contudo, são do humano.

**Heurísticas**:
- Escopo grande demais para uma sessão → crie Issues menores relacionadas e abandone esta (`--reason obsoleto`).
- Foque nos requisitos funcionais, descritos em termos do usuário/domínio, não da solução.
- **Como** planejar (pesquisa, glossário, ADRs, etc.) é decisão do agente.

## Entrega 1 — requisitos em JSONL

```bash
issues requirements set --id <id> --file ./req.jsonl
```

Um arquivo JSONL: **uma Feature completa por linha**, de 1 a 5 linhas.
Os prefixos da user story são escritos pelo sistema, não por você: a renderização monta `Como <como>`, `Eu quero poder <quero>` e `Para que eu possa <para>`.
Por isso os campos guardam a forma neutra — `como` traz o papel com artigo (`um usuário`, `uma administradora`), e `quero` e `para` trazem o verbo no infinitivo (`entrar`, `acessar minha conta`).
Não conjugue e não repita o prefixo.
Copie este formato:

```jsonl
{"feature": "Login com e-mail", "como": "um usuário cadastrado", "quero": "entrar com e-mail e senha", "para": "acessar minha conta", "scenarios": [{"nome": "Credenciais válidas", "steps": ["Given que eu tenho uma conta ativa", "When eu envio e-mail e senha corretos", "Then eu vejo a minha área logada"]}, {"nome": "Senha errada", "steps": ["Given que eu tenho uma conta ativa", "When eu envio a senha errada", "Then eu vejo a mensagem de credenciais inválidas", "And eu continuo na tela de login"]}]}
{"feature": "Recuperação de senha", "como": "um usuário cadastrado", "quero": "redefinir minha senha", "para": "voltar a acessar a conta quando esquecer", "scenarios": [{"nome": "Link enviado", "steps": ["Given que eu informo um e-mail cadastrado", "When eu peço a redefinição", "Then eu recebo um e-mail com o link de redefinição"]}]}
{"feature": "Busca no catálogo", "como": "um usuário logado", "quero": "buscar itens pelo nome", "para": "encontrar o que preciso sem navegar página a página", "scenarios": [{"nome": "Termo com resultados", "steps": ["Given que existem itens cadastrados", "When eu busco por um termo presente no nome", "Then eu vejo os itens correspondentes"]}]}
```

Regras que o validador cobra — o erro sempre cita o número da linha:
1. De 1 a 5 linhas, cada uma um JSON completo numa única linha: não quebre uma Feature em várias linhas.
2. `feature`, `como`, `quero` e `para` são obrigatórios e não podem ser vazios.
3. `scenarios` é um array não vazio, e cada cenário tem `nome` e `steps` não vazio.
4. Cada step é uma string que começa com `Given`, `When`, `Then` ou `And`, seguida do conteúdo.
5. O valor de `feature` é único entre as linhas: é a chave que liga a Feature à filha Design que a cobre.

Linhas em branco são ignoradas; cada Feature tem no máximo 300 palavras.

## Entrega 2 — o Artefato do alinhamento

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

## Entrega 3 — uma Issue Design por grupo de Features

**Quando decompor**: só no passo que **fecha** a Issue.

- Vai encerrar por `AWAITING` (HITL, `risk=ALTO`, `complexity=ALTA` ou Projeto `concern=HIGH`)?
  **Não decomponha agora**: ir para `AWAITING` com filha já criada é recusado.
  Entregue os requisitos e o artefato, envie para decisão humana e deixe registrado no `handoff.md` que a decomposição ficou pendente.
  Quando a Issue voltar `APPROVED`, decomponha e **só então** feche.
- Vai fechar direto por `CLOSED` (AFK)? Decomponha antes de fechar, na mesma sessão — o caminho AFK não muda.

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
3. `features` é obrigatório: array não vazio com os nomes das Features do pai, **exatamente** os valores do campo `feature` de cada linha do `req.jsonl` — não abrevie, não reescreva.
4. Nome que não existe nos requisitos é recusado, e o erro lista os nomes disponíveis.
5. A mesma Feature em duas filhas é recusada, inclusive entre chamadas: você pode chamar `decompose` outra vez para os grupos que faltam, mas nunca repetir Feature já coberta.
6. O gate cobra a **partição** na transição para `CLOSED`: toda Feature do pai coberta por exatamente uma filha Design, nenhuma solta, nenhuma repetida.
   A filha também precisa estar **viva** (`OPEN` ou `CLAIMED`) — filha `CLOSED`, `AWAITING` ou `APPROVED` não cobre a Feature dela.

O `title` é **livre** — nomeie o conceito do grupo (`Design: Autenticação`), não a Feature.
O `decompose` grava as Features do grupo como os requisitos da própria filha, e ela as recebe no prompt sob `## Features desta Issue`.
Filha Design criada por fora (`issues create`) não cobre Feature nenhuma: as Features dela continuam descobertas no gate.
`mode`: `concurrent` (default, filhas independentes) ou `sequential` (encadeadas para execução em ordem).
`decompose` já grava a linhagem parent/child recíproca — não chame `relate` depois.

**Como agrupar**:
- Junte as Features que compartilham o **mesmo conceito de domínio** ou que tocariam os **mesmos módulos/arquivos**.
- **Na dúvida, agrupe**: duas Issues Design desenhando o mesmo conceito produzem specs conflitantes, e esse é o erro caro.
Uma Design um pouco larga é barata, porque ela mesma se fatia em vários Implement depois.
- Cada Feature pertence a exatamente um grupo.

## Encerramento

```bash
issues status --id <id> --agent <ia> --status CLOSED \
  --comment "<evidência: o que foi alinhado, decisões tomadas>" --reason concluido
```

Use `--status AWAITING` (sem `--reason`) se a Issue é HITL, `risk=ALTO` ou `complexity=ALTA`.
**Toda saída por `AWAITING` exige o `handoff.md` gravado antes** — `issues artifact --id <id> --name handoff.md --file ./handoff.md` —, senão o `status` falha (veja "Handoff" na camada 0).
Escreva nele que a decomposição em Issues Design ficou pendente, com o agrupamento que você já tem em mente: é o próximo passo concreto da sessão pós-`APPROVED`.
Em Projeto `concern=HIGH`, Planning **não fecha por agente**: encerre sempre por `--status AWAITING` (sem `--reason concluido`) — o aceite é humano, no web — mesmo em Issue AFK.
O gate se divide pelas duas saídas:

- **`AWAITING`** cobra os **requisitos válidos** e recusa a Issue se ela já tiver qualquer filha — a decomposição é passo pós-aprovação.
- **`CLOSED`** cobra os requisitos **e** a partição viva: toda Feature coberta por exatamente uma filha Design em `OPEN` ou `CLAIMED`.
  O erro aponta a Feature descoberta, repetida ou coberta por filha que já saiu de circulação.

Concluída a Issue, **encerre a sessão**: não busque outra Issue.

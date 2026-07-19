# ADR 0009 — Requisitos estruturados em JSONL

- Status: aceito
- Data: 2026-07-19
- Troca o formato de entrega do `RequirementArtifact`, que nunca foi fixado em ADR e vivia só no validador.
- Refina a ADR 0008, que assume Features Gherkin no seu contexto, sem alterar os gates nem o modelo Issue-only.

## Contexto

O artefato de requisitos era `{"features": [...]}`, com cada Feature uma string de Gherkin pt-BR, e o validador cobrava a **forma do texto**: ordem posicional das linhas e os prefixos literais `Como um`, `Eu quero poder` e `Para que eu`.

Validar texto é frágil porque a regra não é o requisito.
Um modelo escreveu "Eu quero registrar quando um item foi consumido" — uma Feature perfeitamente válida — e o comando abortou por faltar a palavra *poder*.
`docs/research/jornada-modelo-pequeno.md` registra o loop resultante: cinco tentativas no mesmo ponto, sem que o modelo convertesse a regra em edição.
A resposta anterior foi mitigar o sintoma, com um `mechanicalFix` que montava a linha corrigida dentro da mensagem de erro — o que preserva a regra frágil e ainda paga o custo de explicá-la.

Havia também dois parsers do mesmo formato: o do domínio e um segundo no cliente web, que reparseava o texto Gherkin para renderizar Feature, Scenario e steps.
Dois parsers da mesma gramática derivam.

## Decisão

- O artefato de requisitos passa a ser **JSONL**: uma Feature estruturada por linha, de 1 a 5 linhas, entregue por `issues requirements set --file <req.jsonl>`.
- Os prefixos da user story viram os campos `como`, `quero` e `para`, e o sistema os escreve na renderização (`toGherkin`) — é o único lugar do código que conhece esses textos.
- O validador cobra apenas fatos estruturais: campos obrigatórios não vazios, `scenarios` não vazio com `nome` e `steps`, cada step começando por `Given`/`When`/`Then`/`And`, nome de Feature único e o limite de 300 palavras por Feature.
- Toda mensagem de erro cita o **número da linha** do arquivo.
- Não há migração dos artefatos `.json` já gravados.

## Alternativas rejeitadas

- Afrouxar o validador de texto (aceitar `Eu quero` sem `poder`, tolerar ordem livre das linhas): cada afrouxamento é uma regra a mais na gramática, e a próxima variação legítima quebra do mesmo jeito.
- Manter o texto e investir em mensagens de erro melhores: foi o que o `mechanicalFix` fez, e ele trata o sintoma de uma regra que não precisava existir.
- Um JSON único com um array de Features: perde a linha como unidade de erro e volta a permitir que uma Feature quebre em várias linhas do arquivo.

## Consequências

A classe de erro "prefixo errado" deixa de existir **por construção**, não por mitigação: não há prefixo no dado de entrada para o autor errar.
O `mechanicalFix` foi deletado, junto com a validação posicional de linhas.
Os dois parsers viraram um: a API entrega o `RequirementSet` estruturado e o cliente web só renderiza, sem reparsear texto.
O erro passa a apontar a linha exata do arquivo, o que torna a correção mecânica sem que a mensagem precise ensinar a gramática.
Artefatos de requisitos no formato `.json` antigo deixam de validar.
A decisão é **não migrar**: esta é uma ferramenta local de dogfood, e a Issue Planning afetada refaz o `requirements set` no formato novo — escrever migração para uma base de dados pessoal custa mais que reexecutar o comando.

A ADR 0008 **continua válida**: a chave de junção entre a Feature e a filha Design que a cobre segue sendo o nome da Feature, e o gate de Planning segue cobrando partição estrita.
O que muda é de onde o nome vem — o campo `feature` da linha, em vez do texto capturado depois de `Feature:` por regex.

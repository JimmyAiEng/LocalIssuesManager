# ADR 0008 — Grupo de Features por Issue Design

- Status: aceito
- Data: 2026-07-18
- Refina a decomposição Planning→Design das ADRs 0006 e 0007, sem alterar o modelo Issue-only.

## Contexto

A Issue Planning entrega de 1 a 5 Features Gherkin e decompõe em Issues Design.
A regra anterior era 1:1 — uma filha `action=Design` por Feature — e o casamento entre Feature e filha era feito por substring do nome da Feature no título da filha.

Isso tinha três problemas.
Requisito é linguagem do usuário e design é linguagem da solução: várias Features caem no mesmo conceito de domínio e precisam ser desenhadas juntas, então a relação natural é N:1 e o 1:1 forçava o oposto.
A partição não era garantida: duas filhas podiam cobrir a mesma Feature sem que nada barrasse, e duas sessões desenhando o mesmo conceito produzem specs conflitantes.
E o casamento por substring era frágil — exigia que um modelo pequeno reproduzisse o nome da Feature dentro do título, um modo de falha silencioso.

## Decisão

- O **grupo é a própria filha Design**: não existe entidade "cluster" no sistema.
- No `decompose --into`, a filha Design declara `features`: os nomes das Features do pai que ela cobre, por igualdade exata com o texto após `Feature:` no cabeçalho.
- O `decompose` grava o Gherkin dessas Features como o `RequirementArtifact` **da própria filha**, que passa a possuir seus requisitos e os recebe no prompt sob `## Features desta Issue`.
- O gate de conclusão de Planning cobra **partição estrita**: toda Feature do pai coberta por exatamente uma filha Design, nenhuma solta, nenhuma repetida.

## Alternativas rejeitadas

- Cluster nomeado dentro do artefato de requisitos do pai: indireção extra sem carregar nenhuma informação que o título da filha Design já não carregue.
- Permitir sobreposição intencional entre grupos: é exatamente a duplicação de conceito que se quer evitar, e o custo dela é spec conflitante.

## Consequências

O título da filha volta a ser texto livre e passa a nomear o conceito desenhado, não a Feature.
O casamento por título deixa de existir e `featureForDesignChild` foi apagado.
O `decompose` fica incremental: pode ser chamado mais de uma vez, recusando Feature já coberta.
Filha Design criada fora do `decompose` (via `issues create`) não cobre nada, e as Features correspondentes aparecem como descobertas no gate.

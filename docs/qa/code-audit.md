# Auditoria de Código — Orquestração do AI Development Workflow

Revisor: Quality Review Agent.
Data: 2026-07-17.
Escopo: código novo/alterado da branch `feat/anexo-imagem-criacao-devolucao` contra `master` (merge-base `fc02642`), com foco em `src/domain`, `src/app`, `src/cli*.ts`, `src/web`.
Método: leitura direta dos módulos (não só nomes), comparação lado a lado dos três artefatos estruturados, `git diff` e greps de fronteira de camada.

## Resumo executivo

Veredito: a base está saudável — camadas de domínio puras, funções curtas e um teste de arquitetura ativo; os riscos reais são uma brecha de camada que escapa do próprio guard de arquitetura e a duplicação previsível entre os três artefatos estruturados (parser JSON + validadores de campo).
Nada aqui é bloqueador; são dívidas de consolidação, mais uma correção pontual de fitness.

Contagem por severidade:

- Alta: 1
- Média: 4
- Baixa: 7
- Pontos sólidos confirmados: 2

Qualidade estática: `npm run lint` (biome) limpo, 70 arquivos, zero fixes; `npm run typecheck` (tsc --noEmit) limpo, zero erros.

Os três achados mais graves:

1. (Alta) `src/cli_design.ts:2` importa `DesignGateError` de `domain/`, furando a proibição CLI→domain que `src/cli.ts` respeita; o teste de fitness que deveria barrar isso está preso ao nome exato `src/cli.ts` (`test/architecture/fitness.test.ts:61`) e não cobre o novo arquivo.
2. (Média) Validadores de campo `requireText` / `requireTextList` / `requireList` são copiados verbatim entre `src/domain/implementation_plan.ts:45-60` e `src/domain/prd.ts:84-98`.
3. (Média) O invólucro `parseAndValidateX` (parse de JSON + guard de objeto) está repetido em quatro lugares: `requirements.ts:59`, `implementation_plan.ts:22`, `prd.ts:25` e, inline, `decomposition_use_cases.ts:83`.

---

## Nomenclatura

### N1 — `requireList` vs `requireTextList` para a mesma lógica (Média)

`src/domain/implementation_plan.ts:52` e `src/domain/prd.ts:90`.
As duas funções validam "array não vazio de strings não vazias" com corpo idêntico, mas uma se chama `requireList` e a outra `requireTextList`.
O mesmo conceito recebe dois nomes em módulos irmãos, o que confunde na leitura e denuncia o copy-paste.
Correção: escolher um nome único (`requireTextList` é o mais descritivo) ao consolidar os validadores (ver D2).

### N2 — Função de validação primária nomeada de forma inconsistente (Baixa)

`validateGherkinRequirements` (`requirements.ts:18`) vs `validatePlan` (`implementation_plan.ts:15`) vs `validatePrd` (`prd.ts:17`).
Uma é qualificada pelo formato de conteúdo ("Gherkin"), as outras pelo tipo do artefato.
Para três artefatos que são o mesmo padrão, o esperado seria `validateRequirements` / `validatePlan` / `validatePrd`.
Correção: renomear para `validateRequirements` (o "Gherkin" já está claro no tipo e no módulo).

### N3 — Idioma das chaves do artefato mistura inglês e pt-BR (Baixa)

`Requirements` usa chave em inglês `features` (`requirements.ts:8`), enquanto `ImplementationPlan` (`objetivo`, `passos`, `arquivos`, `criterio_pronto`) e `Prd` (`visao`, `requisitos_funcionais`, `clusters`) usam pt-BR.
É o contrato JSON que o agente preenche; a mistura vaza para prompts e skills e é fácil de errar.
Correção: padronizar o idioma das chaves entre os três artefatos (o resto do domínio já é pt-BR nas mensagens).

### N4 — `requireValidRequirements` vs `requireRequirements` no mesmo arquivo (Baixa)

`src/app/requirements_use_cases.ts:90` e `:121`.
Nomes quase iguais e corpos quase iguais (lê requirements, erra se null, `parseAndValidateRequirements`); divergem só na mensagem e — pior — no tipo de erro (`NotFoundError` em uma, `DomainError` na outra) para a mesma condição "requisitos ausentes".
Correção: unificar em uma função com a mensagem/erro parametrizados, ou ao menos alinhar o tipo de erro para "ausência de requisitos".

---

## Arquitetura em camadas

### C1 — CLI fura a proibição de importar domínio, e o fitness não cobre o novo arquivo (Alta)

`src/cli_design.ts:2` faz `import { DesignGateError } from "./domain/design_gate.js"`.
A regra de arquitetura do projeto é "a CLI não importa de `domain/`" — tão intencional que `cli_design.ts:66` exporta `reportCliError` justamente "para o cli.ts usar sem importar de domain/ (restrição de arquitetura)".
Só que `cli_design.ts` viola a própria regra que `cli.ts` obedece.
E o teste que deveria pegar isso está preso ao nome exato do arquivo: `test/architecture/fitness.test.ts:61` faz `if (file === "src/cli.ts") assert.doesNotMatch(content, /from ["']\.\/domain\//)`.
Ou seja: o guard existe, mas cobre um único arquivo por igualdade de string; qualquer `src/cli_*.ts` novo passa livre — e o primeiro que surgiu já vazou.
Correção: trocar a condição para casar todos os `src/cli*.ts` (ex.: `file.startsWith("src/cli")`), e então rotear o contrato de erro do Design pela camada app (expor de `design_use_cases` o que a CLI precisa) ou aceitar `DesignGateError` como contrato compartilhado e documentar a exceção — mas a decisão precisa ser explícita, não um vazamento silencioso.

Remediado (2026-07-17): `design_use_cases.ts` passou a reexportar `DesignGateError` e `cli_design.ts` importa dele (CLI→app→domain, sem furar a camada); o guard de fitness virou `/^src\/cli[\w]*\.ts$/`, cobrindo todos os `src/cli*.ts`.
Suíte cheia verde (415 testes) após a correção.

### C2 — Pureza do domínio e sentido das dependências: sólido (Bom)

Confirmado por leitura e grep: os módulos de domínio novos (`requirements.ts`, `implementation_plan.ts`, `prd.ts`, `design_gate.ts`) importam apenas `domain_error`, `value_objects` e uns aos outros (`prd` → `requirements`); nenhum alcança `app`/`cli`/`web`.
Nenhum arquivo de `app/` importa de `web/`.
`web/` importa de `domain/` diretamente (`api.ts:10-12`, `server.ts:6`: `Queue`, `DESIGN_KINDS`, `DesignGateError`), mas isso é o padrão já estabelecido do projeto (a web fala com o repositório do domínio) e o fitness só proíbe o sentido domain→(app|cli); não é regressão.

---

## Duplicidade

### D1 — Invólucro `parseAndValidateX` (parse JSON + guard de objeto) repetido 4x (Média)

`requirements.ts:59-67`, `implementation_plan.ts:22-30`, `prd.ts:25-33` e, inline, `decomposition_use_cases.ts:81-90`.
Todos fazem o mesmo: `try { JSON.parse } catch { throw new DomainError("X deve ser ... JSON válido") }`, seguido do guard `typeof raw !== "object" || raw === null || Array.isArray(raw)` (esse guard também aparece em `requirements.ts:32`).
São ~4 cópias do mesmo esqueleto de parsing/validação de forma.
Correção: um helper puro no domínio, ex. `parseJsonObject(text: string, label: string): Record<string, unknown>`, reusado pelos três artefatos e pela decomposição; cada um só adiciona suas regras de campo.

### D2 — Validadores de campo copiados verbatim entre `implementation_plan` e `prd` (Média)

`implementation_plan.ts:45-60` (`requireText`, `requireList`) e `prd.ts:84-98` (`requireText`, `requireTextList`).
`requireText` é idêntico exceto pelo prefixo `Plano.`/`PRD.`; `requireList`/`requireTextList` são a mesma lógica com nomes diferentes (ver N1).
`decomposition_use_cases.ts:92-98` (`assertChildShape`) reimplementa mais uma vez o check "string não vazia".
Correção: extrair um módulo de validação de campos de artefato (ex. `artifact_fields.ts`) com `requireText(value, path, errors)` e `requireTextList(value, path, errors)` recebendo o path completo como prefixo; os três consumidores passam a chamá-lo.

### D3 — Estratégia de erro divergente entre os três artefatos irmãos (Baixa)

`implementation_plan.ts:15-19` e `prd.ts:17-22` acumulam TODAS as violações (`collectErrors` → join `; `), mas `requirements.ts:18-28` lança na PRIMEIRA violação (o `features.forEach` estoura no primeiro erro).
São o mesmo tipo de artefato validado por código; a expectativa (inclusive do solicitante) era "erros acumulados" nos três, e requirements foge do padrão — o autor de um requirements ruim conserta um erro por vez.
Correção: alinhar `requirements` ao padrão acumulador (coletar erros por Feature e lançar um `DomainError` único ao final).

### D4 — Leitura tolerante (try/parse/catch→null) repetida (Baixa)

`plan_use_cases.ts:47-55` (`readPlanForView`) e `requirements_use_cases.ts:112-118` (`clusterForDesignChild`) repetem o padrão "parseia; se falhar, devolve null (o gate é quem cobra)".
Correção: um helper `tryParse<T>(fn: () => T): T | null` reusado; baixo impacto, só remove ruído.

### D5 — Tripletos de escrita/leitura flat no repositório quase idênticos (Baixa)

`queue_repository.ts`: `writeArtifact`/`readArtifact` (89-98), `writeRequirements`/`readRequirements` (126-135), `writePrd`/`readPrd` (142-151) têm a mesma forma (mkdir do subdir + writeFileSync; existsSync + readFileSync), parametrizada só por subpasta e extensão.
Correção: privados `#writeFlat(project, subdir, name, content)` e `#readFlat(project, subdir, name)` colapsam os três pares; é a camada de persistência (exceção legítima à regra de domínio), então é seguro.

### D6 — Mensagem de guard de action repetida (Baixa)

`Issue ${id} não é de X (action=...)` aparece em `requirements_use_cases.ts:17` e `:40`, `plan_use_cases.ts:14` e `design_use_cases.ts:110`.
Correção: um helper `requireAction(issue, action, label)` no app centraliza a mensagem e o check.

---

## Bad smells

### S1 — `PLAN_FILE` com dois donos e escrita do plano fora do seu use case (Média)

`plan_use_cases.ts:7` e `decomposition_use_cases.ts:20` declaram, cada um, `const PLAN_FILE = "plan.json"` — o comentário no segundo até reconhece o acoplamento ("mesma storage-key do plano de Design").
Pior que a constante dobrada: `decomposition_use_cases.ts:35` grava o plano da filha (`queue.writeDesign(..., PLAN_FILE, ...)`) por fora de `plan_use_cases`, então a chave de storage do plano tem duas fontes de verdade e dois caminhos de escrita.
Se o local/nome do plano mudar, é fácil atualizar um e esquecer o outro.
Correção: exportar `PLAN_FILE` (ou melhor, uma função `writePlan(queue, project, issueId, plan)`) de `plan_use_cases.ts` e a decomposição reusá-la.

### S2 — Tamanho de função e de arquivo: sólido (Bom)

O fitness (`fitness.test.ts:69-80`) impõe funções ≤20 linhas e arquivos ≤300 (JS do client incluído), e todo o código novo respeita.
Não há função-quilômetro nem god-file entre os módulos auditados; as funções são pequenas e de responsabilidade única, o tratamento de erro é consistente via `DomainError`/`NotFoundError`/`DesignGateError`, e não encontrei código morto nos módulos novos.
Essa dimensão está saudável e não precisa de ação.

---

## Apêndice — o que está sólido

- Pureza do domínio: os artefatos e gates novos não têm I/O e não importam camadas acima; `queue_repository.ts` é a única exceção de I/O no domínio, e é intencional e testada (ver `fitness.test.ts:62`).
- Sentido das dependências app→domain e web→domain consistente com o já existente; app não vaza para web.
- Gate de Design (`design_gate.ts`) é uma máquina de regras pura, bem comentada, com acúmulo de erros e heurística `kind↔diagramType` documentada e verificada empiricamente.
- Enforcement de TDD (`implement_gate.ts`) separa corretamente a função pura testável (`tddViolation`) da coleta via git (`worktreeCommits`), e é opt-in — bom desenho.
- Trava de decomposição (fan-out) e linhagem tipada (`relates {id,kind}` com recíproco e dedup em `normalizeRelations`) são coerentes entre `decomposition_use_cases`, `requirements_use_cases` e `design_use_cases`.
- Tags/autonomia: `assertNoDowngrade` com ordem de severidade explícita (`value_objects.ts:57-78`) e comentário justificando por que não deriva de `TAG_VALUES` — exatamente o tipo de guard que evita bug sutil.
- Lint e typecheck limpos; funções ≤20 linhas e arquivos ≤300 em toda a mudança.

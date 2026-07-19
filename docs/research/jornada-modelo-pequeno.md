# Pesquisa — jornada total com modelo pequeno (Qwen 30b) sem descoberta de formatos

Data: 2026-07-18.
Fonte: transcript da sessão do Qwen 30b (harness `pi`) trabalhando a Issue de Planning do projeto HomeInventory, mais o `Feedback.txt` da raiz.
Protótipo: branch `worktree-prototipo-jornada-modelo-pequeno`.

## O que o transcript mostrou

O Qwen 30b gastou a sessão inteira redescobrindo formatos por tentativa e erro e terminou sem fechar a Issue.
As falhas se agrupam em cinco classes.

### F1 — A disclosure progressiva de dois saltos quebra

O prompt do claim manda ler a skill `sdlc-workflow`, e ela manda ler `../planning-phase/SKILL.md`, onde os formatos estão documentados.
O Qwen tinha a camada 0 carregada pelo loop, mas nunca deu o segundo salto.
Resultado: inventou um formato próprio para `requirements set` (array de objetos com `acceptanceCriteria`) e só acertou a forma externa depois do erro com exemplo.

### F2 — Erro sem o antes/depois prende em loop

A primeira versão do Qwen tinha "Eu quero poder criar…" (válido).
Ao dividir as Features para caber no limite, ele reescreveu como "Eu quero criar…" e recebeu cinco vezes o erro `user story deve conter "Eu quero poder ..."`.
A mensagem dizia o prefixo esperado, mas não mostrava a linha encontrada nem a correção; o modelo pequeno não converteu regra em edição.

### F3 — A remediação sugerida bate no próprio gate

O erro de 6 Features (limite 5) mandava "feche esta Issue e crie Issues menores relacionadas".
"Fechar" com `--reason concluido` cobra o gate de requisitos — que era exatamente o que ele não conseguia gravar.
O caminho certo (abandono com `--reason obsoleto`, que pula o gate) só existia na skill não lida.
Resultado: a Issue original ficou CLAIMED e órfã, e as duas substitutas nasceram como `see-also` de Planning em vez de filhas.

### F4 — Flags e limites descobertos por tentativa

`--agent is required` no `create`, limite de 5 Features, e a inconsistência `--id` vs `--issue` (subcomandos `design` usam `--issue`) custaram um roundtrip cada.

### F5 — Comando de outra action

Tentou `issues design doc` numa Issue Planning.
O erro é bom, mas revela que o modelo não sabia quais comandos pertencem à action reivindicada.

## Causa raiz

O conhecimento da jornada mora nas skills, e modelo pequeno não lê skills com confiabilidade.
Os únicos canais garantidos em qualquer harness são o prompt do claim e as mensagens de erro.
Hoje o prompt é deliberadamente mínimo (decisão registrada em `prompt_composition.ts` e no teste "prompt é mínimo") e os erros dizem a regra, mas nem sempre o remédio.

## O protótipo

Três mudanças, todas nos canais garantidos.

### 1. Contrato mecânico da action no prompt do claim

Novo módulo `action_contracts.ts`, chamado por `composePrompt` como última seção do prompt.
Para cada action, o contrato lista a sequência de comandos com `id`, `agent` e `project` reais já substituídos, o conteúdo copy-paste de cada arquivo (`req.json`, `decompose.json`, `plan.json`, `artifact.md`) e o encerramento com a variante AWAITING.
Toda action (exceto Deploy) termina com a rota de fuga: criar substitutas com `--relates` e abandonar com `--reason obsoleto`, que não cobra o gate.
O "como" trabalhar continua nas skills; o contrato carrega só o "o quê" gravar e em que forma.
Isso ataca F1, F4 e F5 na origem: zero saltos de leitura.

### 2. Erro de user story com o antes/depois

O validador Gherkin agora mostra a linha encontrada e a correção mecânica pronta:
`encontrado "Eu quero criar, visualizar e excluir tipos de itens" — corrija para "Eu quero poder criar, visualizar e excluir tipos de itens"`.
A correção desconta as palavras do prefixo que já estão na linha e prepõe o prefixo completo.
Isso transforma F2 numa edição de string, que modelo pequeno faz bem.

### 3. Erros de limite e de gate apontam a rota de abandono

O erro de >5 Features e o erro "não pode ser concluída sem requisitos" agora dizem explicitamente que o abandono com `--reason obsoleto` não cobra o gate.
Isso fecha o beco sem saída de F3.

## Evidência (E2E no protótipo)

Replay dos três cenários que prenderam o Qwen: cada erro agora carrega o remédio completo (correção pronta, rota de abandono).
Jornada feliz completa executada copiando os comandos dos contratos, sem ler skill nenhuma: Planning (requirements → decompose → artifact → close) → Design (changed → plan → decompose → artifact → close) → prompt da Implement com Small Plan e contrato.
`npm run check` verde: typecheck, lint, coverage 98,7% linhas / 96,5% branches e fitness.

## Fora do escopo (decisões pendentes para o humano)

- Aceitar `--id` como alias de `--issue` nos subcomandos `design` (F4): mudança pequena, mas é feature nova de CLI.
- Feedback.txt item 2: limitar o trabalho a ~40% do contexto no `pi` — pertence ao loop, não ao CLI.
- Feedback.txt item 4: já respeitado aqui (o contrato não convida a buscar próxima Issue), mas as skills ainda mencionam "encerre a sessão".
- Deduplicar o texto dos contratos com as skills (hoje o formato vive nos dois lugares; gerar a seção de formato das skills a partir de `action_contracts.ts` eliminaria a deriva).

import type { ActionType } from "../../../domain/value_objects.js";

// Contrato mecânico da action, embutido no prompt do claim (issues next --prompt): a sequência de
// comandos com id/agent/project reais e o formato copy-paste de cada arquivo. Modelo pequeno não
// segue com confiabilidade a disclosure progressiva das skills (2 saltos de leitura) e fica preso
// redescobrindo formatos por tentativa e erro — o prompt é o único canal garantido em qualquer
// harness. O "como" trabalhar continua nas skills; aqui vive só o "o quê" gravar e em que forma.
const CONTRACTS: Record<ActionType, string> = {
  Planning: `Grave as entregas nesta ordem (comandos prontos para esta Issue):

1. Requisitos — 1 a 5 Features, uma por linha (JSONL):
   issues requirements set --id {{id}} --file req.jsonl
   Cada linha de req.jsonl é uma Feature completa. O sistema escreve os prefixos ("Como <como>", "Eu quero poder <quero>", "Para que eu possa <para>"), então grave só a forma neutra: "como" = papel com artigo, "quero" e "para" = verbo no infinitivo. Não conjugue, não repita o prefixo.
   {"feature": "Login", "como": "um usuário", "quero": "entrar", "para": "acessar o painel", "scenarios": [{"nome": "ok", "steps": ["Given a tela de login", "When envio credenciais válidas", "Then vejo o painel"]}]}
2. Decomposição — uma filha Design por grupo de Features; toda Feature em exatamente uma filha:
   issues decompose --id {{id}} --into decompose.json --agent {{agent}}
   Conteúdo exato de decompose.json ("features" repete os valores exatos do campo "feature" de cada linha do req.jsonl):
   {"children": [{"title": "Design: <conceito>", "type": "Feat", "action": "Design", "problem": "<o que desenhar>", "features": ["Login"]}]}
3. Artefato do alinhamento — markdown livre, máx. 300 palavras:
   issues artifact --id {{id}} --file artifact.md
4. Encerramento com evidência:
   issues status --id {{id}} --agent {{agent}} --status CLOSED --comment "<o que foi alinhado e decidido>" --reason concluido
   (HITL, risk=ALTO ou complexity=ALTA: use --status AWAITING, sem --reason.)`,

  Design: `Grave as entregas nesta ordem (comandos prontos para esta Issue):

1. Decisão de arquitetura — obrigatória, escolhe o caminho:
   issues design changed --issue {{id}} --value false
   (false: sem diagramas e a IA pode fechar; true: exige design.md + os 4 diagramas PlantUML e o aceite é humano.)
2. Plano de implementação:
   issues plan set --id {{id}} --file plan.json
   Conteúdo exato de plan.json:
   {"objetivo": "<resultado>", "passos": ["<passo 1>", "<passo 2>"], "arquivos": ["<src/arquivo.ts>"], "criterio_pronto": "<verificação objetiva>"}
3. Decomposição — ao menos uma filha Implement, cada uma com o seu Small Plan:
   issues decompose --id {{id}} --into decompose.json --agent {{agent}}
   Conteúdo exato de decompose.json:
   {"children": [{"title": "Implement: <fatia>", "type": "Feat", "action": "Implement", "problem": "<o que implementar>", "plan": {"objetivo": "<resultado>", "passos": ["<passo>"], "arquivos": ["<arquivo>"], "criterio_pronto": "<verificação>"}}]}
4. Artefato da spec — markdown, máx. 300 palavras; é ele que viaja no prompt das filhas:
   issues artifact --id {{id}} --file artifact.md
5. Encerramento com evidência:
   issues status --id {{id}} --agent {{agent}} --status CLOSED --comment "<decisão, desenho, fatias criadas>" --reason concluido
   (Com --value true: grave antes design.md com 'issues design doc --issue {{id}} --file design.md' e os diagramas com 'issues design add --issue {{id}} --kind component|package|class|activity --file <f.puml>', e encerre com --status AWAITING. HITL, risk=ALTO ou complexity=ALTA: também AWAITING.)`,

  Implement: `Fluxo desta Issue (comandos prontos):

1. Worktree antes de qualquer código (sem ela a Issue não fecha):
   issues worktree add --id {{id}}
2. TDD dentro da worktree: primeiro um commit só com os testes falhando, depois os commits de produção até os testes passarem.
3. Encerramento com evidência (o check do projeto roda sozinho na worktree; se falhar, corrija e repita):
   issues status --id {{id}} --agent {{agent}} --status CLOSED --comment "<o que foi implementado e como validou>" --reason concluido
   (HITL, risk=ALTO ou complexity=ALTA: use --status AWAITING, sem --reason.)`,

  QA: `Fluxo desta Issue (comandos prontos):

1. Rode o produto e confronte cada requisito/critério com o comportamento observado (rodar > ler).
2. Problema grave vira nova Issue relacionada:
   issues create --title "<t>" --project {{project}} --type Fix --action Implement --problem "<o quê>" --relates {{id}} --agent {{agent}}
3. Artefato do veredito — obrigatório, markdown, máx. 300 palavras, começando com APROVADO | APROVADO com ressalva | REPROVADO:
   issues artifact --id {{id}} --file artifact.md
4. Encerramento com evidência:
   issues status --id {{id}} --agent {{agent}} --status CLOSED --comment "<veredito + achados>" --reason concluido
   (HITL, risk=ALTO ou complexity=ALTA: use --status AWAITING, sem --reason.)`,

  Deploy: `Fluxo desta Issue (comandos prontos):

1. Prepare o PR com o conjunto integrado; não faça merge.
2. Colete a análise do PR (ex.: SonarQube) e trate ou registre cada apontamento.
3. Deploy nunca fecha pela IA — entregue para decisão humana com o link do PR e o resultado da análise:
   issues status --id {{id}} --agent {{agent}} --status AWAITING --comment "PR: <link https do PR> — análise: <resultado>"
   (Issue errada ou obsoleta: o mesmo comando com --reason errado e o porquê no --comment.)`,
};

// Rota de fuga comum: sem ela o agente fica preso num gate de Issue que ele mesmo criou errada
// (observado: Issue Planning abandonada CLAIMED porque "fechar" cobrava requisitos). Deploy não
// entra: agente nunca fecha Deploy, e o contrato dele já orienta o AWAITING com --reason errado.
const ABANDONO = `Issue errada, duplicada ou grande demais? Crie as Issues substitutas com --relates {{id}} e abandone esta sem cobrar o gate:
   issues status --id {{id}} --agent {{agent}} --status CLOSED --reason obsoleto --comment "<por quê / substituída por qual Issue>"
   (HITL, risk=ALTO ou complexity=ALTA: use --status AWAITING --reason obsoleto.)`;

export function actionContract(issue: { id: string; action: ActionType; project: string; owner: string | null }): string {
  const body = issue.action === "Deploy" ? CONTRACTS.Deploy : `${CONTRACTS[issue.action]}\n\n${ABANDONO}`;
  return `## Entrega desta Issue (action ${issue.action})\n\n${fill(body, issue)}`;
}

function fill(text: string, issue: { id: string; project: string; owner: string | null }): string {
  return text.replaceAll("{{id}}", issue.id)
    .replaceAll("{{agent}}", issue.owner ?? "<ia>")
    .replaceAll("{{project}}", issue.project);
}

import type { ConcernLevel } from "../../../domain/queue_repository.js";
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
{{close}}`,

  Design: `Não escreva código de produção nesta Issue: implementar é trabalho das filhas Implement. Código escrito aqui fica fora da fatia que será implementada, validada e revisada — é esforço perdido.

Grave as entregas nesta ordem (comandos prontos para esta Issue):

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
{{close}}`,

  Implement: `Fluxo desta Issue (comandos prontos):

1. Trabalhe isolado numa worktree do repo (recomendado, não obrigatório; o CLI não a cria nem cobra): git worktree add ../<fatia> -b issue/{{id}}. A orientação completa está em phases/implement.md.
2. Implemente a fatia e valide-a com as ferramentas do próprio repositório (lint, testes, build); o CLI não roda check algum.
3. Encerramento com evidência — é ela que conclui, descrevendo o que rodou e o resultado:
   issues status --id {{id}} --agent {{agent}} --status CLOSED --comment "<o que foi implementado e como validou>" --reason concluido
   (HITL, risk=ALTO ou complexity=ALTA: use --status AWAITING, sem --reason.)`,

  Review: `Valide o CONJUNTO entregue pelas Issues relacionadas (não é o review interno de Implement). Siga a sequência e só avance quando a etapa anterior não achou problema.

Fluxo desta Issue (comandos prontos):

1. Understand Intent — leia as threads e artefatos das Issues Planning e Design da linhagem (onde a mudança foi pedida e desenhada) e grave a intenção compreendida:
   issues artifact --id {{id}} --name intent.md --file intent.md
2. Rebase com a base do projeto (prd/hml/dev) e faça o Conflict Check; grave a evidência do que verificou:
   issues artifact --id {{id}} --name evidence-conflito.md --file evidence-conflito.md
3. Só se o Conflict Check não achou problema: Adversarial Check — estresse a solução contra cada requisito/critério (rodar > ler) e grave a evidência:
   issues artifact --id {{id}} --name evidence-adversarial.md --file evidence-adversarial.md
4. Só se o Adversarial Check não achou problema: rode o CI Pipeline (o check do projeto) sobre o conjunto integrado.
5. Veredito — obrigatório, markdown, máx. 300 palavras, começando com APROVADO | APROVADO com ressalva | REPROVADO:
   issues artifact --id {{id}} --file artifact.md
   REPROVADO só conclui com retrabalho VIVO: crie e vincule a esta Review ao menos uma Issue Implement ou Design fora de CLOSED:
   issues create --title "<t>" --project {{project}} --type Fix --action Implement --problem "<o quê>" --relates {{id}} --agent {{agent}}
6. Encerramento com evidência:
   issues status --id {{id}} --agent {{agent}} --status CLOSED --comment "<veredito + achados>" --reason concluido
   (HITL, risk=ALTO ou complexity=ALTA: use --status AWAITING, sem --reason.)`,

  Deploy: `Fluxo desta Issue (comandos prontos):

1. Prepare o PR com o conjunto integrado; não faça merge.
2. Colete a análise do PR (ex.: SonarQube) e trate ou registre cada apontamento.
3. Deploy nunca fecha pela IA — entregue para decisão humana com o link do PR e o resultado da análise:
   issues status --id {{id}} --agent {{agent}} --status AWAITING --comment "PR: <link https do PR> — análise: <resultado>"
   (Issue errada ou obsoleta: o mesmo comando com --reason errado e o porquê no --comment.)`,
};

// Passo de encerramento de Planning/Design, ramificado pelo concern do Projeto (piso de supervisão).
// LOW mantém o fecho por agente de hoje; HIGH força AWAITING (Planning/Design não fecham por agente,
// a decisão é humana) — assim o contrato do prompt já avisa antes de o agente bater no gate.
const CLOSE: Partial<Record<ActionType, Record<ConcernLevel, string>>> = {
  Planning: {
    LOW: `   issues status --id {{id}} --agent {{agent}} --status CLOSED --comment "<o que foi alinhado e decidido>" --reason concluido
   (HITL, risk=ALTO ou complexity=ALTA: use --status AWAITING, sem --reason.)`,
    HIGH: `   issues status --id {{id}} --agent {{agent}} --status AWAITING --comment "<o que foi alinhado e decidido>"
   (projeto concern HIGH: Planning não fecha por agente — envie para decisão humana com --status AWAITING, sem --reason concluido; o humano decide no web.)`,
  },
  Design: {
    LOW: `   issues status --id {{id}} --agent {{agent}} --status CLOSED --comment "<decisão, desenho, fatias criadas>" --reason concluido
   (Com --value true: grave antes design.md com 'issues design doc --issue {{id}} --file design.md' e os diagramas com 'issues design add --issue {{id}} --kind component|package|class|activity --file <f.puml>', e encerre com --status AWAITING. HITL, risk=ALTO ou complexity=ALTA: também AWAITING.)`,
    HIGH: `   issues status --id {{id}} --agent {{agent}} --status AWAITING --comment "<decisão, desenho, fatias criadas>"
   (projeto concern HIGH: Design não fecha por agente — envie para decisão humana com --status AWAITING, sem --reason concluido. Com --value true grave antes design.md com 'issues design doc --issue {{id}} --file design.md' e os diagramas com 'issues design add --issue {{id}} --kind component|package|class|activity --file <f.puml>'. O humano decide no web.)`,
  },
};

// Rota de fuga comum: sem ela o agente fica preso num gate de Issue que ele mesmo criou errada
// (observado: Issue Planning abandonada CLAIMED porque "fechar" cobrava requisitos). Deploy não
// entra: agente nunca fecha Deploy, e o contrato dele já orienta o AWAITING com --reason errado.
const ABANDONO = `Issue errada, duplicada ou grande demais? Crie as Issues substitutas com --relates {{id}} e abandone esta sem cobrar o gate:
   issues status --id {{id}} --agent {{agent}} --status CLOSED --reason obsoleto --comment "<por quê / substituída por qual Issue>"
   (HITL, risk=ALTO ou complexity=ALTA: use --status AWAITING --reason obsoleto.)`;

// Contrato de execução pós-APPROVED: a Issue já foi aprovada pelo humano e reentrou na fila. A sessão
// NÃO recebe o handoff inline no prompt — busca-o pelo comando, executa os próximos passos gravados
// na aprovação e fecha direto (a trava humana já é dispensada pelo app no fechamento pós-APPROVED,
// então nada de AWAITING). Substitui o contrato da action: aqui não se desenha nem se replaneja.
const EXECUTION = `Esta Issue já foi APROVADA pelo humano e reentrou na fila para execução. Não refaça o design nem a decisão — execute o handoff.

1. Busque o handoff (resumo + próximos passos gravados na aprovação):
   issues handoff --id {{id}}
2. Execute os próximos passos descritos no handoff.
3. Encerramento com evidência — feche direto (a trava humana já foi dispensada por já ter sido aprovada; não envie para AWAITING):
   issues status --id {{id}} --agent {{agent}} --status CLOSED --comment "<o que executou e como validou>" --reason concluido`;

export function executionContract(issue: { id: string; project: string; owner: string | null }): string {
  return `## Entrega desta Issue (Issue APROVADA — executar o handoff)\n\n${fill(EXECUTION, issue)}`;
}

export function actionContract(issue: { id: string; action: ActionType; project: string; owner: string | null; concern?: ConcernLevel }): string {
  const raw = issue.action === "Deploy" ? CONTRACTS.Deploy : `${CONTRACTS[issue.action]}\n\n${ABANDONO}`;
  const close = CLOSE[issue.action];
  const body = close ? raw.replace("{{close}}", close[issue.concern ?? "LOW"]) : raw;
  return `## Entrega desta Issue (action ${issue.action})\n\n${fill(body, issue)}`;
}

function fill(text: string, issue: { id: string; project: string; owner: string | null }): string {
  return text.replaceAll("{{id}}", issue.id)
    .replaceAll("{{agent}}", issue.owner ?? "<ia>")
    .replaceAll("{{project}}", issue.project);
}

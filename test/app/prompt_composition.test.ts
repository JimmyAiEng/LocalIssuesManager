import assert from "node:assert/strict";
import test from "node:test";
import { MediaArtifact } from "../../src/domain/artifacts/media_artifact.js";
import { type Feature, toGherkin } from "../../src/domain/artifacts/requirement_artifact.js";
import { Issue } from "../../src/domain/issue_entity.js";
import { ACTION_TYPES, type ActionType, type IssueType } from "../../src/domain/value_objects.js";
import type { IssueView, RelatedView } from "../../src/app/services/use_cases/issue_use_cases.js";
import { composePrompt } from "../../src/app/services/use_cases/prompt_composition.js";

function makeView(action: ActionType = "Implement", extra: Partial<IssueView> = {}, type: IssueType = "Feat"): IssueView {
  const issue = Issue.create({ title: "T", project: "demo", type, action,
    problem: "problema X", acceptance_criteria: "criterio Y" }, "claude-code");
  return { ...issue.toJSON(), artifact: null, related: [], ancestors: [], ...extra };
}

test("cabeçalho aponta a action e as seções vêm na ordem correta", () => {
  const text = composePrompt(makeView());
  assert.match(text, /Issue com action `Implement`/);
  const positions = ["sdlc-workflow", "## Issue"]
    .map((header) => text.indexOf(header));
  assert.ok(positions.every((pos) => pos >= 0), "todas as seções presentes");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "seções em ordem crescente");
});

test("prompt sem catálogo geral de comandos nem convite a encadear Issues", () => {
  const text = composePrompt(makeView());
  assert.doesNotMatch(text, /## Comandos/);
  assert.doesNotMatch(text, /## SDLC/);
  // Quem decide se há próxima Issue é o loop externo, não o prompt.
  assert.doesNotMatch(text, /issues next/);
});

test("contrato da action fecha o prompt com comandos prontos: id e agent reais substituídos", () => {
  const view = makeView("Planning", { owner: "pi" });
  const text = composePrompt(view);
  assert.match(text, /## Entrega desta Issue \(action Planning\)/);
  assert.ok(text.includes(`issues requirements set --id ${view.id} --file req.jsonl`));
  assert.ok(text.includes(`issues decompose --id ${view.id} --into decompose.json --agent pi`));
  assert.ok(text.endsWith("--reason obsoleto.)"), "contrato (com a rota de abandono) é a última seção");
  // Sem claim (owner null), o agent fica como placeholder explícito.
  assert.match(composePrompt(makeView("Planning")), /--agent <ia> --status CLOSED/);
});

test("cada action recebe o seu contrato: entrega própria + rota de abandono (Deploy: só AWAITING)", () => {
  const contains = (action: ActionType, fragment: string) =>
    assert.ok(composePrompt(makeView(action)).includes(fragment), `${action}: ${fragment}`);
  // Payload copy-paste da linha JSONL: é a única documentação do formato garantida em qualquer harness.
  contains("Planning", '{"feature": "Login", "como": "um usuário", "quero": "entrar", "para": "acessar o painel", "scenarios": [{"nome": "ok", "steps": ["Given a tela de login", "When envio credenciais válidas", "Then vejo o painel"]}]}');
  contains("Design", "issues design changed --issue");
  contains("Design", "issues plan set --id");
  contains("Implement", "issues worktree add --id");
  contains("QA", "APROVADO | APROVADO com ressalva | REPROVADO");
  const deploy = composePrompt(makeView("Deploy"));
  assert.match(deploy, /--status AWAITING --comment "PR: /);
  assert.doesNotMatch(deploy, /--reason concluido/);
  for (const action of ACTION_TYPES.filter((a) => a !== "Deploy")) {
    assert.match(composePrompt(makeView(action)), /--reason obsoleto/, `${action} tem rota de abandono`);
  }
});

// Observado no HomeInventory: numa Issue Design o agente escreveu os 6 arquivos de produção das
// filhas Implement (ainda OPEN) e gastou o orçamento nisso, sem entregar os diagramas do gate.
// Nenhuma linha do contrato proibia — agora proíbe, antes dos passos.
test("contrato Design proíbe código de produção antes de listar as entregas", () => {
  const text = composePrompt(makeView("Design"));
  assert.match(text, /Não escreva código de produção nesta Issue/);
  assert.ok(text.indexOf("Não escreva código de produção") < text.indexOf("issues design changed"),
    "a proibição vem antes dos comandos");
  // Só Design: Implement é justamente onde o código deve ser escrito.
  assert.doesNotMatch(composePrompt(makeView("Implement")), /Não escreva código de produção/);
});

test("cada ActionType aparece no cabeçalho e na seção Issue", () => {
  for (const action of ACTION_TYPES) {
    const text = composePrompt(makeView(action));
    assert.match(text, new RegExp(`action \`${action}\``), `ActionType ${action}`);
    assert.ok(text.includes(`- Action: ${action}`), `ActionType ${action} na seção`);
  }
});

test("infos da Issue presentes, incluindo id para os comandos", () => {
  const view = makeView();
  const text = composePrompt(view);
  for (const fragment of [`- Id: ${view.id}`, "- Problema: problema X",
    "- Critérios de aceitação: criterio Y", "- Tipo: Feat", "- Status: OPEN", "- Tags: —"]) {
    assert.ok(text.includes(fragment), fragment);
  }
});

test("artefato da Issue e worktree aparecem quando existem; ausentes, nada", () => {
  const bare = composePrompt(makeView());
  assert.doesNotMatch(bare, /## Artefato/);
  assert.doesNotMatch(bare, /- Worktree:/);
  const full = composePrompt(makeView("Implement", { artifact: "# contexto explorado",
    worktree: { path: "/tmp/wt", branch: "issue/ab" } }));
  assert.match(full, /## Artefato da Issue\n# contexto explorado/);
  assert.match(full, /- Worktree: \/tmp\/wt \(branch issue\/ab\)/);
});

test("linhagem: artefatos das relacionadas viajam no prompt; sem artefato, marcado", () => {
  const related: RelatedView[] = [
    { id: "d1", title: "Design da fila", status: "CLOSED", action: "Design", artifact: "# spec congelada", kind: "parent" },
    { id: "p1", title: "Planejamento", status: "CLOSED", action: "Planning", artifact: null, kind: "see-also" },
  ];
  const text = composePrompt(makeView("Implement", { related }));
  assert.match(text, /## Issues relacionadas/);
  assert.match(text, /### Design da fila \(Design, CLOSED, id d1\)\n# spec congelada/);
  assert.match(text, /### Planejamento \(Planning, CLOSED, id p1\)\n\(sem artefato\)/);
  assert.doesNotMatch(composePrompt(makeView()), /## Issues relacionadas/);
});

test("Issue Implement filha recebe o plano do Design pai no prompt", () => {
  const related: RelatedView[] = [
    { id: "d1", title: "Design", status: "CLOSED", action: "Design", artifact: "# spec", kind: "parent",
      plan: { objetivo: "extrair parser", passos: ["criar arquivo", "ligar gate"],
        arquivos: ["src/x.ts"], criterio_pronto: "npm test verde" } },
  ];
  const text = composePrompt(makeView("Implement", { related }));
  assert.match(text, /#### Plano de implementação/);
  assert.match(text, /- Objetivo: extrair parser/);
  assert.match(text, / {2}1\. criar arquivo\n {2}2\. ligar gate/);
  assert.match(text, /- Arquivos afetados:\n {2}- src\/x\.ts/);
  assert.match(text, /- Critério de pronto: npm test verde/);
  assert.doesNotMatch(composePrompt(makeView("Implement", { related: [
    { id: "d1", title: "Design", status: "CLOSED", action: "Design", artifact: "# spec", kind: "parent" }] })),
    /Plano de implementação/);
});

test("Issue Design recebe as Features do seu grupo renderizadas em Gherkin no prompt", () => {
  const features: Feature[] = [
    { feature: "Login", como: "um usuário", quero: "entrar", para: "acessar o painel",
      scenarios: [{ nome: "ok", steps: ["Given a tela", "Then vejo o painel"] }] },
    { feature: "Logout", como: "um usuário", quero: "sair", para: "encerrar a sessão",
      scenarios: [{ nome: "ok", steps: ["Given a sessão aberta", "Then volto ao login"] }] },
  ];
  const text = composePrompt(makeView("Design", { features }));
  assert.match(text, /## Features desta Issue/);
  // O artefato é JSONL, mas quem lê o prompt é um agente: chega o Gherkin renderizado, não a linha crua.
  for (const feature of features) assert.ok(text.includes(toGherkin(feature)), feature.feature);
  assert.match(text, /Feature: Login[\s\S]*Feature: Logout/);
  assert.doesNotMatch(text, /\{"feature"/);
  assert.doesNotMatch(composePrompt(makeView("Design")), /## Feature/);
});

test("a cadeia de ancestrais aparece no prompt, do mais próximo ao mais distante", () => {
  const ancestors: RelatedView[] = [
    { id: "d1", title: "Design da fila", status: "CLOSED", action: "Design", artifact: null, kind: "parent" },
    { id: "p1", title: "Planejamento", status: "CLOSED", action: "Planning", artifact: null, kind: "parent" },
  ];
  const text = composePrompt(makeView("Implement", { ancestors }));
  assert.match(text, /## Linhagem \(ancestrais\)/);
  assert.match(text, /Design da fila \(Design, id d1\) ← Planejamento \(Planning, id p1\)/);
  assert.doesNotMatch(composePrompt(makeView()), /## Linhagem/);
});

test("anexos ficam localizáveis ao agente: caminho em disco + URL; sem anexo, sem linha", () => {
  assert.doesNotMatch(composePrompt(makeView()), /Anexos/);
  const att = MediaArtifact.create({ filename: "erro.png", mediaType: "image/png", size: 10 });
  const issue = Issue.create({ title: "T", project: "de mo", type: "Feat", action: "Implement",
    problem: "p", acceptance_criteria: "c", attachments: [att.toJSON()] }, "human");
  const text = composePrompt({ ...issue.toJSON(), artifact: null, related: [], ancestors: [] });
  assert.match(text, /- Anexos/);
  assert.match(text, /erro\.png/);
  assert.match(text, new RegExp(`projects/de%20mo/attachments/${att.id}\\.png`)); // projectSegment encoda espaço
  assert.match(text, new RegExp(`/api/attachments/${att.id}`));
});

test("Tags preenchidas aparecem formatadas como key=value e determinismo vale", () => {
  const issue = Issue.create({ title: "T", project: "demo", type: "Feat", action: "QA", problem: "p" }, "human");
  issue.tag({ complexity: "ALTA", risk: "BAIXO" }, "human");
  const view: IssueView = { ...issue.toJSON(), artifact: null, related: [], ancestors: [] };
  const text = composePrompt(view);
  assert.match(text, /- Tags: complexity=ALTA, risk=BAIXO/);
  assert.equal(composePrompt(view), composePrompt(view));
});

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// E2E do WORKFLOW PRINCIPAL INTEIRO pela superfície real do usuário-IA: o binário `issues`
// como processo (execFileSync). Caminha Planning -> Design (x2, um com mudança de arquitetura
// e um atalho) -> Implement (x4) -> Review -> Deploy, passando por TODOS os gates de ponta a ponta.
// N=2 Features (2 Design), M=2 (4 Implement no total) — cobre os dois ramos do "Changed?".
const bin = resolve("bin/issues");
const run = (args: string[], vars: NodeJS.ProcessEnv): string => execFileSync(bin, args, { env: vars, encoding: "utf8" });
const attempt = (args: string[], vars: NodeJS.ProcessEnv) => spawnSync(bin, args, { env: vars, encoding: "utf8" });
const json = (args: string[], vars: NodeJS.ProcessEnv) => JSON.parse(run(args, vars));

// Repo git real: o campo `repo` do projeto aponta para ele (vai no prompt do agente).
function gitRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "wf-repo-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
  git("init", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("commit", "--allow-empty", "-m", "init");
  return repo;
}

// Projeto registrado apontando um repo git real. O issue-manager orquestra o harness: não executa
// checks nem exige worktree no fechamento de Implement — a evidência já basta.
function freshEnv(): NodeJS.ProcessEnv {
  const root = mkdtempSync(join(tmpdir(), "wf-store-"));
  const vars = { ...process.env, ISSUES_ROOT: root };
  execFileSync(bin, ["project", "create", "--name", "demo", "--repo", gitRepo()], { env: vars, encoding: "utf8" });
  return vars;
}

const fixture = (name: string, content: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), "wf-fixture-")), name);
  writeFileSync(path, content);
  return path;
};
// O engine PlantUML loga no stderr; o contrato JSON de erros do gate de Design é a última linha.
const lastLine = (text: string): string => text.trim().split("\n").at(-1) ?? "";

// --- Fixtures do domínio (formatos exatos, extraídos do código/testes existentes) -------------
// Requisitos em JSONL: uma Feature estruturada por linha.
const FEATURE_LOGIN = { feature: "Login", como: "usuário", quero: "entrar", para: "acesse o painel",
  scenarios: [{ nome: "ok", steps: ["Given a tela", "When entro", "Then vejo o painel"] }] };
const FEATURE_CADASTRO = { feature: "Cadastro", como: "usuário", quero: "me cadastrar", para: "tenha conta",
  scenarios: [{ nome: "ok", steps: ["Given o formulário", "When submeto", "Then a conta existe"] }] };
const REQUIREMENTS = [FEATURE_LOGIN, FEATURE_CADASTRO].map((feature) => JSON.stringify(feature)).join("\n");
const PLAN = JSON.stringify({ objetivo: "o", passos: ["p"], arquivos: ["a"], criterio_pronto: "c" });
// PlantUML válido por kind, cobrindo os 4 níveis (design_gate KIND_LEVEL): component→high_level,
// package→package, class→class, state→interface_data_model.
const VALID_CLASS = "@startuml\nclass A\n@enduml";
const VALID_STATE = "@startuml\n[*] --> Ativo\n@enduml";
const VALID_COMPONENT = "@startuml\n[Comp]\n@enduml";
const VALID_PACKAGE = '@startuml\npackage "P" {\n  [A]\n}\n@enduml';

// Cria uma Issue (fica OPEN) e devolve o id.
function create(vars: NodeJS.ProcessEnv, action: string, title: string, relates?: string): string {
  const args = ["create", "--title", title, "--project", "demo", "--type", "Feat",
    "--action", action, "--problem", "p", "--agent", "pi"];
  if (relates) args.push("--relates", relates);
  return json(args, vars).id;
}
const claim = (vars: NodeJS.ProcessEnv, id: string) => run(["next", "--id", id, "--agent", "pi"], vars);
const closeAgent = (vars: NodeJS.ProcessEnv, id: string) =>
  json(["status", "--id", id, "--agent", "pi", "--status", "CLOSED", "--comment", "feito com evidência", "--reason", "concluido"], vars);
const status = (vars: NodeJS.ProcessEnv, id: string) => json(["get", "--id", id], vars).status;

// Escreve o arquivo de decomposição e devolve os ids das filhas criadas.
function decompose(vars: NodeJS.ProcessEnv, parent: string, children: object[]): string[] {
  const into = fixture("decomp.json", JSON.stringify({ children }));
  return json(["decompose", "--id", parent, "--into", into, "--agent", "pi"], vars).children;
}

test("workflow e2e: Planning -> 2 Design (arch+atalho) -> 4 Implement -> Review -> Deploy, todos os gates", () => {
  const vars = freshEnv();

  // === PLANNING: RequirementArtifact com 2 Features + fan-out 1->2 Design ========================
  const planning = create(vars, "Planning", "Planning raiz");
  claim(vars, planning);
  run(["requirements", "set", "--id", planning, "--file", fixture("req.jsonl", REQUIREMENTS)], vars);

  // Gate negativo: com Requirements mas SEM as filhas Design, o Planning não fecha.
  const noChildren = attempt(["status", "--id", planning, "--agent", "pi", "--status", "CLOSED", "--comment", "fim", "--reason", "concluido"], vars);
  assert.equal(noChildren.status, 1);
  assert.match(noChildren.stderr, /não fecha sem decompor a Feature/);

  const [designArch, designShortcut] = decompose(vars, planning, [
    { title: "Desenho de identidade", type: "Feat", action: "Design", problem: "desenhar auth", features: ["Login"] },
    { title: "Desenho de registro", type: "Feat", action: "Design", problem: "desenhar registro", features: ["Cadastro"] },
  ]);
  // Com as 2 filhas Design particionando as Features (títulos livres), o Planning fecha AFK.
  assert.equal(closeAgent(vars, planning).status, "CLOSED");

  // === DESIGN A (Autenticacao): architecture_changed=true — exige 4 níveis UML + aceite humano ==
  claim(vars, designArch);
  run(["design", "doc", "--issue", designArch, "--file", fixture("design.md", "# Design Auth")], vars);
  run(["design", "add", "--issue", designArch, "--kind", "component", "--file", fixture("c.puml", VALID_COMPONENT)], vars);
  run(["design", "add", "--issue", designArch, "--kind", "package", "--file", fixture("p.puml", VALID_PACKAGE)], vars);
  run(["design", "add", "--issue", designArch, "--kind", "class", "--file", fixture("cl.puml", VALID_CLASS)], vars);
  run(["design", "add", "--issue", designArch, "--kind", "state", "--file", fixture("s.puml", VALID_STATE)], vars);
  run(["design", "changed", "--issue", designArch, "--value", "true"], vars);
  run(["plan", "set", "--id", designArch, "--file", fixture("plan.json", PLAN)], vars);

  // Gate negativo: arquitetura mudou, o agente NÃO fecha — e ouve isso antes de qualquer cobrança
  // de decomposição, porque no caminho HITL as filhas só nascem depois da aprovação.
  const archClose = attempt(["status", "--id", designArch, "--agent", "pi", "--status", "CLOSED", "--comment", "fim", "--reason", "concluido"], vars);
  assert.equal(archClose.status, 1);
  assert.match(archClose.stderr, /não fecha por agente/);
  run(["artifact", "--id", designArch, "--name", "handoff.md", "--file", fixture("handoff.md", "# handoff")], vars);
  assert.equal(json(["status", "--id", designArch, "--agent", "pi", "--status", "AWAITING", "--comment", "design pronto"], vars).status, "AWAITING");
  // Aprovação humana gera APPROVED; o agente reivindica a aprovada, SÓ ENTÃO decompõe e fecha.
  assert.equal(json(["decide", "--id", designArch, "--human", "--status", "APPROVED", "--comment", "aceito"], vars).status, "APPROVED");
  claim(vars, designArch);
  // Multi-Design: com um Design irmão sob o mesmo Planning, o Design NÃO decompõe em Implement (as
  // fatias irmãs podem conflitar) — quem cria as Implement é a reconciliação (ConflictReview).
  const blockedDecomp = attempt(["decompose", "--id", designArch, "--into",
    fixture("blk.json", JSON.stringify({ children: [{ title: "x", type: "Feat", action: "Implement", problem: "p", plan: JSON.parse(PLAN) }] })), "--agent", "pi"], vars);
  assert.equal(blockedDecomp.status, 1);
  assert.match(blockedDecomp.stderr, /não decompõe em Implement/);
  // O Design fecha sem filha Implement (multi-Design dispensa a decomposição direta). Ainda há um
  // Design irmão vivo, então a reconciliação ainda não nasce.
  assert.equal(closeAgent(vars, designArch).status, "CLOSED");
  assert.equal(json(["list", "--project", "demo"], vars).some((i: { action: string }) => i.action === "ConflictReview"), false);

  // === DESIGN B (Registro): architecture_changed=false — atalho ao plano, fecha AFK ============
  claim(vars, designShortcut);
  run(["design", "changed", "--issue", designShortcut, "--value", "false"], vars);
  run(["plan", "set", "--id", designShortcut, "--file", fixture("plan.json", PLAN)], vars);
  assert.equal(closeAgent(vars, designShortcut).status, "CLOSED"); // multi-Design: fecha sem decompor

  // === CONFLICT REVIEW: o último Design irmão fechou -> reconciliação criada sob o Planning =======
  const conflict = json(["list", "--project", "demo"], vars).find((i: { action: string }) => i.action === "ConflictReview");
  assert.ok(conflict, "o fechamento do último Design irmão cria o ConflictReview");
  assert.ok(conflict.relates.includes(planning), "ConflictReview ligado ao Planning (kind=parent)");
  claim(vars, conflict.id);
  // Gate negativo: sem reconciliation.md o ConflictReview não fecha.
  const noRecon = attempt(["status", "--id", conflict.id, "--agent", "pi", "--status", "CLOSED", "--comment", "fim", "--reason", "concluido"], vars);
  assert.equal(noRecon.status, 1);
  assert.match(noRecon.stderr, /reconciliation\.md/);
  run(["artifact", "--id", conflict.id, "--name", "reconciliation.md", "--file", fixture("recon.md", "# plano reconciliado: fatias sem conflito")], vars);
  // A reconciliação decompõe em 4 Implement (o fan-out que antes saía dos Designs, agora reconciliado).
  const implementIds = decompose(vars, conflict.id, [
    { title: "Impl auth 1", type: "Feat", action: "Implement", problem: "p", plan: JSON.parse(PLAN) },
    { title: "Impl auth 2", type: "Feat", action: "Implement", problem: "p", plan: JSON.parse(PLAN) },
    { title: "Impl reg 1", type: "Feat", action: "Implement", problem: "p", plan: JSON.parse(PLAN) },
    { title: "Impl reg 2", type: "Feat", action: "Implement", problem: "p", plan: JSON.parse(PLAN) },
  ]);
  assert.equal(implementIds.length, 4);
  assert.equal(closeAgent(vars, conflict.id).status, "CLOSED");

  // === IMPLEMENT x4: sem gate de entrega, fecham AFK só com a evidência =========================
  for (const id of implementIds) {
    claim(vars, id);
    assert.equal(closeAgent(vars, id).status, "CLOSED");
  }

  // === INTEGRAÇÃO: a última das 4 fatias gera a Issue de integração antes da Review =============
  const integration = json(["list", "--project", "demo"], vars)
    .find((i: { action: string; title: string }) => i.action === "Implement" && i.title.startsWith("Integração:"));
  assert.ok(integration, "a última fatia cria a integração sob o ConflictReview");
  claim(vars, integration.id);
  assert.equal(closeAgent(vars, integration.id).status, "CLOSED");

  // === Review: criada ao fechar a integração; exige intent + 2 evidence + veredito -> fecha AFK ==
  const qa = json(["list", "--project", "demo"], vars).find((i: { action: string }) => i.action === "Review").id;
  assert.ok(qa, "fechar a integração cria a Quality Review");
  claim(vars, qa);
  const noArtifact = attempt(["status", "--id", qa, "--agent", "pi", "--status", "CLOSED", "--comment", "fim", "--reason", "concluido"], vars);
  assert.equal(noArtifact.status, 1);
  assert.match(noArtifact.stderr, /sem intent\.md/);
  run(["artifact", "--id", qa, "--name", "intent.md", "--file", fixture("intent.md", "# intenção da revisão")], vars);
  run(["artifact", "--id", qa, "--name", "evidence-a.md", "--file", fixture("evidence-a.md", "# evidência a: requisito x comportamento ok")], vars);
  run(["artifact", "--id", qa, "--name", "evidence-b.md", "--file", fixture("evidence-b.md", "# evidência b: sem regressões")], vars);
  run(["artifact", "--id", qa, "--file", fixture("verdict.md", "APROVADO: conjunto consistente")], vars);
  assert.equal(closeAgent(vars, qa).status, "CLOSED");

  // === DEPLOY: exige PR link + análise; força AWAITING; humano aprova; agente fecha pós-APPROVED ==
  const deploy = create(vars, "Deploy", "Deploy da release", planning);
  claim(vars, deploy);
  // Gate negativo 1: Deploy nunca fecha por agente antes da aprovação.
  const agentClose = attempt(["status", "--id", deploy, "--agent", "pi", "--status", "CLOSED", "--comment", "https://git/pr/1 análise sonar ok", "--reason", "concluido"], vars);
  assert.equal(agentClose.status, 1);
  assert.match(agentClose.stderr, /não fecha por agente/);
  // Gate negativo 2: AWAITING sem PR link/análise é barrado.
  const noEvidence = attempt(["status", "--id", deploy, "--agent", "pi", "--status", "AWAITING", "--comment", "subi"], vars);
  assert.equal(noEvidence.status, 1);
  assert.match(lastLine(noEvidence.stderr), /exige evidência de PR/);
  // Com PR link http(s) + análise + handoff, entrega para decisão humana.
  run(["artifact", "--id", deploy, "--name", "handoff.md", "--file", fixture("handoff.md", "# handoff")], vars);
  assert.equal(json(["status", "--id", deploy, "--agent", "pi", "--status", "AWAITING", "--comment", "PR https://git/pr/1 — análise sonar OK"], vars).status, "AWAITING");
  // Go humano gera APPROVED; o agente reivindica e fecha o Deploy (trava humana dispensada, gate revalida o PR).
  const approvedDeploy = json(["decide", "--id", deploy, "--human", "--status", "APPROVED", "--comment", "go"], vars);
  assert.equal(approvedDeploy.status, "APPROVED");
  assert.ok(approvedDeploy.thread.some((e: { decided_by?: string }) => e.decided_by === "human"), "decisão humana registra decided_by");
  claim(vars, deploy);
  const deployClosed = json(["status", "--id", deploy, "--agent", "pi", "--status", "CLOSED", "--comment", "PR https://git/pr/1 mergeado; análise sonar OK", "--reason", "concluido"], vars);
  assert.equal(deployClosed.status, "CLOSED");

  // === Estado terminal: tudo CLOSED ============================================================
  assert.equal(status(vars, planning), "CLOSED");
  assert.equal(status(vars, designArch), "CLOSED"); // aprovado (APPROVED) e fechado pelo agente
  assert.equal(status(vars, designShortcut), "CLOSED"); // AFK
  assert.equal(status(vars, conflict.id), "CLOSED"); // reconciliação AFK
  assert.equal(status(vars, integration.id), "CLOSED");
  for (const id of implementIds) assert.equal(status(vars, id), "CLOSED");
  assert.equal(status(vars, qa), "CLOSED");
  assert.equal(status(vars, deploy), "CLOSED");
});

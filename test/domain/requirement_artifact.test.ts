import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain/domain_error.js";
import { RequirementArtifact } from "../../src/domain/artifacts/requirement_artifact.js";

// O artefato é JSONL: uma Feature estruturada por linha. Os builders montam objetos (não texto),
// e os overrides aceitam qualquer valor — é assim que os casos negativos injetam campo ausente,
// vazio ou do tipo errado sem lutar contra o tipo `Feature`.
const scenario = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  nome: "Cadastro válido",
  steps: ["Given um formulário aberto", "When preencho os dados", "And confirmo", "Then o usuário é criado"],
  ...over,
});
const feature = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  feature: "Cadastro de usuário",
  como: "administrador",
  quero: "cadastrar usuários",
  para: "controle o acesso",
  scenarios: [scenario()],
  ...over,
});
const jsonl = (...lines: unknown[]): string => lines.map((line) => JSON.stringify(line)).join("\n");

const throwsDomain = (fn: () => unknown, match: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof DomainError && match.test(error.message));

test("aceita uma Feature e devolve a estrutura, não texto", () => {
  const { features } = RequirementArtifact.validate(jsonl(feature()));
  assert.equal(features.length, 1);
  assert.equal(features[0].feature, "Cadastro de usuário");
  assert.equal(features[0].como, "administrador");
  assert.equal(features[0].scenarios[0].nome, "Cadastro válido");
  assert.equal(features[0].scenarios[0].steps.length, 4);
});

test("aceita várias Features e featureNames devolve os campos `feature`", () => {
  const set = RequirementArtifact.validate(
    jsonl(feature({ feature: "Login" }), feature({ feature: "Logout" }), feature({ feature: "Cadastro" })));
  assert.equal(set.features.length, 3);
  assert.deepEqual(RequirementArtifact.featureNames(set), ["Login", "Logout", "Cadastro"]);
});

test("campos de texto e steps voltam normalizados (trim)", () => {
  const { features } = RequirementArtifact.validate(jsonl(feature({
    feature: "  Login  ", como: "  usuário  ", scenarios: [scenario({ steps: ["  Given a tela  "] })] })));
  assert.equal(features[0].feature, "Login");
  assert.equal(features[0].como, "usuário");
  assert.deepEqual(features[0].scenarios[0].steps, ["Given a tela"]);
});

// Erro que aponta a linha errada custa mais que erro nenhum: o número é o da linha física do
// arquivo, não o índice da Feature — por isso as linhas em branco entram na contagem.
test("JSON inválido cita a linha real do arquivo, contando as linhas em branco", () => {
  throwsDomain(() => RequirementArtifact.validate(`${jsonl(feature())}\n{quebrado`), /linha 2: JSON inválido/);
  throwsDomain(() => RequirementArtifact.validate(`\n\n${jsonl(feature())}\n\n{quebrado`), /linha 5: JSON inválido/);
});

test("Feature quebrada em várias linhas falha citando a linha, não passa despercebida", () => {
  const partido = ['{"feature": "Login", "como": "usuário",', '"quero": "entrar", "para": "acesse o painel",',
    '"scenarios": [{"nome": "ok", "steps": ["Given a tela"]}]}'].join("\n");
  throwsDomain(() => RequirementArtifact.validate(partido), /linha 1: JSON inválido — cada linha é uma Feature completa/);
});

// Remédio errado é pior que erro nenhum: mandar quebrar a Issue por causa de indentação faria o
// agente destruir escopo correto. O erro tem que apontar a formatação.
test("JSON pretty-printed acusa formatação, não escopo grande demais", () => {
  const pretty = JSON.stringify(feature(), null, 2);
  assert.ok(pretty.split("\n").length > 5); // passa do limite de Features se contar linha antes de parsear
  throwsDomain(() => RequirementArtifact.validate(pretty), /linha 1: JSON inválido — cada linha é uma Feature completa/);
});

test("arquivo vazio ou só com linhas em branco exige ao menos uma Feature", () => {
  for (const raw of ["", "   ", "\n\n", " \n\t\n "]) {
    throwsDomain(() => RequirementArtifact.validate(raw), /ao menos uma Feature/);
  }
});

test("linha que não é objeto JSON é rejeitada", () => {
  for (const raw of [[], "texto livre", null, 42, true]) {
    throwsDomain(() => RequirementArtifact.validate(JSON.stringify(raw)), /linha 1: deve ser um objeto JSON/);
  }
});

test("erro de limite de Features aponta a rota de abandono, não um fechamento que o gate barraria", () => {
  const many = (count: number) => jsonl(...Array.from({ length: count }, (_, i) => feature({ feature: `F${i}` })));
  assert.equal(RequirementArtifact.validate(many(5)).features.length, 5); // 5 é o limite, não o excesso
  throwsDomain(() => RequirementArtifact.validate(many(6)), /6 Features \(limite 5\)/);
  throwsDomain(() => RequirementArtifact.validate(many(6)), /--reason obsoleto/);
});

test("cada campo de texto é obrigatório: ausente, vazio ou não-string nomeia o campo", () => {
  for (const field of ["feature", "como", "quero", "para"]) {
    for (const value of [undefined, "", "   ", 42, null, {}, ["x"]]) {
      throwsDomain(() => RequirementArtifact.validate(jsonl(feature({ [field]: value }))),
        new RegExp(`campo "${field}" é obrigatório \\(texto não vazio\\)`));
    }
  }
});

test("Feature sem cenário não é requisito verificável: scenarios ausente, não-array ou vazio", () => {
  for (const scenarios of [undefined, "Scenario: x", {}, 1, []]) {
    throwsDomain(() => RequirementArtifact.validate(jsonl(feature({ scenarios }))),
      /linha 1 \(Feature "Cadastro de usuário"\): "scenarios" deve ser um array com ao menos um cenário/);
  }
});

test("cenário exige objeto, nome e ao menos um step, apontando o índice", () => {
  const withScenarios = (...scenarios: unknown[]) => () =>
    RequirementArtifact.validate(jsonl(feature({ scenarios })));
  throwsDomain(withScenarios("Given a"), /scenarios\[0\]: deve ser um objeto JSON/);
  throwsDomain(withScenarios(scenario({ nome: "" })), /scenarios\[0\]: campo "nome" é obrigatório/);
  throwsDomain(withScenarios(scenario({ nome: undefined })), /scenarios\[0\]: campo "nome" é obrigatório/);
  for (const steps of [undefined, [], "Given a", {}]) {
    throwsDomain(withScenarios(scenario(), scenario({ nome: "outro", steps })),
      /scenarios\[1\]: "steps" deve ser um array com ao menos um step/);
  }
});

test("step exige uma das keywords seguida de conteúdo", () => {
  const withStep = (value: unknown) => () =>
    RequirementArtifact.validate(jsonl(feature({ scenarios: [scenario({ steps: [value] })] })));
  const esperado = /steps\[0\]: step deve começar com Given\/When\/Then\/And seguido do conteúdo/;
  throwsDomain(withStep("Faço qualquer coisa"), esperado); // sem keyword
  throwsDomain(withStep("But b"), esperado); // keyword fora do vocabulário exigido
  throwsDomain(withStep("Given"), esperado); // keyword sem conteúdo
  throwsDomain(withStep("Given   "), esperado);
  throwsDomain(withStep(42), /recebido 42/); // não-string ecoa o que veio
  throwsDomain(withStep(null), /recebido null/);
  assert.doesNotThrow(withStep("And confirmo"));
});

// O nome liga a Feature à filha Design que a cobre (ADR 0008): duplicata faria duas Features
// colapsarem numa só no gate de partição, sem erro nenhum.
test("nome de Feature duplicado em duas linhas é rejeitado", () => {
  throwsDomain(() => RequirementArtifact.validate(
    jsonl(feature({ feature: "Login" }), feature({ feature: "Logout" }), feature({ feature: "Login" }))),
    /Feature "Login" aparece em duas linhas/);
});

test("Feature acima do limite de palavras é rejeitada nomeando a linha", () => {
  const longo = Array.from({ length: 320 }, (_, index) => `palavra${index}`).join(" ");
  throwsDomain(() => RequirementArtifact.validate(
    jsonl(feature({ scenarios: [scenario({ steps: [`Given ${longo}`] })] }))),
    /linha 1 \(Feature "Cadastro de usuário"\) tem \d+ palavras \(limite 300\)/);
});

test("toJsonl e validate são inversos: o que grava é o que o parser lê", () => {
  const set = RequirementArtifact.validate(jsonl(feature({ feature: "Login" }), feature({ feature: "Logout" })));
  const text = RequirementArtifact.toJsonl(set);
  assert.equal(text.split("\n").length, 2); // uma Feature por linha, sem quebrar no meio
  assert.deepEqual(RequirementArtifact.validate(text), set);
});

// Único lugar que escreve os prefixos pt-BR da user story: o autor preenche campos na forma neutra
// (papel com artigo, verbo no infinitivo) e o sistema conjuga a frase — não há palavra a errar.
test("toGherkin escreve os prefixos da user story a partir dos campos", () => {
  const [only] = RequirementArtifact.validate(jsonl(feature({
    feature: "Login", como: "um usuário", quero: "entrar", para: "acessar o painel",
    scenarios: [
      scenario({ nome: "ok", steps: ["Given a tela de login", "Then vejo o painel"] }),
      scenario({ nome: "senha errada", steps: ["Given a tela de login", "Then vejo o erro"] }),
    ] }))).features;
  assert.equal(RequirementArtifact.toGherkin(only), [
    "Feature: Login",
    "Como um usuário",
    "Eu quero poder entrar",
    "Para que eu possa acessar o painel",
    "",
    "Scenario: ok",
    "Given a tela de login",
    "Then vejo o painel",
    "",
    "Scenario: senha errada",
    "Given a tela de login",
    "Then vejo o erro",
  ].join("\n"));
});

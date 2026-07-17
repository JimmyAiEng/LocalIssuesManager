import assert from "node:assert/strict";
import test from "node:test";
import { checkSyntax, renderSvg, sourceHash } from "../../src/app/plantuml_check.js";

const VALID_CLASS = "@startuml\nclass A\nA --> B\n@enduml";
const INVALID = "@startuml\nthis is !! broken\n@enduml";

test("checkSyntax valida diagrama PlantUML e reporta o diagramType", async () => {
  const check = await checkSyntax(VALID_CLASS);
  assert.equal(check.valid, true);
  assert.equal(check.diagramType, "ClassDiagram");
});

test("checkSyntax reporta line e message do engine para fonte inválida", async () => {
  const check = await checkSyntax(INVALID);
  assert.equal(check.valid, false);
  assert.equal(check.errorLineNumber, 2);
  assert.match(check.errorMessage ?? "", /Syntax Error/);
});

test("checkSyntax não escreve no stdout via console.log e restaura o console (D2)", async () => {
  const original = console.log;
  const calls: unknown[][] = [];
  const spy = (...args: unknown[]) => calls.push(args);
  console.log = spy;
  try {
    await checkSyntax("@startuml\nclass Silenced\n@enduml"); // fonte inédita: o memo não pode pular o engine
    assert.equal(calls.length, 0, "logs do engine devem ir para stderr, não para console.log");
    assert.equal(console.log, spy, "console.log deve ser restaurado após o check");
  } finally {
    console.log = original;
  }
});

// O engine devolve JSON {valid, svg, …}; servir esse JSON como image/svg+xml daria imagem
// quebrada no browser. Daí ancorar no início da string, não num "contém <svg".
test("renderSvg devolve o SVG cru do campo svg, não o JSON do engine", async () => {
  const svg = await renderSvg(VALID_CLASS);
  assert.ok(svg.startsWith("<svg"), `esperado SVG cru, veio: ${svg.slice(0, 40)}`);
  assert.doesNotMatch(svg, /^\s*[{"]/); // não é JSON nem string JSON-encodada
});

test("renderSvg rejeita fonte inválida com a mensagem do engine", async () => {
  await assert.rejects(renderSvg(INVALID), /Syntax Error/);
});

test("sourceHash muda com o fonte — é a chave do memo e o ETag da rota .svg", () => {
  assert.equal(sourceHash(VALID_CLASS), sourceHash(VALID_CLASS));
  assert.notEqual(sourceHash(VALID_CLASS), sourceHash(INVALID));
});

// Os testes abaixo provam que o engine NÃO roda de novo. Comparar dois retornos iguais não
// provaria nada: render é determinístico, e a asserção passaria com o memo deletado.

// checkSyntax devolve objeto: o memo entrega a MESMA referência; sem memo, JSON.parse cria outra.
test("checkSyntax memoiza por fonte — o pacote de Design revalida cada .puml a cada poll", async () => {
  const source = "@startuml\nclass Memo\n@enduml";
  const first = await checkSyntax(source);
  assert.equal(await checkSyntax(source), first); // mesma referência = veio do memo
  assert.notEqual(await checkSyntax("@startuml\nclass MemoOutro\n@enduml"), first);
});

// renderSvg devolve string (igualdade é por valor, não prova nada). O sinal observável é o
// engine: ele loga ~10 linhas por render real e nada quando o memo responde.
test("renderSvg memoiza por fonte — o segundo pedido não chama o engine", async () => {
  const source = "@startuml\nclass MemoRender\n@enduml";
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    await renderSvg(source);
    const rendered = logs.length;
    logs.length = 0;
    await renderSvg(source);
    const cached = logs.length;
    logs.length = 0;
    await renderSvg("@startuml\nclass MemoRenderOutro\n@enduml");
    const other = logs.length;
    assert.ok(rendered > 0, "render real deve acionar o engine");
    assert.equal(cached, 0, "segundo pedido da mesma fonte não pode acionar o engine");
    assert.ok(other > 0, "fonte nova deve acionar o engine (o memo é por conteúdo)");
  } finally {
    console.error = original;
  }
});

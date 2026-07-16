import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "../../src/web/client/markdown.js";

test("XSS: HTML cru do usuário sai sempre escapado, nunca como tag ativa", () => {
  const html = renderMarkdown("<img src=x onerror=alert(1)>");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("negrito, itálico e código inline viram tags", () => {
  const html = renderMarkdown("**forte** e *ênfase* com `code`");
  assert.match(html, /<strong>forte<\/strong>/);
  assert.match(html, /<em>ênfase<\/em>/);
  assert.match(html, /<code>code<\/code>/);
});

test("headings de # a #### mapeiam h1..h4", () => {
  assert.match(renderMarkdown("# Título"), /<h1>Título<\/h1>/);
  assert.match(renderMarkdown("#### Menor"), /<h4>Menor<\/h4>/);
});

test("code fence preserva conteúdo escapado sem interpretar marcação", () => {
  const html = renderMarkdown("```\n<b>x</b> **nao negrito**\n```");
  assert.match(html, /<pre class="md-code"><code>&lt;b&gt;x&lt;\/b&gt; \*\*nao negrito\*\*<\/code><\/pre>/);
});

test("listas com - e 1. viram ul/ol", () => {
  assert.match(renderMarkdown("- a\n- b"), /<ul class="md-list"><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(renderMarkdown("1. um\n2. dois"), /<ol class="md-list"><li>um<\/li><li>dois<\/li><\/ol>/);
});

test("checklists [ ]/[x] viram itens com checkbox desabilitado", () => {
  const html = renderMarkdown("- [ ] pendente\n- [x] feito");
  assert.match(html, /<li class="md-task"><input type="checkbox" disabled> pendente<\/li>/);
  assert.match(html, /<li class="md-task"><input type="checkbox" disabled checked> feito<\/li>/);
});

test("links só http/https, com rel/target; outros esquemas ficam como texto", () => {
  const ok = renderMarkdown("[site](https://exemplo.com/a)");
  assert.match(ok, /<a href="https:\/\/exemplo.com\/a" rel="noopener" target="_blank">site<\/a>/);
  const bad = renderMarkdown("[x](javascript:alert(1))");
  assert.doesNotMatch(bad, /<a /);
  assert.match(bad, /\[x\]\(javascript:alert\(1\)\)/);
});

test("parágrafos separam por linha em branco e quebram por \\n", () => {
  const html = renderMarkdown("linha um\nlinha dois\n\nnovo parágrafo");
  assert.match(html, /<p>linha um<br>linha dois<\/p>/);
  assert.match(html, /<p>novo parágrafo<\/p>/);
});

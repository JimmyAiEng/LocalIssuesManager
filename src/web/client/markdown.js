import { escapeHtml } from "./view_model.js";

// Só http/https viram link; qualquer outro esquema fica como texto escapado.
const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

// Renderizador Markdown mínimo e seguro: escapa TUDO primeiro e só então transforma marcações.
// Nenhum HTML cru do usuário atravessa — o input já entra escapado antes de qualquer regex.
export function renderMarkdown(text) {
  const lines = escapeHtml(text).split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) { i = renderFence(lines, i + 1, out); continue; }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) { const level = heading[1].length; out.push(`<h${level}>${inline(heading[2])}</h${level}>`); i++; continue; }
    if (/^\s*-\s+/.test(line)) { i = renderList(lines, i, out, /^\s*-\s+(.*)$/, "ul"); continue; }
    if (/^\s*\d+\.\s+/.test(line)) { i = renderList(lines, i, out, /^\s*\d+\.\s+(.*)$/, "ol"); continue; }
    if (line.trim() === "") { i++; continue; }
    i = renderParagraph(lines, i, out);
  }
  return out.join("");
}

function renderFence(lines, start, out) {
  const body = [];
  let i = start;
  while (i < lines.length && !lines[i].trim().startsWith("```")) { body.push(lines[i]); i++; }
  out.push(`<pre class="md-code"><code>${body.join("\n")}</code></pre>`);
  return i + 1; // pula a cerca de fechamento
}

function renderList(lines, start, out, pattern, tag) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const match = lines[i].match(pattern);
    if (!match) break;
    items.push(renderItem(match[1]));
    i++;
  }
  out.push(`<${tag} class="md-list">${items.join("")}</${tag}>`);
  return i;
}

function renderItem(content) {
  const task = content.match(/^\[([ xX])\]\s+(.*)$/);
  if (!task) return `<li>${inline(content)}</li>`;
  const checked = task[1].toLowerCase() === "x";
  return `<li class="md-task"><input type="checkbox" disabled${checked ? " checked" : ""}> ${inline(task[2])}</li>`;
}

function renderParagraph(lines, start, out) {
  const buf = [];
  let i = start;
  while (i < lines.length && !isBlockStart(lines[i])) { buf.push(inline(lines[i])); i++; }
  if (buf.length) out.push(`<p>${buf.join("<br>")}</p>`);
  return i;
}

function isBlockStart(line) {
  return line.trim() === "" || line.trim().startsWith("```") || /^#{1,4}\s+/.test(line)
    || /^\s*-\s+/.test(line) || /^\s*\d+\.\s+/.test(line);
}

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(LINK, (_, label, url) => `<a href="${url}" rel="noopener" target="_blank">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

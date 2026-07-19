import { escapeHtml } from "./view_model.js";
import { renderMarkdown } from "./markdown.js";

// Documentos nomeados da Issue (intent.md, evidence-*.md): cada um colapsável, com o nome do
// arquivo e o markdown renderizado — mesmo padrão das demais seções. O artefato legado
// ("artifact.md") já aparece na seção Artefato, então é omitido aqui.
export function documentsMarkup(documents) {
  return (documents ?? [])
    .filter((doc) => doc.name !== "artifact.md")
    .map((doc) => `<details class="box document" open><summary>${escapeHtml(doc.name)}</summary><div class="md">${renderMarkdown(doc.markdown)}</div></details>`)
    .join("");
}

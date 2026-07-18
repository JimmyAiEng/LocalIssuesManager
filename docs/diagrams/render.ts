// Renderiza cada .puml deste diretório para SVG (offline, engine do próprio repo)
// e gera index.html — uma página única navegável. Rode: npm run diagrams
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSvg } from "../../src/app/plantuml_check.js";

const dir = dirname(fileURLToPath(import.meta.url));
const TITLES: Record<string, string> = {
  "01-system-context": "Contexto do Sistema",
  "02-components": "Componentes / Camadas",
  "03-domain-class": "Classes do Domínio",
  "04-state-machine": "Máquina de Estados",
  "05-action-gates": "Gates por Action",
  "06-sdlc-lineage": "Fluxo SDLC & Linhagem",
  "07-web-client": "Web Client",
};

const files = readdirSync(dir).filter((f) => f.endsWith(".puml")).sort();
const sections: string[] = [];
const nav: string[] = [];
for (const file of files) {
  const id = file.replace(/\.puml$/, "");
  const title = TITLES[id] ?? id;
  const svg = await renderSvg(readFileSync(join(dir, file), "utf8"));
  nav.push(`<a href="#${id}">${title}</a>`);
  sections.push(`<section id="${id}"><h2>${title} <small>${file}</small></h2><div class="d">${svg}</div></section>`);
  console.log(`ok  ${file}`);
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WorkflowDev — Diagramas</title><style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 system-ui,sans-serif}
nav{position:sticky;top:0;background:Canvas;border-bottom:1px solid GrayText;padding:.6rem 1rem;display:flex;gap:.3rem 1rem;flex-wrap:wrap;z-index:9}
nav a{text-decoration:none;color:LinkText;font-size:.9rem}
main{max-width:1200px;margin:0 auto;padding:1rem}
h1{padding:0 1rem}
section{margin:2rem 0;padding-bottom:2rem;border-bottom:1px solid ButtonBorder}
h2 small{color:GrayText;font-weight:400;font-size:.8rem}
.d{overflow-x:auto}
.d svg{max-width:100%;height:auto;background:#fff;border-radius:8px;padding:8px}
</style></head><body>
<h1>WorkflowDev — Diagramas do Sistema</h1>
<nav>${nav.join("")}</nav>
<main>${sections.join("\n")}</main>
</body></html>`;

writeFileSync(join(dir, "index.html"), html);
console.log(`\ngerado: ${join(dir, "index.html")}`);

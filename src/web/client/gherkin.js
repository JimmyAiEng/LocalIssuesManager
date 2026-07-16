import { escapeHtml } from "./view_model.js";

// Espelha a gramática validada pelo domínio (src/domain/requirements.ts):
// Feature: <nome> → user story (3 linhas Como/Eu quero/Para que) → Scenarios com steps Given/When/Then/And.
export function parseFeature(text) {
  const lines = String(text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const name = (lines[0] ?? "").replace(/^Feature:\s*/, "");
  const story = lines.slice(1, 4);
  const scenarios = [];
  for (const line of lines.slice(4)) {
    const head = line.match(/^Scenario:\s*(.+)$/);
    if (head) { scenarios.push({ name: head[1], steps: [] }); continue; }
    scenarios.at(-1)?.steps.push(parseStep(line));
  }
  return { name, story, scenarios };
}

function parseStep(line) {
  const match = line.match(/^(Given|When|Then|And)(?:\s+(.*))?$/);
  return match ? { keyword: match[1], text: match[2] ?? "" } : { keyword: "", text: line };
}

export function requirementsMarkup(requirements) {
  const features = requirements?.features ?? [];
  return features.map((feature) => featureMarkup(parseFeature(feature))).join("");
}

function featureMarkup(feature) {
  const story = feature.story.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const scenarios = feature.scenarios.map(scenarioMarkup).join("");
  return `<article class="feature"><h3><span class="kw kw-feature">Feature</span>${escapeHtml(feature.name)}</h3><div class="story">${story}</div>${scenarios}</article>`;
}

function scenarioMarkup(scenario) {
  const steps = scenario.steps.map(stepMarkup).join("");
  return `<section class="scenario"><h4><span class="kw kw-scenario">Scenario</span>${escapeHtml(scenario.name)}</h4><ol class="steps">${steps}</ol></section>`;
}

function stepMarkup(step) {
  if (!step.keyword) return `<li><span class="step-text">${escapeHtml(step.text)}</span></li>`;
  return `<li><span class="kw kw-${step.keyword.toLowerCase()}">${step.keyword}</span><span class="step-text">${escapeHtml(step.text)}</span></li>`;
}

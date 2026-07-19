import { escapeHtml } from "./view_model.js";

// A API entrega o RequirementSet estruturado, então aqui só há renderização. Os prefixos pt-BR da
// user story são escritos nesta camada porque no dado eles são campos (como/quero/para), não texto.
export function requirementsMarkup(requirements) {
  const features = requirements?.features ?? [];
  return features.map(featureMarkup).join("");
}

function featureMarkup(feature) {
  const story = [`Como ${feature.como}`, `Eu quero poder ${feature.quero}`, `Para que eu possa ${feature.para}`]
    .map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const scenarios = feature.scenarios.map(scenarioMarkup).join("");
  return `<article class="feature"><h3><span class="kw kw-feature">Feature</span>${escapeHtml(feature.feature)}</h3><div class="story">${story}</div>${scenarios}</article>`;
}

function scenarioMarkup(scenario) {
  const steps = scenario.steps.map(stepMarkup).join("");
  return `<section class="scenario"><h4><span class="kw kw-scenario">Scenario</span>${escapeHtml(scenario.nome)}</h4><ol class="steps">${steps}</ol></section>`;
}

// O step chega como string crua ("Given a tela"): é o único ponto que ainda separa keyword de texto,
// e só para destacar a keyword visualmente.
function stepMarkup(step) {
  const match = step.match(/^(Given|When|Then|And)\s+(.*)$/);
  if (!match) return `<li><span class="step-text">${escapeHtml(step)}</span></li>`;
  return `<li><span class="kw kw-${match[1].toLowerCase()}">${match[1]}</span><span class="step-text">${escapeHtml(match[2])}</span></li>`;
}

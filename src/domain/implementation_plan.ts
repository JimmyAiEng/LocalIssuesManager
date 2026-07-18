import { DomainError } from "./domain_error.js";

// Artefato de plano de implementação: JSON validável por código (estrutura), sem I/O.
// Objetivo, passos ordenados, arquivos afetados e critério de pronto — o mínimo para
// decompor o Design em Issues Implement. Regra pura do domínio.
export type ImplementationPlan = {
  objetivo: string;
  passos: string[];
  arquivos: string[];
  criterio_pronto: string;
};

// Valida o artefato bruto e devolve-o normalizado, acumulando TODAS as violações
// (análogo ao gate de Design): plano fraco denuncia todos os buracos de uma vez.
export function validatePlan(raw: unknown): ImplementationPlan {
  const errors = collectErrors(raw);
  if (errors.length > 0) throw new DomainError(errors.join("; "));
  return raw as ImplementationPlan;
}

// Conveniência para a camada app: parseia o texto JSON (só JSON é aceito) e valida.
export function parseAndValidatePlan(rawText: string): ImplementationPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new DomainError("Plano deve ser um arquivo JSON válido");
  }
  return validatePlan(parsed);
}

function collectErrors(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return ["Plano deve ser um objeto JSON com objetivo, passos, arquivos e criterio_pronto"];
  }
  const plan = raw as Record<string, unknown>;
  const errors: string[] = [];
  requireText(plan.objetivo, "objetivo", errors);
  requireList(plan.passos, "passos", errors);
  requireList(plan.arquivos, "arquivos", errors);
  requireText(plan.criterio_pronto, "criterio_pronto", errors);
  return errors;
}

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`Plano.${field} é obrigatório (texto não vazio)`);
  }
}

// Passos ordenados / arquivos afetados: array com ao menos um item textual não vazio.
function requireList(value: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`Plano.${field} deve ter ao menos um item`);
    return;
  }
  if (value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    errors.push(`Plano.${field} deve conter apenas textos não vazios`);
  }
}

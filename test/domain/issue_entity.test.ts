import assert from "node:assert/strict";
import test from "node:test";
import { MediaArtifact } from "../../src/domain/artifacts/media_artifact.js";
import { DomainError } from "../../src/domain/domain_error.js";
import { Issue } from "../../src/domain/issue_entity.js";

const input = {
  title: "Implementar fila",
  project: "workflowdev",
  type: "Feat" as const,
  action: "Implement" as const,
  problem: "Não há fila",
};

const longText = Array.from({ length: 301 }, (_, index) => `palavra${index}`).join(" ");

const claimed = (agent: "pi" | "codex" = "pi") => {
  const issue = Issue.create(input, "pi");
  issue.claim(agent);
  return issue;
};

const awaiting = () => {
  const issue = claimed();
  issue.submit("pi", "evidência: feito X, decidido Y");
  return issue;
};

test("cria Issue OPEN com defaults, revisão zero e relates deduplicado", () => {
  const issue = Issue.create({ ...input, relates: ["a", "b", "a"] }, "human", new Date("2026-01-01T00:00:00Z"));
  assert.equal(issue.status, "OPEN");
  assert.equal(issue.owner, null);
  assert.equal(issue.action, "Implement");
  assert.equal(issue.acceptance_criteria, "");
  assert.deepEqual(issue.relates, [{ id: "a", kind: "see-also" }, { id: "b", kind: "see-also" }]);
  assert.equal(issue.revision, 0);
  assert.equal(issue.baseRevision, 0);
  assert.deepEqual(issue.phases, [{ status: "OPEN", timestamp: "2026-01-01T00:00:00.000Z" }]);
});

test("campos obrigatórios rejeitam whitespace (inclusive action)", () => {
  assert.throws(
    () => Issue.create({ ...input, problem: "   " }, "pi"),
    (error: unknown) => error instanceof DomainError && error.message === "problem is required",
  );
  assert.throws(() => Issue.create({ ...input, action: "  " as never }, "pi"), /action is required/);
  const issue = Issue.create({ ...input, acceptance_criteria: "ok" }, "pi");
  assert.equal(issue.acceptance_criteria, "ok");
});

test("problema e critérios de aceite são limitados a 300 palavras (Issue grande = decompor)", () => {
  assert.throws(() => Issue.create({ ...input, problem: longText }, "pi"),
    (error: unknown) => error instanceof DomainError && /301 palavras \(limite 300\)/.test(error.message)
      && /Issues menores relacionadas/.test(error.message));
  assert.throws(() => Issue.create({ ...input, acceptance_criteria: longText }, "pi"), /limite 300/);
});

test("Refactor não passa por Planning: create recusa type=Refactor com action=Planning", () => {
  assert.throws(() => Issue.create({ ...input, type: "Refactor", action: "Planning" }, "pi"),
    (error: unknown) => error instanceof DomainError && /Refactor não passa por Planning/.test(error.message));
  // Refactor com outra action é válido (começa no Design).
  assert.doesNotThrow(() => Issue.create({ ...input, type: "Refactor", action: "Design" }, "pi"));
  // Planning segue válido para os demais types.
  assert.doesNotThrow(() => Issue.create({ ...input, type: "Feat", action: "Planning" }, "pi"));
});

test("claim leva OPEN a CLAIMED e incrementa a revisão", () => {
  const issue = Issue.create(input, "pi");
  issue.claim("codex");
  assert.equal(issue.status, "CLAIMED");
  assert.equal(issue.owner, "codex");
  assert.equal(issue.revision, 1);
  assert.equal(issue.thread.length, 1);
  assert.throws(() => issue.claim("pi"), /Expected OPEN or APPROVED, got CLAIMED/);
});

test("submit exige dono e evidência e leva CLAIMED a AWAITING", () => {
  const issue = claimed("pi");
  assert.throws(() => issue.submit("codex", "evidência"), /Only the Owner may change status/);
  assert.throws(() => issue.submit("pi", "   "), /comment is required/);
  assert.throws(() => issue.submit("pi", longText), /limite 300/);
  issue.submit("pi", "evidência: passos e decisões");
  assert.equal(issue.status, "AWAITING");
  assert.equal(issue.thread.at(-1)?.comment, "evidência: passos e decisões");
});

test("submit fora de CLAIMED é rejeitado", () => {
  const open = Issue.create(input, "pi");
  assert.throws(() => open.submit("pi", "evidência"), /Expected CLAIMED, got OPEN/);
});

test("IA fecha Issue CLAIMED AFK com evidência e motivo", () => {
  const issue = claimed("pi");
  issue.closeByAgent("pi", "feito: passos e decisões", "concluido");
  assert.equal(issue.status, "CLOSED");
  assert.equal(issue.closed_reason, "concluido");
  assert.throws(() => issue.claim("pi"), /Expected OPEN or APPROVED, got CLOSED/);
});

test("closeByAgent exige dono e evidência", () => {
  const issue = claimed("pi");
  assert.throws(() => issue.closeByAgent("codex", "x", "concluido"), /Only the Owner may change status/);
  assert.throws(() => issue.closeByAgent("pi", "  ", "concluido"), /comment is required/);
});

test("humano fecha Issue OPEN ou CLAIMED com motivo; AWAITING só via decide", () => {
  const open = Issue.create(input, "human");
  open.closeByHuman("duplicada", "duplicado");
  assert.equal(open.status, "CLOSED");

  const inProgress = claimed();
  inProgress.closeByHuman("cancelada", "obsoleto");
  assert.equal(inProgress.status, "CLOSED");

  const pending = awaiting();
  assert.throws(() => pending.closeByHuman("x", "concluido"), /Expected OPEN or CLAIMED, got AWAITING/);
  // Override humano: fecha sem comentário (o motivo basta) — espelha o painel web.
  const silent = Issue.create(input, "human");
  silent.closeByHuman("", "errado");
  assert.equal(silent.status, "CLOSED");
});

test("decide APPROVED aprova a Issue AWAITING, limpa o claim e reentra na fila sem reason", () => {
  const issue = awaiting();
  issue.decide("APPROVED", "aprovado: pode seguir o handoff");
  assert.equal(issue.status, "APPROVED");
  assert.equal(issue.closed_reason, null);
  assert.equal(issue.owner, null);
  assert.equal(issue.claimed_at, null);
});

test("decide CLOSED fecha com motivo (abandono ou concluído); reason é obrigatório", () => {
  const abandon = awaiting();
  abandon.decide("CLOSED", "descartada", "obsoleto");
  assert.equal(abandon.status, "CLOSED");
  assert.equal(abandon.closed_reason, "obsoleto");
  // ponytail: a recusa de `concluido` no decide (usar Aprovar) entra com a migração do caller na fatia App.
  const done = awaiting();
  done.decide("CLOSED", "aceito", "concluido");
  assert.equal(done.closed_reason, "concluido");
  assert.throws(() => awaiting().decide("CLOSED", "x"), /Closed reason is required/);
});

test("decisão humana registra decided_by em APPROVED e OPEN; agente não carimba", () => {
  const approving = awaiting();
  approving.decide("APPROVED", "aprovado");
  assert.equal(approving.thread.at(-1)?.decided_by, "human");
  const reopening = awaiting();
  reopening.decide("OPEN", "refazer");
  assert.equal(reopening.thread.at(-1)?.decided_by, "human");
  // submit/close pelo agente não carimba decided_by (não é decisão humana).
  assert.equal(awaiting().thread.at(-1)?.decided_by, undefined);
});

test("decide OPEN/APPROVED exigem comentário e proíbem reason; OPEN limpa o claim", () => {
  const issue = awaiting();
  assert.throws(() => issue.decide("OPEN", "   "), /comment is required/);
  assert.throws(() => issue.decide("APPROVED", "   "), /comment is required/);
  assert.throws(() => issue.decide("CLOSED", "x"), /Closed reason is required/);
  assert.throws(() => issue.decide("OPEN", "volta", "obsoleto"), /OPEN cannot have a closed reason/);
  assert.throws(() => issue.decide("APPROVED", "volta", "obsoleto"), /APPROVED cannot have a closed reason/);
  issue.decide("OPEN", "refazer com testes");
  assert.equal(issue.status, "OPEN");
  assert.equal(issue.owner, null);
  assert.equal(issue.claimed_at, null);
});

test("claim aceita APPROVED: a aprovada reentra na fila e volta a CLAIMED com novo dono", () => {
  const issue = awaiting();
  issue.decide("APPROVED", "aprovado");
  assert.equal(issue.status, "APPROVED");
  issue.claim("codex");
  assert.equal(issue.status, "CLAIMED");
  assert.equal(issue.owner, "codex");
});

test("APPROVED é mutável como OPEN (comment/tag); só CLOSED é imutável", () => {
  const issue = awaiting();
  issue.decide("APPROVED", "aprovado");
  assert.doesNotThrow(() => issue.comment("pi", "nota pós-aprovação"));
  assert.doesNotThrow(() => issue.tag({ risk: "ALTO" }, "human"));
  assert.equal(issue.status, "APPROVED");
});

test("decide fora de AWAITING é rejeitado", () => {
  assert.throws(() => claimed().decide("CLOSED", "x", "concluido"), /Expected AWAITING, got CLAIMED/);
});

test("reset só age em CLAIMED", () => {
  const issue = claimed();
  issue.reset("abandono");
  assert.equal(issue.status, "OPEN");
  assert.equal(issue.owner, null);
  assert.equal(issue.claimed_at, null);
  assert.throws(() => issue.reset("de novo"), /Expected CLAIMED, got OPEN/);
});

test("comment anexa entrada à thread sem mudar status nem exigir dono", () => {
  const issue = claimed();
  const attachment = MediaArtifact.create({ filename: "prova.png", mediaType: "image/png", size: 10 }).toJSON();
  const revision = issue.revision;
  issue.comment("codex", "vejam a evidência", [attachment], new Date("2026-05-01T00:00:00Z"));
  assert.equal(issue.status, "CLAIMED");
  assert.equal(issue.revision, revision + 1);
  assert.deepEqual(issue.thread.at(-1), { actor: "codex", timestamp: "2026-05-01T00:00:00.000Z",
    comment: "vejam a evidência", status: "CLAIMED", closed_reason: null, attachments: [attachment] });
});

test("comment aceita só anexo, exige conteúdo e respeita o limite de palavras", () => {
  const issue = claimed();
  const attachment = MediaArtifact.create({ filename: "v.mp4", mediaType: "video/mp4", size: 10 }).toJSON();
  issue.comment("pi", "", [attachment]);
  assert.equal(issue.thread.at(-1)?.attachments?.length, 1);
  assert.throws(() => issue.comment("pi", "   ", []), /comment or attachment is required/);
  assert.throws(() => issue.comment("pi", longText, []), /limite 300/);
});

test("role especializado é gravado na thread de comment/submit/closeByAgent e é opcional", () => {
  const issue = claimed();
  issue.comment("codex", "revisão", [], new Date("2026-05-01T00:00:00Z"), "review");
  assert.equal(issue.thread.at(-1)?.role, "review");
  issue.comment("codex", "sem papel"); // retrocompatível: thread sem role continua válida
  assert.equal("role" in issue.thread.at(-1)!, false);
  issue.submit("pi", "evidência", new Date(), [], "architect");
  assert.equal(issue.thread.at(-1)?.role, "architect");
  const afk = claimed();
  afk.closeByAgent("pi", "feito", "concluido", new Date(), [], "coding");
  assert.equal(afk.thread.at(-1)?.role, "coding");
});

test("comment é bloqueado quando a Issue está CLOSED (imutável)", () => {
  const issue = Issue.create(input, "human");
  issue.closeByHuman("errada", "errado");
  assert.throws(() => issue.comment("pi", "tarde demais"), /CLOSED aggregate is immutable/);
});

test("relate adiciona relações novas com kind, ignora o próprio id e deduplica por id", () => {
  const issue = claimed();
  const revision = issue.revision;
  issue.relate([{ id: "a", kind: "child" }, { id: "a", kind: "parent" }, { id: issue.id, kind: "child" }, { id: "b", kind: "see-also" }]);
  assert.deepEqual(issue.relates, [{ id: "a", kind: "child" }, { id: "b", kind: "see-also" }]);
  assert.equal(issue.revision, revision + 1);
  issue.relate([{ id: "b", kind: "parent" }, { id: "c", kind: "parent" }]); // "b" já ligado: kind não muda
  assert.deepEqual(issue.relates, [{ id: "a", kind: "child" }, { id: "b", kind: "see-also" }, { id: "c", kind: "parent" }]);
});

test("relate sem novidade é rejeitado; em CLOSED a linhagem continua gravável", () => {
  const issue = claimed();
  issue.relate([{ id: "a", kind: "see-also" }]);
  assert.throws(() => issue.relate([{ id: "a", kind: "see-also" }, { id: issue.id, kind: "child" }]), /Nenhuma relação nova/);
  assert.throws(() => issue.relate([]), /Nenhuma relação nova/);
  const closed = Issue.create(input, "human");
  closed.closeByHuman("errada", "errado");
  const revBefore = closed.revision;
  closed.relate([{ id: "a", kind: "see-also" }]); // linhagem gravável após CLOSED (conteúdo segue imutável)
  assert.deepEqual(closed.relates, [{ id: "a", kind: "see-also" }]);
  assert.equal(closed.revision, revBefore + 1);
});

test("fromJSON lê relates antigos (string[]) como see-also", () => {
  const issue = Issue.create({ ...input, relates: ["x"] }, "human");
  const legacy = Issue.fromJSON({ ...issue.toJSON(), relates: ["x", "y"] as never });
  assert.deepEqual(legacy.relates, [{ id: "x", kind: "see-also" }, { id: "y", kind: "see-also" }]);
});

// A tag da Issue alimenta requiresHuman: rebaixá-la é o agente afrouxando a própria supervisão.
test("tag da Issue por IA: escalar é aceito nos 3 eixos", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" }, "human");
  issue.tag({ risk: "MEDIO" }, "pi");
  issue.tag({ risk: "ALTO" }, "pi");
  issue.tag({ complexity: "MEDIA" }, "pi");
  issue.tag({ complexity: "ALTA" }, "pi");
  issue.tag({ human_need: "HITL" }, "pi"); // AFK → HITL: MAIS supervisão, apesar do índice menor em TAG_VALUES
  assert.deepEqual(issue.tags, { risk: "ALTO", complexity: "ALTA", human_need: "HITL" });
});

test("tag da Issue por IA: rebaixar é DomainError nos 3 eixos e o update é atômico", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ risk: "ALTO", complexity: "ALTA", human_need: "HITL" }, "human");
  assert.throws(() => issue.tag({ risk: "MEDIO" }, "pi"), (error: unknown) =>
    error instanceof DomainError && /rebaixar risk \(ALTO → MEDIO\)/.test(error.message));
  assert.throws(() => issue.tag({ complexity: "BAIXA" }, "pi"), /rebaixar complexity/);
  // A armadilha: human_need é ["HITL","AFK"] em TAG_VALUES — índice CRESCENTE = MENOS supervisão.
  assert.throws(() => issue.tag({ human_need: "AFK" }, "pi"), /rebaixar human_need \(HITL → AFK\)/);
  assert.throws(() => issue.tag({ complexity: "BAIXA", risk: "BAIXO" }, "pi"), /rebaixar/);
  assert.deepEqual(issue.tags, { risk: "ALTO", complexity: "ALTA", human_need: "HITL" }); // nada mutou
});

test("tag da Issue por humano rebaixa; IA mantém valor como no-op; ausente não compara", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ risk: "MEDIO", human_need: "AFK" }, "pi"); // sem tags anteriores: nada a rebaixar
  issue.tag({ risk: "MEDIO", human_need: "AFK" }, "pi"); // no-op
  issue.tag({ risk: "ALTO", complexity: "ALTA", human_need: "HITL" }, "human");
  issue.tag({ risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" }, "human");
  assert.deepEqual(issue.tags, { risk: "BAIXO", complexity: "BAIXA", human_need: "AFK" });
});

test("tag valida categoria/valor, mescla, incrementa a revisão e guarda CLOSED", () => {
  const issue = Issue.create(input, "pi");
  issue.tag({ complexity: "ALTA" }, "human");
  issue.tag({ human_need: "AFK", risk: "BAIXO" }, "human");
  assert.deepEqual(issue.tags, { complexity: "ALTA", human_need: "AFK", risk: "BAIXO" });
  assert.equal(issue.revision, 2);
  assert.throws(() => issue.tag({ risk: "GIGANTE" }, "human"), (error: unknown) =>
    error instanceof DomainError && error.message === "Invalid risk: GIGANTE");
  assert.throws(() => issue.tag({}, "human"), /At least one tag is required/);
  const closed = Issue.create(input, "human");
  closed.closeByHuman("errada", "errado");
  assert.throws(() => closed.tag({ risk: "ALTO" }, "human"), /CLOSED aggregate is immutable/);
});

test("decide e submit registram anexos na thread", () => {
  const attachment = MediaArtifact.create({ filename: "prova.png", mediaType: "image/png", size: 5 }).toJSON();
  const issue = claimed();
  issue.submit("pi", "evidência", new Date(), [attachment]);
  assert.equal(issue.thread.at(-1)?.attachments?.length, 1);
  issue.decide("OPEN", "refazer", undefined, new Date(), [attachment]);
  assert.equal(issue.thread.at(-1)?.attachments?.length, 1);
});

test("fromJSON hidrata defaults ausentes e toJSON não vaza baseRevision", () => {
  const issue = claimed();
  const data = issue.toJSON();
  assert.equal("baseRevision" in data, false);
  const legacy = Issue.fromJSON({ ...data, relates: undefined as never, tags: undefined as never });
  assert.deepEqual(legacy.relates, []);
  assert.deepEqual(legacy.tags, {});
  const clone = Issue.fromJSON(data);
  assert.equal(clone.baseRevision, issue.revision);
  assert.deepEqual(clone.toJSON(), data);
});

// Retrocompat: JSONs antigos persistiram um campo `worktree` que já não existe no modelo.
// Ler um desses não pode quebrar — o campo é simplesmente ignorado.
test("fromJSON ignora um campo worktree legado sem quebrar", () => {
  const legacy = claimed().toJSON();
  (legacy as Record<string, unknown>).worktree = { path: "/old/wt", branch: "issue/old" };
  assert.doesNotThrow(() => Issue.fromJSON(legacy));
});

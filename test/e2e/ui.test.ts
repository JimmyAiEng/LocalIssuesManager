import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { Queue } from "../../src/domain/queue_repository.js";
import { startWebServer, type WebServer } from "../../src/web/server.js";

// E2E de UI real: servidor HTTP real (startWebServer, caminho dev via tsx) + Chromium headless
// navegando a SPA. Dados semeados pela CLI real; timestamps ajustados no disco quando a
// ordenação/idade precisa ser determinística.

const bin = resolve("bin/issues");
const cli = (args: string[], root: string): string =>
  execFileSync(bin, args, { env: { ...process.env, ISSUES_ROOT: root }, encoding: "utf8" });

const ensureProject = (root: string, project: string): void => {
  cli(["project", "create", "--name", project, "--repo", root], root); // upsert: repetir é inofensivo
};
const createIssue = (root: string, o: { title: string; project: string; type: string; action?: string; problem?: string }): string => {
  ensureProject(root, o.project);
  return JSON.parse(cli(["create", "--title", o.title, "--project", o.project, "--type", o.type,
    "--action", o.action ?? "QA", "--problem", o.problem ?? "problema", "--human"], root)).id as string;
};

// Um Chromium por arquivo; contexto+página por teste (higiene de processos).
let browser: Browser;
before(async () => { browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] }); });
after(async () => { await browser.close(); });

// Harness: ISSUES_ROOT isolado, porta efêmera, servidor+contexto fechados sempre (mesmo em falha).
async function withUI(seed: (root: string) => void, run: (page: Page, url: string, root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "issues-e2e-ui-"));
  seed(root);
  const web: WebServer = await startWebServer(0, root);
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();
  try {
    await run(page, web.url, root);
  } finally {
    await context.close();
    await new Promise<void>((res, rej) => web.server.close((e) => (e ? rej(e) : res())));
  }
}

// --- semeadura via CLI real -------------------------------------------------
function claimed(root: string, o: { title: string; project: string; type: string; action?: string }): string {
  const id = createIssue(root, o);
  cli(["next", "--id", id, "--agent", "pi"], root); // OPEN -> CLAIMED (owner pi)
  return id;
}

// awaiting() semeia Issues QA (action default): o gate de conclusão exige o Artefato .md antes de AWAITING.
const qaArtifactFile = join(mkdtempSync(join(tmpdir(), "issues-e2e-ui-qa-")), "qa.md");
writeFileSync(qaArtifactFile, "# QA ok");

function awaiting(root: string, o: { title: string; project: string; type: string }): string {
  const id = claimed(root, o);
  cli(["artifact", "--id", id, "--file", qaArtifactFile], root);
  cli(["status", "--id", id, "--agent", "pi", "--status", "AWAITING", "--comment", "evidência: relatório"], root);
  return id;
}

function closed(root: string, o: { title: string; project: string; type: string }): string {
  const id = awaiting(root, o);
  cli(["decide", "--id", id, "--human", "--status", "CLOSED", "--comment", "aceito", "--reason", "concluido"], root);
  return id;
}

// Localiza o JSON da Issue no disco e reescreve created_at/status_changed_at (determinismo de ordem/idade).
function findIssueFile(root: string, id: string): string {
  const projects = join(root, "projects");
  for (const project of readdirSync(projects)) {
    for (const folder of ["open", "claimed", "awaiting", "closed"]) {
      const candidate = join(projects, project, folder, `${id}.json`);
      try { readFileSync(candidate); return candidate; } catch { /* próxima pasta */ }
    }
  }
  throw new Error(`Issue file not found: ${id}`);
}
function backdate(root: string, id: string, createdIso: string, changedIso = createdIso): void {
  const file = findIssueFile(root, id);
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.created_at = createdIso;
  data.status_changed_at = changedIso;
  writeFileSync(file, JSON.stringify(data, null, 2));
}
const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();

// Quadro completo com uma Issue por coluna (projetos distintos p/ o `next` claimar o alvo certo).
function fullBoard(root: string): { open1: string; open2: string; claimedId: string } {
  const open1 = createIssue(root, { title: "Login quebrado", project: "web", type: "Fix", action: "Implement" });
  const open2 = createIssue(root, { title: "Cadastro novo", project: "web", type: "Feat", action: "Planning" });
  const claimedId = claimed(root, { title: "Refatorar api", project: "api", type: "Refactor" });
  awaiting(root, { title: "Deploy pendente", project: "ops", type: "Fix" });
  closed(root, { title: "Bug antigo", project: "legacy", type: "Fix" });
  backdate(root, open1, daysAgo(5)); // mais antigo e "há 5 dias" no Status
  backdate(root, open2, daysAgo(1)); // mais novo
  return { open1, open2, claimedId };
}

// =====================================================================================
// Item 1 — Quadro: colunas, contagem, ordem (mais antigos primeiro)
// =====================================================================================
test("UI-01: quadro mostra as 4 colunas com contagem por Status e os cards mais antigos primeiro", async () =>
  withUI(fullBoard, async (page, url) => {
    await page.goto(`${url}/`);
    await page.getByRole("heading", { name: "Issues", exact: true }).waitFor();
    const columns = page.locator(".board .column");
    await assert.deepEqual(await columns.locator("h2").evaluateAll((hs) => hs.map((h) => h.id)),
      ["OPEN", "CLAIMED", "AWAITING", "CLOSED"]);
    assert.equal(await page.locator(".column.status-OPEN h2 small").textContent(), "2");
    assert.equal(await page.locator(".column.status-CLAIMED h2 small").textContent(), "1");
    assert.equal(await page.locator(".column.status-CLOSED h2 small").textContent(), "1");
    // Ordem dentro da coluna OPEN: o backdated (5 dias) vem antes do recente (1 dia).
    const openTitles = await page.locator(".column.status-OPEN .card strong").allInnerTexts();
    assert.deepEqual(openTitles, ["Login quebrado", "Cadastro novo"]);
  }));

// =====================================================================================
// Item 2 — Card (título, projeto, tipo, action, owner, tempo no Status) + clique abre detalhe
// =====================================================================================
test("UI-02: card exibe título/projeto/tipo/action/owner/tempo no Status e o clique abre o detalhe", async () =>
  withUI(fullBoard, async (page, url) => {
    await page.goto(`${url}/`);
    const openCard = page.locator(".column.status-OPEN .card").first();
    await openCard.waitFor();
    assert.match(await openCard.locator("strong").innerText(), /Login quebrado/);
    assert.match(await openCard.innerText(), /web · Fix · Implement/); // projeto · tipo · action
    assert.match(await openCard.locator("time").innerText(), /há 5 dias/); // tempo no Status (backdated)
    // owner aparece no card CLAIMED (owner pi), não no OPEN.
    assert.match(await page.locator(".column.status-CLAIMED .card .owner").innerText(), /pi/);
    await openCard.click();
    await page.getByRole("heading", { name: "Login quebrado" }).waitFor();
    assert.match(page.url(), /\/issues\//);
  }));

// =====================================================================================
// Item 3 — Filtros (título/projeto/tipo), limpar, Atualizar + hora da última leitura
// =====================================================================================
test("UI-03: filtra por título/projeto/tipo, limpa filtros e mostra Atualizar com a hora da última leitura", async () =>
  withUI(fullBoard, async (page, url) => {
    await page.goto(`${url}/`);
    await page.locator("#title").waitFor();
    assert.match(await page.locator(".toolbar output").innerText(), /Atualizado às \d/); // hora da última leitura

    await page.fill("#title", "Login");
    assert.deepEqual(await page.locator(".card strong").allInnerTexts(), ["Login quebrado"]);

    await page.fill("#title", "");
    await page.selectOption("#project", "api");
    assert.deepEqual(await page.locator(".card strong").allInnerTexts(), ["Refatorar api"]);

    await page.locator("#clear").click(); // limpar filtros
    assert.equal(await page.locator("#title").inputValue(), "");
    assert.ok((await page.locator(".card").count()) >= 4);

    await page.selectOption("#type", "Feat"); // filtro por tipo
    assert.deepEqual(await page.locator(".card strong").allInnerTexts(), ["Cadastro novo"]);

    await page.locator("#clear").click();
    await page.locator("#refresh").click(); // botão Atualizar
    assert.match(await page.locator(".toolbar output").innerText(), /Atualizado às \d/);
  }));

// =====================================================================================
// Item 4 — Detalhe: metadados, problema, AC, tags (editor), thread e ações por Status.
// =====================================================================================
test("UI-04a: detalhe da Issue CLAIMED mostra metadados, problema, AC, editor de tags, thread e só Reset como ação", async () =>
  withUI((root) => { claimed(root, { title: "Detalhe claimed", project: "api", type: "Refactor" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "api", "claimed"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("heading", { name: "Detalhe claimed" }).waitFor();
      assert.match(await page.locator(".detail .meta").first().innerText(), /Projeto: api · Tipo: Refactor · Action: QA/);
      assert.match(await page.locator(".detail").innerText(), /Problema/);
      assert.match(await page.locator(".detail").innerText(), /Critérios de aceite/);
      await assert.ok(await page.getByText("Classificar Issue").count()); // editor de tags
      assert.match(await page.locator(".thread").innerText(), /Issue created/); // thread append-only
      // Ações válidas em CLAIMED: Reset; nunca Decidir/Fechar.
      await assert.ok(await page.getByRole("button", { name: "Fazer Reset" }).count());
      assert.equal(await page.getByRole("button", { name: "Devolver para OPEN" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Fechar Issue" }).count(), 0);
    }));

test("UI-04b: detalhe da Issue AWAITING oferece Decidir (Devolver/Fechar) e mostra a evidência na thread", async () =>
  withUI((root) => { awaiting(root, { title: "Detalhe awaiting", project: "ops", type: "Fix" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "ops", "awaiting"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("heading", { name: "Detalhe awaiting" }).waitFor();
      await assert.ok(await page.getByRole("button", { name: "Devolver para OPEN" }).count()); // Decidir só em AWAITING
      await assert.ok(await page.getByRole("button", { name: "Fechar Issue" }).count());
      assert.equal(await page.getByRole("button", { name: "Fazer Reset" }).count(), 0);
      assert.match(await page.locator(".thread").innerText(), /evidência: relatório/); // evidência obrigatória visível
    }));

test("UI-04c: detalhe da Issue CLOSED mostra o motivo de fechamento e não oferece ações", async () =>
  withUI((root) => { closed(root, { title: "Detalhe closed", project: "legacy", type: "Fix" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "legacy", "closed"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("heading", { name: "Detalhe closed" }).waitFor();
      assert.match(await page.locator(".detail").innerText(), /Motivo de fechamento/);
      assert.equal(await page.locator(".actionbar").count(), 0); // Issue imutável: sem barra de ações
    }));

// =====================================================================================
// Item 5 — Voltar ao quadro preservando filtros
// =====================================================================================
test("UI-05: voltar ao quadro preserva os filtros aplicados na sessão", async () =>
  withUI(fullBoard, async (page, url) => {
    await page.goto(`${url}/`);
    await page.fill("#title", "Login");
    await page.locator(".card").first().click(); // abre detalhe
    await page.getByRole("heading", { name: "Login quebrado" }).waitFor();
    await page.getByRole("link", { name: "← Voltar ao quadro" }).click();
    await page.locator("#title").waitFor();
    assert.equal(await page.locator("#title").inputValue(), "Login"); // filtro preservado
    assert.deepEqual(await page.locator(".card strong").allInnerTexts(), ["Login quebrado"]);
  }));

// =====================================================================================
// Item 6 — Criar Issue com validação prévia (inclui a Action)
// =====================================================================================
test("UI-06: formulário de nova Issue bloqueia submit inválido e, quando válido, abre o detalhe", async () =>
  withUI((root) => { ensureProject(root, "web"); }, async (page, url) => {
    await page.goto(`${url}/issues/new`);
    await page.getByRole("heading", { name: "Nova Issue" }).waitFor();
    await page.getByRole("button", { name: "Salvar Issue" }).click(); // submit sem campos obrigatórios
    await page.locator(".error-summary").waitFor();
    assert.ok((await page.locator(".field-error").count()) >= 4); // título/projeto/tipo/action/problema
    assert.match(page.url(), /\/issues\/new$/); // não navegou

    await page.fill('input[name="title"]', "Nova via UI");
    await page.fill('input[name="project"]', "web");
    await page.selectOption('select[name="type"]', "Feat");
    await page.selectOption('select[name="action"]', "Planning");
    await page.fill('textarea[name="problem"]', "algo quebrou");
    await page.getByRole("button", { name: "Salvar Issue" }).click();
    await page.getByRole("heading", { name: "Nova via UI" }).waitFor(); // sucesso abre o detalhe
    assert.match(await page.locator(".feedback-success").innerText(), /Issue criada/);
    assert.match(page.url(), /\/issues\/[0-9a-f-]{36}$/);
  }));

// =====================================================================================
// Item 7 — Conflito de save -> 409: preserva rascunho e oferece Atualizar (mock via page.route)
// =====================================================================================
test("UI-07: 409 no save preserva o rascunho e oferece Atualizar (mock via page.route)", async () =>
  withUI((root) => { claimed(root, { title: "Conflito", project: "api", type: "Refactor" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "api", "claimed"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("button", { name: "Fazer Reset" }).click();
      await page.fill('textarea[name="comment"]', "rascunho que não pode sumir");
      await page.route("**/reset", (route) =>
        route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "stale" }) }));
      await page.locator("#action-form").getByRole("button", { name: "Fazer Reset" }).click();
      await page.locator(".feedback-conflict").waitFor();
      assert.match(await page.locator(".feedback-conflict").innerText(), /mudou desde a última atualização/);
      assert.equal(await page.locator('textarea[name="comment"]').inputValue(), "rascunho que não pode sumir"); // rascunho preservado
      await assert.ok(await page.getByRole("button", { name: "Atualizar Issue" }).count()); // oferece Atualizar
    }));

// =====================================================================================
// Item 8 — Estados explícitos: loading, vazio, erro de leitura, sucesso
// =====================================================================================
test("UI-08a: estado de loading é exibido enquanto a leitura do quadro está pendente", async () =>
  withUI(() => { /* vazio */ }, async (page, url) => {
    await page.route("**/api/issues", async (route) => {
      await new Promise((r) => setTimeout(r, 400)); // segura a resposta para o loading ficar visível
      route.continue();
    });
    await page.goto(`${url}/`);
    await page.locator(".loading").waitFor();
    assert.match(await page.locator(".loading").innerText(), /Carregando quadro/);
  }));

test("UI-08b: estado vazio mostra as colunas sem cards (Nenhuma Issue)", async () =>
  withUI(() => { /* nenhuma Issue */ }, async (page, url) => {
    await page.goto(`${url}/`);
    await page.getByRole("heading", { name: "Issues", exact: true }).waitFor();
    assert.equal(await page.locator(".card").count(), 0);
    assert.match(await page.locator(".column.status-OPEN").innerText(), /Nenhuma Issue OPEN/);
    assert.equal(await page.locator(".column.status-OPEN h2 small").textContent(), "0");
  }));

test("UI-08c: erro de leitura da API mostra a mensagem de falha e botão de tentar novamente", async () =>
  withUI(() => { /* vazio */ }, async (page, url) => {
    await page.route("**/api/issues", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
    await page.goto(`${url}/`);
    await page.locator(".error").waitFor();
    assert.match(await page.locator(".error").innerText(), /Não foi possível ler as Issues/);
    await assert.ok(await page.getByRole("button", { name: "Tentar novamente" }).count());
  }));

test("UI-08d: estado de sucesso mostra feedback após uma mutação bem-sucedida (comentário)", async () =>
  withUI((root) => { claimed(root, { title: "Sucesso", project: "api", type: "Refactor" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "api", "claimed"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("button", { name: "+ Comentar" }).click();
      await page.fill('textarea[name="comment"]', "andamento");
      await page.getByRole("button", { name: "Enviar comentário" }).click();
      await page.locator(".feedback-success").waitFor();
      assert.match(await page.locator(".feedback-success").innerText(), /Comentário adicionado/);
    }));

// =====================================================================================
// Item 9 — Confirmação só em fechamentos irreversíveis
// =====================================================================================
test("UI-09a: fechar Issue exige confirmação explícita antes de efetivar (irreversível)", async () =>
  withUI((root) => { createIssue(root, { title: "Fechar OPEN", project: "web", type: "Fix" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "web", "open"))[0].replace(".json", "");
      new Queue(root).artifacts.writeText("web", { issueId: id, type: "document" }, "# QA concluído");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("button", { name: "Fechar Issue" }).click(); // abre painel
      await page.selectOption('select[name="closed_reason"]', "concluido");
      await page.locator("#action-form").getByRole("button", { name: "Fechar Issue" }).click(); // submit -> pede confirmação
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /não poderá ser desfeita/);
      assert.equal(await page.locator(".badge.status-CLOSED").count(), 0); // ainda não fechou
      await page.getByRole("button", { name: "Fechar definitivamente" }).click();
      await page.locator(".badge.status-CLOSED").waitFor(); // só então fecha
    }));

test("UI-09b: ação reversível (Reset) não pede confirmação — efetiva direto", async () =>
  withUI((root) => { claimed(root, { title: "Reset direto", project: "api", type: "Refactor" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "api", "claimed"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("button", { name: "Fazer Reset" }).click();
      await page.fill('textarea[name="comment"]', "liberar");
      await page.locator("#action-form").getByRole("button", { name: "Fazer Reset" }).click();
      await page.locator(".feedback-success").waitFor();
      assert.equal(await page.getByRole("alertdialog").count(), 0); // sem diálogo de confirmação
      assert.match(await page.locator(".badge").first().innerText(), /OPEN/); // efetivou o Reset
    }));

// =====================================================================================
// Item 10 — Inbox de Decisões pendentes e linhagem de Issues relacionadas
// =====================================================================================
test("UI-10a: quadro mostra o inbox de Decisões pendentes para Issues AWAITING", async () =>
  withUI((root) => { awaiting(root, { title: "Precisa decidir", project: "ops", type: "Fix" }); },
    async (page, url) => {
      await page.goto(`${url}/`);
      const badge = page.locator("#toggle-decisions");
      await badge.waitFor();
      assert.match(await badge.innerText(), /1 decisão/);
      await badge.click();
      await page.locator(".decisions-inbox").waitFor();
      assert.match(await page.locator(".decisions-inbox").innerText(), /Precisa decidir/);
    }));

test("UI-10b: detalhe mostra as Issues relacionadas com os artefatos (linhagem navegável)", async () => {
  const seeded = { implId: "" };
  await withUI((root) => {
    const designId = createIssue(root, { title: "Design da fila", project: "api", type: "Feat", action: "Design" });
    const md = join(root, "spec.md");
    writeFileSync(md, "# Spec congelada da fila");
    cli(["artifact", "--id", designId, "--file", md], root);
    seeded.implId = createIssue(root, { title: "Implementar fila", project: "api", type: "Feat", action: "Implement" });
    cli(["relate", "--id", seeded.implId, "--relates", designId], root);
  }, async (page, url) => {
    await page.goto(`${url}/issues/${seeded.implId}`);
    const related = page.locator(".box.related");
    await related.waitFor();
    assert.match(await related.locator("summary").innerText(), /Issues relacionadas \(1\)/);
    assert.match(await related.innerText(), /Design da fila/);
    assert.match(await related.innerText(), /Spec congelada da fila/); // artefato da relacionada visível
    await related.locator("a").first().click(); // navega para a relacionada
    await page.getByRole("heading", { name: "Design da fila" }).waitFor();
  });
});

// =====================================================================================
// Item 11 — Leitura estável: a expansão dos <details> sobrevive ao re-render, e um refresh
//          sem mudança no servidor não re-renderiza.
// =====================================================================================
test("UI-11a: editor de tags expandido sobrevive ao re-render de uma mudança real", async () => {
  const seeded = { id: "" };
  await withUI((root) => { seeded.id = claimed(root, { title: "Leitura estável", project: "api", type: "Refactor" }); },
    async (page, url, root) => {
      await page.goto(`${url}/issues/${seeded.id}`);
      const editor = page.locator(".tag-editor");
      await editor.locator("summary").click();
      assert.equal(await editor.evaluate((d: HTMLDetailsElement) => d.open), true);

      // Mudança REAL no servidor: é ela que atravessa o guard de refreshIssue e força o re-render.
      cli(["comment", "--id", seeded.id, "--comment", "comentário do agente", "--agent", "pi"], root);
      await page.locator("#refresh-issue").click();
      await page.locator(".thread").getByText("comentário do agente").waitFor({ state: "attached" });
      assert.equal(await editor.evaluate((d: HTMLDetailsElement) => d.open), true); // expansão sobreviveu
    });
});

test("UI-11b: Atualizar Issue sem mudança no servidor não re-renderiza o detalhe", async () => {
  const seeded = { id: "" };
  await withUI((root) => { seeded.id = claimed(root, { title: "Sem mudança", project: "api", type: "Refactor" }); },
    async (page, url, root) => {
      await page.goto(`${url}/issues/${seeded.id}`);
      const detail = page.locator(".detail");
      await detail.waitFor();
      // Marca um nó vivo do DOM: renderDetail reescreve root().innerHTML, então a marca só
      // sobrevive se o re-render NÃO ocorreu.
      const mark = (): Promise<string | undefined> => detail.evaluate((el: HTMLElement & { e2eMark?: string }) => el.e2eMark);
      await detail.evaluate((el: HTMLElement & { e2eMark?: string }) => { el.e2eMark = "vivo"; });

      // Nada mudou no servidor: as respostas chegam e o guard corta antes do render.
      await Promise.all([
        page.waitForResponse((r) => r.url().endsWith(`/api/issues/${seeded.id}/requirements`)),
        page.locator("#refresh-issue").click(),
      ]);
      await page.waitForTimeout(150); // render seria síncrono após o Promise.all do cliente; margem de folga
      assert.equal(await mark(), "vivo");

      // Controle positivo: com mudança real o mesmo nó é destruído — prova que a marca detecta re-render.
      cli(["comment", "--id", seeded.id, "--comment", "agora mudou", "--agent", "pi"], root);
      await page.locator("#refresh-issue").click();
      await page.locator(".thread").getByText("agora mudou").waitFor({ state: "attached" });
      assert.equal(await mark(), undefined);
    });
});

// `requirements set` não toca no JSON da Issue: é o único caminho em que a 2ª cláusula do
// guard de refreshIssue decide sozinha entre re-renderizar e engolir a atualização.
test("UI-11c: mudança só nos Requisitos (Issue idêntica) atravessa o guard e re-renderiza", async () => {
  const seeded = { id: "" };
  await withUI((root) => { seeded.id = claimed(root, { title: "Só requisitos", project: "api", type: "Fix", action: "Planning" }); },
    async (page, url, root) => {
      await page.goto(`${url}/issues/${seeded.id}`);
      await page.locator(".detail").waitFor();

      const file = join(root, "req.json");
      writeFileSync(file, JSON.stringify({ features: [gherkinFeature] }));
      cli(["requirements", "set", "--id", seeded.id, "--file", file], root);
      await page.locator("#refresh-issue").click();
      await page.locator("details.requirements").waitFor(); // o aviso vira o painel estruturado
      assert.match(await page.locator("details.requirements").innerText(), /Requisitos persistidos/);
    });
});

// =====================================================================================
// Item 12 — Design: diagrama renderizado, aviso sem pacote, erro de .puml inválido
// =====================================================================================
test("UI-12: diagrama PlantUML entregue no Design aparece renderizado no detalhe", async () => {
  const seeded = { id: "" };
  await withUI((root) => {
    const id = claimed(root, { title: "Com design", project: "api", type: "Fix", action: "Design" });
    const doc = join(root, "design.md");
    writeFileSync(doc, "# Spec do Design\nO parágrafo da spec.");
    cli(["design", "doc", "--issue", id, "--file", doc], root);
    const puml = join(root, "class.puml");
    writeFileSync(puml, "@startuml\nclass Pedido\nPedido --> Item\n@enduml");
    cli(["design", "add", "--issue", id, "--kind", "class", "--file", puml], root);
    seeded.id = id;
  }, async (page, url) => {
    await page.setViewportSize({ width: 1280, height: 400 }); // seção de Design abaixo da dobra
    await page.goto(`${url}/issues/${seeded.id}`);
    const design = page.locator(".box.design");
    await design.waitFor();
    assert.match(await design.innerText(), /Spec do Design/); // design.md renderizado
    assert.equal(await design.locator("figcaption").innerText(), "class");

    const img = design.locator("img");
    await img.waitFor();
    assert.match(await img.getAttribute("src") ?? "", /\/design\/class\.svg$/);
    assert.notEqual(await img.getAttribute("loading"), "lazy");
    // Carrega sem rolagem e decodifica: o <img> só decodifica se a rota devolveu SVG de verdade.
    await page.waitForFunction(() => {
      const node = document.querySelector(".box.design img") as HTMLImageElement | null;
      return !!node && node.complete && node.naturalWidth > 0;
    }, undefined, { timeout: 60000 });
    await assert.doesNotReject(img.evaluate((node: HTMLImageElement) => node.decode()));
  });
});

// Ausência nunca é silêncio (mesma regra da seção de Requisitos).
test("UI-12b: Issue Design em andamento sem pacote avisa em vez de omitir a seção", async () => {
  const seeded = { id: "" };
  await withUI((root) => {
    seeded.id = claimed(root, { title: "Design vazio", project: "api", type: "Fix", action: "Design" });
  }, async (page, url) => {
    await page.goto(`${url}/issues/${seeded.id}`);
    const warn = page.locator(".box.design .warn");
    await warn.waitFor();
    assert.match(await warn.innerText(), /Nenhum design persistido/);
    assert.equal(await page.locator(".diagrams").count(), 0);
  });
});

// .puml inválido no disco (edição à mão da fila local, ou entrega corrompida): a rota .svg
// responde 400 e o <img> viraria ícone quebrado — mudo. O erro do gate já está no pacote.
test("UI-12c: diagrama inválido mostra o erro do gate em vez de imagem quebrada", async () => {
  const seeded = { id: "" };
  await withUI((root) => {
    const id = claimed(root, { title: "Design quebrado", project: "api", type: "Fix", action: "Design" });
    const doc = join(root, "design.md");
    writeFileSync(doc, "# Spec com diagrama quebrado");
    cli(["design", "doc", "--issue", id, "--file", doc], root);
    cli(["design", "changed", "--issue", id, "--value", "true"], root); // mudança de arquitetura: o gate valida os .puml
    // Direto no repositório: `issues design add` valida e recusaria este fonte.
    new Queue(root).artifacts.writeText("api", { issueId: id, type: "uml", name: "class.puml" }, "@startuml\nisto !! quebrado\n@enduml");
    seeded.id = id;
  }, async (page, url) => {
    await page.goto(`${url}/issues/${seeded.id}`);
    const design = page.locator(".box.design");
    await design.waitFor();
    const warn = design.locator(".diagrams .warn"); // o erro do diagrama, isolado do aviso de decisão de arquitetura
    await warn.waitFor();
    assert.match(await warn.innerText(), /class\.puml inválido/);
    assert.match(await warn.innerText(), /Syntax Error/); // a mensagem real do engine
    assert.equal(await design.locator("img").count(), 0); // nada de <img> que daria 400
  });
});

// Atalho "Changed?=false": diagramas são dispensados por design; o painel não pode contradizer
// o gate exibindo "Spec sem diagrama" logo abaixo de "atalho ao plano, sem diagramas".
test("UI-12d: Design com architecture_changed=false não avisa 'Spec sem diagrama'", async () => {
  const seeded = { id: "" };
  await withUI((root) => {
    const id = claimed(root, { title: "Design atalho", project: "api", type: "Fix", action: "Design" });
    const doc = join(root, "design.md");
    writeFileSync(doc, "# Spec do atalho\nSem mudança de arquitetura.");
    cli(["design", "doc", "--issue", id, "--file", doc], root);
    cli(["design", "changed", "--issue", id, "--value", "false"], root); // atalho ao plano, sem diagramas
    seeded.id = id;
  }, async (page, url) => {
    await page.goto(`${url}/issues/${seeded.id}`);
    const design = page.locator(".box.design");
    await design.waitFor();
    const text = await design.innerText();
    assert.match(text, /inalterada — atalho ao plano/); // a decisão aparece
    assert.doesNotMatch(text, /Spec sem diagrama/); // e não a contradiz
    assert.equal(await design.locator(".diagrams").count(), 0);
  });
});

const gherkinFeature = [
  "Feature: Requisitos persistidos",
  "  Como um admin",
  "  Eu quero poder ver requisitos",
  "  Para que eu confirme o escopo",
  "",
  "  Scenario: Requisito visível",
  "    Given a Issue tem requisitos",
  "    When abro o detalhe",
  "    Then vejo a Feature",
].join("\n");

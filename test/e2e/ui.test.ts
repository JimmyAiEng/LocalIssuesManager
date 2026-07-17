import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { startWebServer, type WebServer } from "../../src/web/server.js";

// E2E de UI real: servidor HTTP real (startWebServer, caminho dev via tsx) + Chromium headless
// navegando a SPA. Cobre PRD §8 (requisitos de UI). Dados semeados pela CLI real; timestamps
// ajustados no disco quando a ordenação/idade precisa ser determinística.

const bin = resolve("bin/issues");
const cli = (args: string[], root: string): string =>
  execFileSync(bin, args, { env: { ...process.env, ISSUES_ROOT: root }, encoding: "utf8" });
// classify:false semeia Issue sem risk/complexity — o estado que o guard de domínio (Issue.addTicket)
// e seu espelho no cliente (ticketCreationGate) existem para barrar.
const createIssue = (root: string, o: { title: string; project: string; type: string; problem?: string; classify?: boolean }): string =>
  JSON.parse(cli(["create", "--title", o.title, "--project", o.project, "--type", o.type,
    "--problem", o.problem ?? "problema",
    ...(o.classify === false ? [] : ["--complexity", "BAIXA", "--risk", "BAIXO"]), "--human"], root)).id as string; // classificada: Ticket exige risk+complexity

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
function claimed(root: string, o: { title: string; project: string; type: string; classify?: boolean }): string {
  const id = createIssue(root, o);
  cli(["next", "--agent", "pi", "--project", o.project], root); // OPEN -> CLAIMED (owner pi)
  return id;
}

function ongoing(root: string, o: { title: string; project: string; type: string }): string {
  const id = claimed(root, o);
  cli(["ticket", "create", "--issue", id, "--type", "Implement",
    "--objective", "Implementar fatia", "--task", "codar", "--acceptance-criteria", "passa", "--agent", "pi"], root);
  return id; // 1º Ticket -> Issue ON-GOING
}

// IA conduz até AWAITING pela CLI (Ticket + Confirmation), como em requirements_web.
function awaiting(root: string, o: { title: string; project: string; type: string }): string {
  const id = ongoing(root, o);
  const tid = JSON.parse(cli(["get", "--id", id], root)).tickets[0].id as string;
  cli(["ticket", "claim", "--issue", id, "--id", tid, "--agent", "pi"], root);
  cli(["ticket", "status", "--issue", id, "--id", tid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "feito", "--reason", "concluido", "--last"], root);
  const cid = JSON.parse(cli(["get", "--id", id], root)).tickets
    .find((t: { type: string }) => t.type === "Confirmation").id as string;
  cli(["ticket", "claim", "--issue", id, "--id", cid, "--agent", "pi"], root);
  cli(["ticket", "status", "--issue", id, "--id", cid, "--agent", "pi",
    "--status", "CLOSED", "--comment", "verificado", "--reason", "concluido"], root);
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
    for (const folder of ["open", "claimed", "ongoing", "awaiting", "closed"]) {
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
  const open1 = createIssue(root, { title: "Login quebrado", project: "web", type: "Fix" });
  const open2 = createIssue(root, { title: "Cadastro novo", project: "web", type: "Feat" });
  const claimedId = claimed(root, { title: "Refatorar api", project: "api", type: "Refactor" });
  ongoing(root, { title: "Spike pesquisa", project: "lab", type: "Research" });
  awaiting(root, { title: "Deploy pendente", project: "ops", type: "Fix" });
  closed(root, { title: "Bug antigo", project: "legacy", type: "Fix" });
  backdate(root, open1, daysAgo(5)); // mais antigo e "há 5 dias" no Status
  backdate(root, open2, daysAgo(1)); // mais novo
  return { open1, open2, claimedId };
}

// =====================================================================================
// Item 1 — Quadro: colunas, contagem, ordem (mais antigos primeiro)
// =====================================================================================
test("UI-01: quadro mostra as 5 colunas com contagem por Status e os cards mais antigos primeiro", async () =>
  withUI(fullBoard, async (page, url) => {
    await page.goto(`${url}/`);
    await page.getByRole("heading", { name: "Issues", exact: true }).waitFor();
    const columns = page.locator(".board .column");
    await assert.deepEqual(await columns.locator("h2").evaluateAll((hs) => hs.map((h) => h.id)),
      ["OPEN", "CLAIMED", "ON-GOING", "AWAITING", "CLOSED"]);
    assert.equal(await page.locator(".column.status-OPEN h2 small").textContent(), "2");
    assert.equal(await page.locator(".column.status-CLAIMED h2 small").textContent(), "1");
    assert.equal(await page.locator(".column.status-CLOSED h2 small").textContent(), "1");
    // Ordem dentro da coluna OPEN: o backdated (5 dias) vem antes do recente (1 dia).
    const openTitles = await page.locator(".column.status-OPEN .card strong").allInnerTexts();
    assert.deepEqual(openTitles, ["Login quebrado", "Cadastro novo"]);
  }));

// =====================================================================================
// Item 2 — Card (título, projeto, tipo, owner, tempo no Status) + clique abre detalhe
// =====================================================================================
test("UI-02: card exibe título/projeto/tipo/owner/tempo no Status e o clique abre o detalhe", async () =>
  withUI(fullBoard, async (page, url) => {
    await page.goto(`${url}/`);
    const openCard = page.locator(".column.status-OPEN .card").first();
    await openCard.waitFor();
    assert.match(await openCard.locator("strong").innerText(), /Login quebrado/);
    assert.match(await openCard.innerText(), /web · Fix/); // projeto · tipo
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
    assert.ok((await page.locator(".card").count()) >= 5);

    await page.selectOption("#type", "Feat"); // filtro por tipo
    assert.deepEqual(await page.locator(".card strong").allInnerTexts(), ["Cadastro novo"]);

    await page.locator("#clear").click();
    await page.locator("#refresh").click(); // botão Atualizar
    assert.match(await page.locator(".toolbar output").innerText(), /Atualizado às \d/);
  }));

// =====================================================================================
// Item 4 — Detalhe: metadados, problema, AC, tags (editor), thread, motivo de fechamento,
//          lista de Tickets e ações humanas válidas por Status.
// =====================================================================================
test("UI-04a: detalhe da Issue CLAIMED mostra metadados, problema, AC, editor de tags, thread e só Reset como ação", async () =>
  withUI((root) => { claimed(root, { title: "Detalhe claimed", project: "api", type: "Refactor" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "api", "claimed"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("heading", { name: "Detalhe claimed" }).waitFor();
      assert.match(await page.locator(".detail .meta").first().innerText(), /Projeto: api · Tipo: Refactor/);
      assert.match(await page.locator(".detail").innerText(), /Problema/);
      assert.match(await page.locator(".detail").innerText(), /Critérios de aceite/);
      await assert.ok(await page.getByText("Classificar Issue").count()); // editor de tags
      assert.match(await page.locator(".thread").innerText(), /Issue created/); // thread append-only
      // Ações válidas em CLAIMED: Reset; nunca Decidir/Fechar.
      await assert.ok(await page.getByRole("button", { name: "Fazer Reset" }).count());
      assert.equal(await page.getByRole("button", { name: "Devolver para OPEN" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Fechar Issue" }).count(), 0);
    }));

test("UI-04b: detalhe da Issue AWAITING oferece Decidir (Devolver/Fechar) e lista os Tickets", async () =>
  withUI((root) => { awaiting(root, { title: "Detalhe awaiting", project: "ops", type: "Fix" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "ops", "awaiting"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("heading", { name: "Detalhe awaiting" }).waitFor();
      await assert.ok(await page.getByRole("button", { name: "Devolver para OPEN" }).count()); // Decidir só em AWAITING
      await assert.ok(await page.getByRole("button", { name: "Fechar Issue" }).count());
      assert.equal(await page.getByRole("button", { name: "Fazer Reset" }).count(), 0);
      // Lista de Tickets do agregado.
      assert.match(await page.locator(".tickets").innerText(), /Implementar fatia/);
      assert.match(await page.locator(".tickets .ticket-type").first().innerText(), /Implement/);
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
// ponytail: rolagem não asserida — página de teste é curta (sem overflow), scrollTo(0,0) sempre;
// asserção de scroll seria flaky. Filtros cobrem "preservar sessão".

// =====================================================================================
// Item 6 — Criar Issue com validação prévia
// =====================================================================================
test("UI-06: formulário de nova Issue bloqueia submit inválido e, quando válido, abre o detalhe", async () =>
  withUI(() => { /* quadro vazio */ }, async (page, url) => {
    await page.goto(`${url}/issues/new`);
    await page.getByRole("heading", { name: "Nova Issue" }).waitFor();
    await page.getByRole("button", { name: "Salvar Issue" }).click(); // submit sem campos obrigatórios
    await page.locator(".error-summary").waitFor();
    assert.ok((await page.locator(".field-error").count()) >= 3); // título/projeto/tipo/problema
    assert.match(page.url(), /\/issues\/new$/); // não navegou

    await page.fill('input[name="title"]', "Nova via UI");
    await page.fill('input[name="project"]', "web");
    await page.selectOption('select[name="type"]', "Feat");
    await page.fill('textarea[name="problem"]', "algo quebrou");
    await page.getByRole("button", { name: "Salvar Issue" }).click();
    await page.getByRole("heading", { name: "Nova via UI" }).waitFor(); // sucesso abre o detalhe
    assert.match(await page.locator(".feedback-success").innerText(), /Issue criada/);
    assert.match(page.url(), /\/issues\/[0-9a-f-]{36}$/);
  }));

// =====================================================================================
// Item 7 — Conflito de save -> 409: preserva rascunho e oferece Atualizar
// CAMINHO: page.route() (mock 409). O client (http.js/mutations.js) NÃO envia revisão/If-Match;
// o ConflictError (queue_repository #guard) captura baseRevision do disco a CADA request no
// servidor, logo staleness do browser jamais dispara 409 — cenário inalcançável de forma
// determinística. O mock intercepta o POST e responde 409, exercitando de fato a UI de conflito.
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
// Item 10 — Gates/enforcement do workflow: stepper de fases, bloqueio de Ticket sem
//          classificação (ticketCreationGate) e inbox de Decisões.
// =====================================================================================
test("UI-10a: detalhe mostra o stepper de fases (Planning→Deploy)", async () =>
  withUI((root) => { ongoing(root, { title: "Stepper", project: "lab", type: "Research" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "lab", "ongoing"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.locator(".detail-stepper").waitFor();
      assert.deepEqual(await page.locator(".detail-stepper .dstep-label").allInnerTexts(),
        ["Planning", "Design", "Implement", "QA", "Deploy"]);
    }));

// O gate do cliente é espelho do guard de Issue.addTicket: exige risk+complexity, nada além.
// Classificar SÓ esses dois libera — human_need é override opcional, não requisito.
test("UI-10b: criação do 1º Ticket é bloqueada sem classificação e liberada com risk+complexity (ticketCreationGate)", async () =>
  withUI((root) => { claimed(root, { title: "Gate", project: "api", type: "Refactor", classify: false }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "api", "claimed"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.locator(".ticket-gate--blocked").waitFor();
      assert.match(await page.locator(".ticket-gate--blocked").innerText(), /Classifique a Issue \(Complexidade, Risco\)/);
      assert.equal(await page.getByRole("button", { name: "+ Novo Ticket" }).count(), 0); // bloqueado

      const gate = page.locator(".ticket-gate--blocked");
      await gate.locator('select[name="complexity"]').selectOption("MEDIA");
      await gate.locator('select[name="risk"]').selectOption("BAIXO");
      await gate.getByRole("button", { name: "Salvar classificação" }).click();
      await page.getByRole("button", { name: "+ Novo Ticket" }).waitFor(); // liberado sem human_need
    }));

// A autonomia é derivada pelo domínio e apenas exibida: o form não oferece escolha e o chip
// que aparece no Ticket criado vem do servidor (Refactor + risk BAIXO + complexity BAIXA → AFK).
test("UI-10d: form de Ticket não escolhe autonomia; o Ticket criado mostra a derivada", async () =>
  withUI((root) => { claimed(root, { title: "Derivada", project: "api", type: "Refactor" }); },
    async (page, url, root) => {
      const id = readdirSync(join(root, "projects", "api", "claimed"))[0].replace(".json", "");
      await page.goto(`${url}/issues/${id}`);
      await page.getByRole("button", { name: "+ Novo Ticket" }).click();
      const form = page.locator("#ticket-create-form");
      await form.waitFor();
      assert.equal(await form.locator('select[name="human_need"]').count(), 0); // a caneta não é do usuário

      await form.locator('select[name="type"]').selectOption("Planning");
      await form.locator('textarea[name="objective"]').fill("Alinhar problema");
      await form.locator('textarea[name="task"]').fill("levantar requisitos");
      await form.locator('textarea[name="acceptance_criteria"]').fill("requisitos registrados");
      await form.getByRole("button", { name: "Criar Ticket" }).click();

      const ticket = page.locator(".ticket").first();
      await ticket.waitFor();
      assert.match(await ticket.locator(".tags").innerText(), /Humano: AFK/); // derivada do servidor, sem código novo
      assert.equal(await ticket.locator('.tag-editor select[name="human_need"]').count(), 0); // tagTicket rejeita: não oferecer
    }));

test("UI-10c: quadro mostra o inbox de Decisões pendentes para Issues/Tickets AWAITING", async () =>
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

// =====================================================================================
// Item 11 — Leitura estável: a expansão dos <details> sobrevive ao re-render, e um refresh
//          sem mudança no servidor não re-renderiza. Regressão do fechamento automático da
//          Thread (o poll de 10s chama o mesmo refreshIssue() do botão "Atualizar Issue",
//          logo o botão exercita o defeito sem esperar o tick).
// =====================================================================================

// Issue ON-GOING cujo Ticket tem Artefato: os dois <details> do card em um só cenário.
function ongoingWithArtifact(root: string, title: string, project: string): { id: string; ticketId: string } {
  const id = ongoing(root, { title, project, type: "Refactor" });
  const ticketId = JSON.parse(cli(["get", "--id", id], root)).tickets[0].id as string;
  const file = join(root, `${project}-artifact.md`);
  writeFileSync(file, "# Artefato do Ticket\n");
  cli(["ticket", "artifact", "--issue", id, "--id", ticketId, "--file", file], root);
  return { id, ticketId };
}

test("UI-11a: Thread e Artefato do Ticket expandidos sobrevivem ao re-render de uma mudança real", async () => {
  const seeded = { id: "", ticketId: "" };
  await withUI((root) => { Object.assign(seeded, ongoingWithArtifact(root, "Leitura estável", "api")); },
    async (page, url, root) => {
      await page.goto(`${url}/issues/${seeded.id}`);
      const thread = page.locator(".ticket-thread");
      const artifact = page.locator(".ticket-artifact");
      await thread.locator("summary").click();
      await artifact.locator("summary").click();
      assert.equal(await thread.evaluate((d: HTMLDetailsElement) => d.open), true);
      assert.equal(await artifact.evaluate((d: HTMLDetailsElement) => d.open), true);

      // Mudança REAL no servidor: é ela que atravessa o guard de refreshIssue e força o re-render.
      cli(["ticket", "comment", "--issue", seeded.id, "--id", seeded.ticketId,
        "--comment", "comentário do agente", "--agent", "pi"], root);
      await page.locator("#refresh-issue").click();

      // As duas asserções juntas: o re-render de fato aconteceu (comentário novo no DOM)
      // E a expansão sobreviveu a ele. Sem a primeira, a segunda passaria por acidente.
      // "attached" e não "visible": visibilidade dependeria do <details> aberto — o que é a
      // segunda asserção, e confundir as duas mascararia qual delas quebrou.
      await thread.getByText("comentário do agente").waitFor({ state: "attached" });
      assert.equal(await thread.evaluate((d: HTMLDetailsElement) => d.open), true);
      assert.equal(await artifact.evaluate((d: HTMLDetailsElement) => d.open), true);

      // O inverso também precisa colar: fechar é preferência tanto quanto abrir, e um
      // re-render não pode reabrir o que o usuário fechou.
      await artifact.locator("summary").click();
      cli(["ticket", "comment", "--issue", seeded.id, "--id", seeded.ticketId,
        "--comment", "segundo comentário", "--agent", "pi"], root);
      await page.locator("#refresh-issue").click();
      await thread.getByText("segundo comentário").waitFor({ state: "attached" });
      assert.equal(await artifact.evaluate((d: HTMLDetailsElement) => d.open), false);
      assert.equal(await thread.evaluate((d: HTMLDetailsElement) => d.open), true);
    });
});

test("UI-11b: Atualizar Issue sem mudança no servidor não re-renderiza o detalhe", async () => {
  const seeded = { id: "", ticketId: "" };
  await withUI((root) => { Object.assign(seeded, ongoingWithArtifact(root, "Sem mudança", "api")); },
    async (page, url, root) => {
      await page.goto(`${url}/issues/${seeded.id}`);
      const thread = page.locator(".ticket-thread");
      await thread.waitFor();
      // Marca um nó vivo do DOM: renderDetail reescreve root().innerHTML, então a marca só
      // sobrevive se o re-render NÃO ocorreu.
      const mark = (): Promise<string | undefined> => thread.evaluate((el: HTMLElement & { e2eMark?: string }) => el.e2eMark);
      await thread.evaluate((el: HTMLElement & { e2eMark?: string }) => { el.e2eMark = "vivo"; });

      // Nada mudou no servidor: as respostas chegam e o guard corta antes do render.
      await Promise.all([
        page.waitForResponse((r) => r.url().endsWith(`/api/issues/${seeded.id}/requirements`)),
        page.locator("#refresh-issue").click(),
      ]);
      await page.waitForTimeout(150); // render seria síncrono após o Promise.all do cliente; margem de folga
      assert.equal(await mark(), "vivo");

      // Controle positivo: com mudança real o mesmo nó é destruído — prova que a marca detecta re-render.
      cli(["ticket", "comment", "--issue", seeded.id, "--id", seeded.ticketId,
        "--comment", "agora mudou", "--agent", "pi"], root);
      await page.locator("#refresh-issue").click();
      await thread.getByText("agora mudou").waitFor({ state: "attached" }); // a Thread está fechada aqui
      assert.equal(await mark(), undefined);
    });
});

// `requirements set` não toca no JSON da Issue: é o único caminho em que a 2ª cláusula do
// guard de refreshIssue decide sozinha entre re-renderizar e engolir a atualização.
test("UI-11d: mudança só nos Requisitos (Issue idêntica) atravessa o guard e re-renderiza", async () => {
  const seeded = { id: "", ticketId: "" };
  await withUI((root) => { Object.assign(seeded, ongoingWithArtifact(root, "Só requisitos", "api")); },
    async (page, url, root) => {
      await page.goto(`${url}/issues/${seeded.id}`);
      await page.locator(".ticket-thread").waitFor();
      assert.equal(await page.locator(".requirements").count(), 0); // Issue ainda sem requisitos

      const file = join(root, "req.json");
      writeFileSync(file, JSON.stringify({ features: [gherkinFeature] }));
      cli(["requirements", "set", "--id", seeded.id, "--file", file], root);
      await page.locator("#refresh-issue").click();
      await page.locator(".requirements").waitFor();
      assert.match(await page.locator(".requirements").innerText(), /Requisitos persistidos/);
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

test("UI-11c: trocar de Issue não vaza a expansão da anterior", async () => {
  const seeded = { id: "", ticketId: "" };
  await withUI((root) => {
    Object.assign(seeded, ongoingWithArtifact(root, "Issue A", "api"));
    ongoing(root, { title: "Issue B", project: "web", type: "Refactor" });
  }, async (page, url) => {
    await page.goto(`${url}/issues/${seeded.id}`);
    const thread = page.locator(".ticket-thread");
    await thread.locator("summary").click();
    assert.equal(await thread.evaluate((d: HTMLDetailsElement) => d.open), true);

    // A -> quadro -> B -> quadro -> A, tudo por navegação da SPA (sem reload, que zeraria o state).
    await page.getByRole("link", { name: "← Voltar ao quadro" }).click();
    await page.locator(".card", { hasText: "Issue B" }).click();
    await page.getByRole("heading", { name: "Issue B" }).waitFor();
    await page.getByRole("link", { name: "← Voltar ao quadro" }).click();
    await page.locator(".card", { hasText: "Issue A" }).click();
    await page.getByRole("heading", { name: "Issue A" }).waitFor();
    assert.equal(await thread.evaluate((d: HTMLDetailsElement) => d.open), false);
  });
});

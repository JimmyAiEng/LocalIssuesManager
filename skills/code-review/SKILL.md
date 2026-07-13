---
name: code-review
description: >-
  Review interno do diff desde um ponto fixo em dois eixos — Standards e Spec —
  sem mesclar vereditos. Use sob TAG=Implement após tdd/implement; não substitui
  Issue TAG=QA.
---

# code-review (camada 2 · Implement)

Obtida só após disclosure de [`implement-phase`](../implement-phase/SKILL.md). Spec: `WORKFLOW.md` §I · decisão D11.

Adaptada de [mattpocock/skills · code-review](https://github.com/mattpocock/skills). Tracker: **issues-local**. Idioma: **pt-BR**.

## Objetivo

Revisar o diff entre `HEAD` e um **ponto fixo** (commit, branch, tag ou merge-base) em **dois eixos separados**:

- **Standards** — o código segue as convenções documentadas deste repo?
- **Spec** — o código implementa o que a Issue / Spec pediu?

Os eixos rodam em **subagentes paralelos** (quando o harness permitir) para não contaminar o contexto um do outro; depois agrega-se o relatório. **Nunca** funda nem reordena os dois conjuntos num único ranking — a separação é o ponto.

## Review interno ≠ QA

| Este skill | Issue TAG=`QA` |
|---|---|
| Dentro de Implement; standards + fidelidade à Spec da fatia | Validação multi-perspectiva em estágio próprio |
| Achados tratados ou registrados antes de `AWAITING` | Gate G3; preferível outro harness/modelo (recomendado) |
| Não aprova produto sozinho | Humano decide após QA |

Não abra Issue `QA` daqui e não trate este relatório como veredicto de QA.

## Processo

### 1. Fixar o ponto

O humano (ou [`implement`](../implement/SKILL.md)) indica o ponto fixo — SHA, branch, tag, `main`, `HEAD~n`, etc. Se ninguém indicou: use a base da branch atual (`merge-base` com a default) ou pergunte.

Capture uma vez:

- Diff: `git diff <fixo>...HEAD` (três pontos = contra merge-base)
- Commits: `git log <fixo>..HEAD --oneline`

Confirme `git rev-parse <fixo>` e diff **não** vazio. Ref inválido ou diff vazio falha **aqui**, não dentro dos subagentes.

### 2. Fonte da Spec (issues-local)

Nesta ordem:

1. Issue Implement do claim atual — `issues get --id <uuid>` (`problem`, `acceptance_criteria`, `artifacts`).
2. Path de Spec/PRD que o humano passou ou que está em `artifacts`.
3. Arquivo sob `docs/`, `specs/` alinhado ao feature/branch.
4. Se nada existir: pergunte. Se o humano disser que não há Spec, o eixo **Spec** pula e reporta “sem Spec disponível”.

Não dependa de `docs/agents/issue-tracker.md` nem de GitHub/Linear — o tracker é **issues-local**.

### 3. Fontes de Standards

Tudo no repo que documente como escrever código (`CODING_STANDARDS.md`, `CONTRIBUTING.md`, ADRs de estilo, etc.).

Além disso, o eixo Standards sempre carrega a **baseline de smells** abaixo (Fowler, *Refactoring* ch.3), mesmo sem docs no repo. Duas regras:

- **O repo manda.** Standard documentado vence; se o repo endossa o que a baseline flagaria, suprima o smell.
- **Sempre julgamento.** Smell é heurística rotulada (“possível Feature Envy”), nunca violação dura — e ignore o que a ferramenta (linter/CI) já cobre.

Cada smell: *o que é* → *como corrigir*; case no diff:

- **Mysterious Name** — nome que não revela o que faz/guarda. → renomear; se não houver nome honesto, o desenho está turvo.
- **Duplicated Code** — mesma forma de lógica em mais de um hunk/arquivo. → extrair forma compartilhada.
- **Feature Envy** — método que mexe mais nos dados de outro objeto que nos próprios. → mover o método para os dados que inveja.
- **Data Clumps** — mesmos campos/params viajam juntos. → agrupar num tipo e passar esse tipo.
- **Primitive Obsession** — primitivo/string no lugar de conceito de domínio. → tipo pequeno próprio.
- **Repeated Switches** — mesmo `switch`/`if` no mesmo tipo em vários pontos. → polimorfismo ou um mapa compartilhado.
- **Shotgun Surgery** — uma mudança lógica espalha edits em muitos arquivos. → reunir o que muda junto.
- **Divergent Change** — um módulo editado por razões não relacionadas. → fatiar por razão de mudança.
- **Speculative Generality** — abstração/hooks para necessidade que a Spec não tem. → apagar; inline até necessidade real.
- **Message Chains** — `a.b().c().d()` que o caller não deveria conhecer. → esconder atrás de um método.
- **Middle Man** — classe/função que só delega. → cortar; chamar o alvo.
- **Refused Bequest** — subtipo que ignora a maior parte do que herda. → composição em vez de herança.

### 4. Disparar os dois eixos em paralelo

Quando o harness tiver subtarefas/agentes: uma mensagem com **dois** jobs em paralelo (`generalPurpose` ou equivalente). Se não houver: rode os dois eixos em sequência na mesma sessão, mantendo seções separadas.

**Prompt Standards** — incluir:

- Comando do diff + lista de commits.
- Paths de standards encontrados **mais a baseline de smells colada por completo**.
- Brief: “Reporte — por arquivo/hunk quando couber — (a) cada violação de standard documentado: cite arquivo + regra; (b) cada smell da baseline: nomeie e cite o hunk. Distinga violação dura (só standard documentado) de julgamento (smells). Repo override baseline. Pule o que tooling já cobre. Menos de 400 palavras. Em pt-BR.”

**Prompt Spec** — incluir:

- Diff + commits.
- Conteúdo da Issue (`problem` / critérios) e/ou Spec.
- Brief: “Reporte: (a) requisitos pedidos e ausentes/parciais; (b) comportamento no diff fora do pedido (scope creep); (c) requisitos que parecem feitos mas a implementação parece errada. Cite a linha da Spec/Issue em cada achado. Menos de 400 palavras. Em pt-BR.”

Sem Spec: pule o subagente Spec e anote no relatório final.

### 5. Agregar

Apresente sob `## Standards` e `## Spec`, verbatim ou levemente limpo. **Não** mescle nem reordene achados entre eixos.

Feche com uma linha: totais por eixo e o pior achado *dentro de cada eixo* (se houver). Sem vencedor único entre eixos.

### 6. Depois do relatório (no fluxo Implement)

- Bloqueantes de Spec / standards do repo: corrija antes de `AWAITING`.
- Julgamentos: corrija o óbvio ou registre no comentário de `AWAITING`.
- Não abra TAG=`QA` daqui.

## Por que dois eixos

Uma mudança pode passar num eixo e falhar no outro:

- Segue standards mas implementa a coisa errada → Standards ok, Spec falha.
- Faz o que a Issue pediu mas quebra convenções → Spec ok, Standards falha.

Separar impede um eixo mascarar o outro.

## Limites

Obtida via [`implement-phase`](../implement-phase/SKILL.md). Não carregue skills de Planning/Design/QA/Deployment neste claim.

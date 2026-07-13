---
name: handoff
description: >-
  Compacta a conversa atual em documento de handoff para outro agente/sessão.
  Use sob TAG=Planning (ou quando planning-phase indicar) ao trocar harness ou
  sessão (user-invoked).
disable-model-invocation: true
argument-hint: "Para que será a próxima sessão?"
---

# handoff

Escreva um documento que permita a um agente **fresco** continuar o trabalho. Salve no **diretório temporário do SO** do usuário — não no workspace do produto (evita commit acidental de rascunho de sessão).

Adaptada de [mattpocock/skills · handoff](https://github.com/mattpocock/skills). Idioma: **pt-BR**.

## Conteúdo

1. **Objetivo da próxima sessão** — se o humano passou argumentos, use-os como foco.
2. **Estado atual** — o que está feito / em aberto / bloqueado.
3. **Artefatos** — referencie por caminho ou título de Issue; **não** duplique specs, plans, ADRs, Issues, commits ou diffs já persistidos.
4. **Issues-local** — projeto, títulos das Issues relevantes, status (`CLAIMED`/`AWAITING`/…), owner se houver; ids só como apoio ao título.
5. **Skills sugeridas** — respeite progressive disclosure: `sdlc-workflow` → skill `*-phase` da TAG → skills concretas da fase. Não sugira pack inteiro nem skills de outra TAG sem motivo.
6. **Próximos passos concretos** — comandos issues-local se aplicável (`issues next`, `status AWAITING`, etc.).

## Segurança

Redija chaves de API, senhas, tokens e PII.

## Limites

Obtida via [`planning-phase`](../planning-phase/SKILL.md) neste workflow de novo desenvolvimento. Em troca de sessão no meio de Planning, prefira sugerir de novo `planning-phase` + as concretas já em uso (`wayfinder`, `domain-modeling`, …).

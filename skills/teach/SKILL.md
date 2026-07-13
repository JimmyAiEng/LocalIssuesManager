---
name: teach
description: >-
  Ensina um conceito ou habilidade ao humano neste workspace, em várias sessões.
  Use sob TAG=Planning quando o humano pedir ensino (user-invoked).
disable-model-invocation: true
argument-hint: "Sobre o que você quer aprender?"
---

# teach

Pedido com estado: o humano quer aprender o tópico ao longo de várias sessões. Trate o diretório atual como **workspace de ensino**.

Adaptada de [mattpocock/skills · teach](https://github.com/mattpocock/skills). Idioma dos artefatos e da condução: **pt-BR** (a menos que o humano peça outro).

## Workspace de ensino

| Artefato | Papel |
|---|---|
| `MISSION.md` | Motivo do aprendizado — [MISSION-FORMAT.md](./MISSION-FORMAT.md) |
| `./reference/*.html` | Referências comprimidas (cola, glossários, algoritmos) |
| `RESOURCES.md` | Fontes de conhecimento e comunidades — [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md) |
| `./learning-records/*.md` | Insights tipo ADR do aprendizado — [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md) |
| `./lessons/*.html` | Unidade principal de ensino (uma coisa bem escopada) |
| `./assets/*` | Componentes reutilizáveis entre lições |
| `NOTES.md` | Preferências do aprendiz e notas de trabalho |
| Glossário do tópico | Preferir `GLOSSARY.md` no workspace de ensino ([GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md)); não misturar com `CONTEXT.md` do produto salvo se for o mesmo domínio e o humano pedir |

## Filosofia

Três pilares: **conhecimento** (fontes de alta confiança), **habilidades** (lições interativas), **sabedoria** (comunidade / prática real). Antes de `RESOURCES.md` estar povoado, priorize achar fontes — não confie só em conhecimento paramétrico.

Separe **fluência** (recuperação no momento) de **força de armazenamento** (retenção). Desenhe lições com dificuldade desejável: prática de recuperação, espaçamento, intercalação (só em prática de skill).

## Lições

Uma lição = um HTML em `./lessons/0001-<slug>.html` (incremente). Curta, bela (tipografia legível), uma vitória tangível, zona de desenvolvimento proximal, ligada à missão. Cite fontes. Recomende uma fonte primária. Lembre o humano de perguntar follow-ups ao agente-professor. Abra o arquivo no harness quando possível.

## Assets

Reutilize `./assets/` por padrão. Stylesheet compartilhado é o primeiro componente. Nada de código inline que a próxima lição copiaria.

## Missão

Sem missão clara, entreviste o humano antes de ensinar. Atualize `MISSION.md` quando o objetivo mudar; confirme com o humano; registre learning record.

## Zona de desenvolvimento proximal

Leia learning-records + missão. Ensine o próximo passo desafiador “na medida”.

## Conhecimento vs skill vs sabedoria

- Conhecimento: só o necessário à skill da lição; citações; dificuldade atrapalha.
- Skills: feedback loop apertado (quizzes, passos reais); opções de quiz com mesmo comprimento tipográfico.
- Sabedoria: tente responder, mas encaminhe a comunidade de alta reputação; respeite opt-out.

## issues-local

Se o ensino estiver amarrado a uma Issue Planning: progresso relevante pode ir no comentário de `AWAITING`/`CLOSED`. Não use esta skill para substituir `domain-modeling` do produto — glossário de produto continua em `CONTEXT.md`.

## Limites

Obtida via [`planning-phase`](../planning-phase/SKILL.md). Não carregue Design/Implement/QA/Deployment neste claim.

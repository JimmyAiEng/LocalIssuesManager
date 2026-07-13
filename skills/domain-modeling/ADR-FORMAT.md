# Formato de ADR

ADRs vivem em `docs/adr/` com numeração sequencial: `0001-slug.md`, `0002-slug.md`, …

Crie `docs/adr/` só quando o primeiro ADR for necessário.

## Template

```md
# {Título curto da decisão}

{1–3 frases: contexto, o que decidimos, por quê.}
```

Um ADR pode ser um parágrafo. O valor é registrar *que* houve decisão e *por quê*.

## Seções opcionais

Só se agregarem valor:

- **Status** (`proposed | accepted | deprecated | superseded by ADR-NNNN`)
- **Opções consideradas** — quando as rejeitadas valem lembrar
- **Consequências** — efeitos downstream não óbvios

## Numeração

Leia o maior número em `docs/adr/` e some um.

## Quando oferecer ADR

As três devem ser verdadeiras:

1. **Difícil de reverter**
2. **Surpreendente sem contexto**
3. **Trade-off real**

### O que costuma qualificar

- Forma arquitetural; padrões de integração entre contextos
- Tecnologia com lock-in relevante
- Fronteiras e escopo (“não” explícito conta)
- Desvio deliberado do caminho óbvio
- Restrições invisíveis no código
- Alternativas rejeitadas quando a rejeição não é óbvia

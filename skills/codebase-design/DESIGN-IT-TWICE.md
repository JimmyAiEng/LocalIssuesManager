# Design It Twice

Quando o humano (ou a Issue) pede explorar interfaces alternativas para um candidato a aprofundar. Base: “Design It Twice” (Ousterhout) — a primeira ideia raramente é a melhor.

Vocabulário: [SKILL.md](SKILL.md). Dependências: [DEEPENING.md](DEEPENING.md).

## Processo

### 1. Enquadrar o espaço do problema

Antes dos subagents, escreva em linguagem de produto:

- Restrições que qualquer interface nova deve satisfazer
- Dependências e categoria (DEEPENING)
- Esboço ilustrativo (não proposta) para concretizar restrições

Mostre ao humano e siga imediatamente ao passo 2 (ele lê enquanto os agentes trabalham).

### 2. Subagents em paralelo

Lance 3+ subagents. Cada um produz interface **radicalmente diferente**.

Restrições sugeridas por agente:

1. Minimizar interface (1–3 entry points); máxima alavancagem.
2. Maximizar flexibilidade / casos de uso.
3. Otimizar o caller mais comum (default trivial).
4. (Se couber) Ports & adapters para dependências cross-seam.

Cada saída: interface · exemplo de uso · o que a implementação esconde · estratégia de dependências · trade-offs.

Inclua glossário desta skill + `CONTEXT.md` do projeto no brief.

### 3. Comparar e parar

Apresente lado a lado (profundidade, localidade, colocação do seam). **Não escolha** — isso é o **gate de direção**. Após a escolha humana, siga para `prototype` (se preciso) ou `to-spec`.

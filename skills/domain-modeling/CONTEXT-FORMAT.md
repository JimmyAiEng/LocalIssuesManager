# Formato do CONTEXT.md

## Estrutura

```md
# {Nome do contexto}

{Uma ou duas frases: o que é este contexto e por que existe.}

## Language

**Order**:
{Uma ou duas frases definindo o termo}
_Avoid_: Purchase, transaction

**Invoice**:
Pedido de pagamento enviado ao cliente após a entrega.
_Avoid_: Bill, payment request
```

A seção chama-se `Language` (compatível com o formato upstream). Definições e prosa de apoio da skill em **pt-BR**; termos canônicos do domínio ficam no idioma que o projeto já usa.

## Regras

- **Seja opinativo.** Várias palavras para o mesmo conceito → escolha uma e liste o resto em `_Avoid_`.
- **Definições curtas.** No máximo uma ou duas frases. O que o termo *é*, não o que ele *faz* no código.
- **Só termos deste contexto.** Conceitos gerais de programação não entram.
- **Agrupe** sob subtítulos quando surgirem clusters naturais.

## Repo de um vs vários contextos

**Um contexto:** `CONTEXT.md` na raiz.

**Vários:** `CONTEXT-MAP.md` na raiz lista contextos, caminhos e relações.

Inferência:

- Existe `CONTEXT-MAP.md` → leia-o
- Só `CONTEXT.md` na raiz → contexto único
- Nenhum → crie `CONTEXT.md` na raiz quando o primeiro termo for resolvido

Se houver vários e o tópico for ambíguo, pergunte.

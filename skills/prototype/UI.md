# Protótipo de UI (UI)

Várias variantes **estruturalmente** diferentes numa rota, trocáveis por `?variant=` e barra flutuante. Prefira embutir na página real (subforma A).

Se a pergunta é lógica/estado → [LOGIC.md](LOGIC.md).

Pré-requisito: worktree (`SKILL.md`). Todo o código de variante/switcher fica no worktree — não na branch de produto.

## Quando usar

- “Como esta página deveria parecer?”
- Comparar layouts antes de comprometer Spec/Implement.

## Subformas

### A — ajuste numa página existente (preferida)

Mesma rota; só o render troca por `?variant=`. Mantém fetch/auth/dados reais. Use sempre que houver página hospedeira plausível.

### B — página nova (último recurso)

Só se não houver hospedeira. Rota throwaway com `prototype` no path, mesma convenção de roteamento do projeto.

## Processo

### 1. Pergunta + N

Default **3** variantes (máx. 5). Uma linha no topo: pergunta + chaves `?variant=`.

### 2. Variantes radicalmente diferentes

Layout, hierarquia e affordance primária distintos — não só cor/copy. Nomes exportados (`VariantA`, …). Respeite o design system do projeto **dentro do worktree**.

### 3. Switcher

```tsx
// pseudo — adapte ao framework do projeto
const variant = searchParams.get('variant') ?? 'A';
return (
  <>
    {variant === 'A' && <VariantA {...data} />}
    {variant === 'B' && <VariantB {...data} />}
    {variant === 'C' && <VariantC {...data} />}
    <PrototypeSwitcher variants={['A','B','C']} current={variant} />
  </>
);
```

### 4. Barra flutuante

Centro-inferior: ← · rótulo da variante · →. Atualiza search param (shareable). Setas do teclado (exceto em inputs). Visualmente óbvia como chrome de proto. Esconda em builds de produção.

### 5. Entregue URL + chaves; capture e limpe

Registre qual variante (ou mix) venceu e por quê na Issue Design. Remova variantes/switcher com o worktree — **não** promova código de proto a produção sem reescrever na fase Implement (TDD).

## Anti-padrões

- Variantes só cosméticas.
- Layout compartilhado demais entre variantes (derrota o ponto).
- Mutações reais sem stub.
- Merge do proto na default branch.

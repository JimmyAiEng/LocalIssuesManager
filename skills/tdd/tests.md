# Bons e maus testes

## Bons testes

Estilo integração no seam: interfaces reais, sem mock do miolo.

```typescript
// BOM: comportamento observável
test("usuário conclui checkout com carrinho válido", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Características:

- Comportamento que callers/usuários importam
- Só API pública
- Sobrevive a refactor interno
- Descreve O QUÊ, não COMO
- Uma asserção lógica por teste

## Maus testes

**Detalhe de implementação** — acoplado à estrutura interna.

```typescript
// RUIM: detalhe de implementação
test("checkout chama paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

Sinais de alerta:

- Mock de colaboradores internos
- Métodos privados
- Contagem/ordem de calls
- Quebra no refactor sem mudança de comportamento
- Nome descreve COMO, não O QUÊ
- Verificação por meio externo em vez da interface

```typescript
// RUIM: contorna a interface
test("createUser grava no banco", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// BOM: verifica pela interface
test("createUser torna o usuário recuperável", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**Tautológicos** — o esperado repete a implementação; passa por construção.

```typescript
// RUIM: esperado recalculado como o código
test("calculateTotal soma itens", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// BOM: literal independente
test("calculateTotal soma itens", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```

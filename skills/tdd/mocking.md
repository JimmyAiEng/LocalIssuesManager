# Quando mockar

Mock **só em fronteiras de sistema**:

- APIs externas (pagamento, e-mail, etc.)
- Bancos (às vezes — preferir DB de teste)
- Tempo / aleatoriedade
- Sistema de arquivos (às vezes)

Não mocke:

- Suas próprias classes/módulos
- Colaboradores internos
- O que você controla

## Desenhar para mockabilidade

Nas fronteiras, interfaces fáceis de mockar:

**1. Injeção de dependência**

Passe dependências externas em vez de criá-las por dentro:

```typescript
// Fácil de mockar
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Difícil de mockar
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. Prefira interfaces estilo SDK a fetchers genéricos**

Uma função por operação externa, não um fetch único com lógica condicional no mock:

```typescript
// BOM: cada função mockável à parte
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch("/orders", { method: "POST", body: data }),
};

// RUIM: mock precisa de condicionais
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

Abordagem SDK:

- Cada mock devolve um shape específico
- Sem lógica condicional no setup do teste
- Fica claro quais endpoints o teste exercita
- Tipagem por endpoint

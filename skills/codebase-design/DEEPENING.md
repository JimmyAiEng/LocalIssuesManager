# Aprofundar (DEEPENING)

Como aprofundar um cluster de módulos rasos com segurança, dadas as dependências. Vocabulário em [SKILL.md](SKILL.md).

## Categorias de dependência

### 1. In-process

Computação pura / estado em memória, sem I/O. Sempre aprofundável — funda os módulos e testa pela nova interface. Sem adapter.

### 2. Local-substitutable

Dependências com stand-in local (PGLite, FS em memória). Aprofundável se o stand-in existir. Seam interno; sem port na interface externa.

### 3. Remoto mas próprio (Ports & Adapters)

Seus serviços além da rede. Defina **port** no seam; lógica no módulo profundo; transporte injetado como **adapter**. Testes: adapter in-memory. Produção: HTTP/gRPC/fila.

### 4. Externo de verdade (Mock)

Terceiros (Stripe, etc.). Módulo recebe port injetado; testes usam mock adapter.

## Disciplina de seam

- Um adapter = seam hipotético; dois = seam real.
- Seams internos (só da implementação/testes) ≠ interface externa.

## Teste: substituir, não empilhar

- Testes unitários dos módulos rasos viram lixo quando há testes na interface aprofundada — apague-os.
- Novos testes na interface do módulo aprofundado (comportamento observável).
- Testes devem sobreviver a refactors internos.

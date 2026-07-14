export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

// Agregado inexistente: a camada HTTP mapeia para 404.
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// Escrita sobre snapshot obsoleto (optimistic lock): a camada HTTP mapeia para 409.
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

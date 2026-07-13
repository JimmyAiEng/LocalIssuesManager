# Queue is a concrete repository (no infra port)

`Queue` vive em `src/domain/queue_repository.ts` como classe concreta que executa comandos Linux (`mv`, `mkdir`, listagem de dirs) sobre `~/issues-manager/...`. Não há Port nem pasta `infra/`: o repositório de domínio *é* o mecanismo de persistência. Escolhido para menos abstração (FF-05) e menos pastas.

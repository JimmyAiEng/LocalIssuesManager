# Domain folder + Queue repository

Código organizado em `src/domain/` (`*_entity|vo|repository`) e `src/app/*_use_case.ts`. `IssueStore` e `IssueApp` monolíticos foram descartados: persistência e FIFO vivem no repositório `Queue`; cada RF é um use case.

**Superseded in part by ADR-0003:** a ideia de Port + `infra/fs_queue_repository.ts` foi abandonada; `Queue` é classe concreta com shell/FS.

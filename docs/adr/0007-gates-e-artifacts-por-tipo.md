# ADR 0007 — Gates e Artifacts agrupados por tipo

- Status: aceito
- Data: 2026-07-18
- Supersede a organização de módulos da ADR 0006, sem alterar suas regras de negócio.

## Contexto

As definições de gate e as validações de Artifact estavam espalhadas entre arquivos de domínio e aplicação. Isso dificultava comparar Actions e identificar, de forma uniforme, seus requisitos.

## Decisão

- `src/domain/gates/` contém um Gate para cada Action e um contrato comum com três dimensões: Artifacts, execução de código e aprovação humana.
- Cada dimensão declara `none`, `required` ou `conditional`, com condição descritiva quando aplicável.
- `gateFor(action)` seleciona uma cópia da definição do Gate.
- `src/domain/artifacts/` contém apenas o padrão comum, o store compatível e os tipos `MediaArtifact`, `DocumentArtifact`, `RequirementArtifact`, `UmlArtifact` e `ImplementationPlanArtifact`.
- PRD e Requirements são dois nomes públicos para o mesmo `RequirementArtifact`: um conjunto de Features Gherkin.
- I/O e execução de PlantUML, Git e checks continuam na aplicação; o domínio apenas declara a necessidade e valida os fatos recebidos.
- O layout físico persistido e os contratos CLI/HTTP permanecem inalterados.

## Consequências

A matriz de gates fica inspecionável e testável, e novos tipos de Artifact têm um local único para suas invariantes. Requisitos condicionais, como PlantUML em Design e checks configuráveis em Implement, tornam-se explícitos sem levar efeitos externos para o domínio.

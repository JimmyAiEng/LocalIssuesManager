---
name: planning-phase
description: >-
  Action Planning do workflow: alinhar problema, requisitos e domínio, e entregar
  requisitos Gherkin válidos. Use quando a Issue reivindicada tem action=Planning.
---

Estude o problema da Issue, o repositório do projeto e me entreviste ativamente sobre cada aspecto até termos um entendimento comum do que deve ser feito.
Busque identificar os requisitos funcionais e não funcionais, e resolva as dúvidas por meio de grupos de 3 perguntas.
Para cada pergunta, sugira uma resposta, e espere o feedback do grupo antes de continuar.
Se um *fato* puder ser encontrado explorando o codebase ou o texto da Issue, explore-o em vez de perguntar.
As decisões de requisitos funcionais, contudo, são do humano.

**Heurísticas**:
- Escopo grande demais para uma sessão → feche esta Issue e **crie Issues menores relacionadas** (`--relates`).
- Foque nos requisitos funcionais, descritos em termos do usuário/domínio, não da solução.
- **Como** planejar (pesquisa, glossário, ADRs, etc.) é decisão do agente.

**Entrega (gate de conclusão)**:
Requisitos como Features Gherkin (pt-BR), no máximo 5 e cada uma breve:
`issues requirements set --id <id> --file <req.json>`.
Full PRD (visão, requisitos funcionais e não-funcionais, e clusters que agrupam as Features por semelhança):
`issues prd set --id <id> --file <prd.json>`.
Cada Feature Gherkin pertence a **exatamente um** cluster (nenhuma solta, nenhuma repetida); cada cluster origina uma Issue Design.
Registre o resumo do alinhamento no Artefato: `issues artifact --id <id> --file <a.md>`.

**Decomposição obrigatória (fan-out 1→N)**:
O gate exige **uma filha `action=Design` por cluster** do PRD antes de fechar.
Descreva as filhas num JSON e crie-as de uma vez: `issues decompose --id <id> --into <arquivo.json> --agent <ia>`.
Formato: `{ "mode": "concurrent|sequential", "children": [{ "title", "type", "action": "Design", "problem", "acceptance_criteria?", "cluster?" }] }`.
A filha Design recebe no prompt apenas as Features do seu cluster — para o casamento, inclua o **nome do cluster no título** da filha (ex.: título `Design <cluster>`).
`decompose` já grava a linhagem parent/child recíproca; `mode: sequential` encadeia as filhas (see-also) para execução em ordem, `concurrent` (default) deixa-as independentes.

**Encerramento**:
Conclua com a evidência (o que foi alinhado, decisões tomadas):
`issues status --id <id> --agent <ia> --status AWAITING|CLOSED --comment "<evidência>" [--reason concluido]`.
Sem requisitos válidos, PRD válido **e uma filha Design por cluster**, o comando falha apontando o cluster descoberto — entregue os três antes.

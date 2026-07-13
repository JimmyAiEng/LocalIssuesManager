# Baseline de smells (eixo Standards)

Heurísticas de Fowler (*Refactoring*, cap. 3).
Duas regras de aplicação:

- **O repo manda.** Standard documentado vence; se o repo endossa o que a baseline flagaria, suprima o smell.
- **Sempre julgamento.** Smell é heurística rotulada (“possível Feature Envy”), nunca violação dura — e ignore o que a ferramenta (linter/CI) já cobre.

Cada smell: *o que é* → *como corrigir*; case no diff:

- **Mysterious Name** — nome que não revela o que faz/guarda. → renomear; se não houver nome honesto, o desenho está turvo.
- **Duplicated Code** — mesma forma de lógica em mais de um hunk/arquivo. → extrair forma compartilhada.
- **Feature Envy** — método que mexe mais nos dados de outro objeto que nos próprios. → mover o método para os dados que inveja.
- **Data Clumps** — mesmos campos/params viajam juntos. → agrupar num tipo e passar esse tipo.
- **Primitive Obsession** — primitivo/string no lugar de conceito de domínio. → tipo pequeno próprio.
- **Repeated Switches** — mesmo `switch`/`if` no mesmo tipo em vários pontos. → polimorfismo ou um mapa compartilhado.
- **Shotgun Surgery** — uma mudança lógica espalha edits em muitos arquivos. → reunir o que muda junto.
- **Divergent Change** — um módulo editado por razões não relacionadas. → fatiar por razão de mudança.
- **Speculative Generality** — abstração/hooks para necessidade que a Spec não tem. → apagar; inline até necessidade real.
- **Message Chains** — `a.b().c().d()` que o caller não deveria conhecer. → esconder atrás de um método.
- **Middle Man** — classe/função que só delega. → cortar; chamar o alvo.
- **Refused Bequest** — subtipo que ignora a maior parte do que herda. → composição em vez de herança.

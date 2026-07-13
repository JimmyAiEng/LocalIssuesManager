# Filesystem layout for Issues

Persistência local usa um JSON por Issue sob `~/issues-manager/projects/<project>/{open,claimed,awaiting,closed}/<id>.json`. Listagem e `next` leem pela pasta de status; transição move o arquivo. Escolhido em vez de um único `store.json` para que a fila e filtros por projeto/status sejam navegação de diretório, alinhada ao uso single-user no disco.

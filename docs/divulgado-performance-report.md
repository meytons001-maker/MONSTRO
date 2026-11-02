# DIVULGADO — relatório de performance do Radar

Data: 2026-11-02. Base: Salvador, competência 2026-10, cobertura `full`.

## Causa encontrada

O DuckDB não estava travado pelo volume. Com os filtros XMenu, bairro BARRA, ativa, telefone e e-mail, a consulta direta quente levou 237–240 ms e retornou 326 registros. O endpoint, porém, recalculava todos os indicadores nacionais antes de cada pesquisa e as duas operações entravam sequencialmente na fila global do arquivo. A integração também iniciou carteira e pesquisa juntas e recarregava a carteira em cada troca de módulo.

Havia ainda uma falha operacional reproduzida: executar `next build` enquanto `next dev` usava o mesmo `.next` deixou o servidor com `Cannot find module './313.js'`. A API retornava erro enquanto a interface permanecia com aparência de pesquisa em andamento.

## Correção

- serialização por arquivo DuckDB preservada;
- indicadores cacheados no processo por cinco minutos;
- carteira carregada somente depois da pesquisa inicial e não em cada navegação;
- CNPJ com 14 dígitos usa igualdade exata em vez de busca textual com curingas;
- cabeçalho `Server-Timing`, objeto `timing` e log estruturado adicionados à API;
- timeout de 15 segundos, cancelamento, proteção contra respostas antigas e preservação dos últimos resultados válidos;
- filtros digitados não alteram a paginação ou exportação até uma pesquisa ser concluída;
- estados inicial, carregando, sucesso, vazio, cancelado e erro são explícitos.

## Medições

### Antes

Consulta DuckDB direta, três execuções:

| execução | dashboard | busca | total encontrado |
|---|---:|---:|---:|
| fria | 478 ms | 324 ms | 326 |
| quente 1 | 129 ms | 240 ms | 326 |
| quente 2 | 100 ms | 237 ms | 326 |

Cada requisição da API pagava dashboard + busca. O servidor de desenvolvimento corrompido respondeu em cerca de 4 s com HTTP 500.

### Depois

API limpa, mesma consulta:

| execução | métricas | DuckDB | API | cliente |
|---|---:|---:|---:|---:|
| primeira, com compilação/cache frio | 755 ms | 543 ms | 1.748 ms | 5.951 ms |
| quente 1 | 0 ms | 460 ms | 461 ms | 512 ms |
| quente 2 | 0 ms | 436 ms | 437 ms | 493 ms |
| quente 3 | 0 ms | 381 ms | 382 ms | 430 ms |

No navegador, Barra concluiu em 837 ms após atualização do cliente; Pituba em 441 ms; CNPJ exato em 182 ms (API 141 ms); consulta vazia em 156 ms. O tempo da primeira linha inclui compilação do Next em desenvolvimento e não representa o build de produção.

## Validação funcional

- Barra/XMenu/ativa/telefone/e-mail: 326 resultados, 7 páginas.
- Pituba com os mesmos filtros, via Enter: 504 resultados, 11 páginas.
- CNPJ `00068709000129`: BOND TINTAS, um resultado.
- CNPJ inexistente: estado vazio explícito, sem zero prematuro.
- cancelamento: mensagem explícita e resultado anterior preservado.
- API desligada: erro compreensível, filtros e resultado preservados; após reinício, `Tentar novamente` recuperou a consulta.
- dossiê BOND TINTAS, carteira persistente e listas reabriram normalmente.
- navegação entre os módulos não dispara novas consultas de carteira.

## Limitações

O cancelamento interrompe a espera do navegador, mas uma consulta já entregue ao processo nativo pode terminar no servidor antes de liberar a fila. A fila não foi removida porque protege o arquivo DuckDB local. Em produção, build e servidor devem usar artefatos/processos separados; não se deve executar `next build` sobre o mesmo `.next` de um `next dev` ativo.


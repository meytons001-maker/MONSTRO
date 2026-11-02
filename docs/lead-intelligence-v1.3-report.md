# MONSTRO Lead Intelligence V1.3 — relatório de validação

Data: 2026-11-01  
Branch: `codex/lead-intelligence-v1`  
Base: competência `2026-10`, cobertura `full`

## Consolidação

- Acesso ao DuckDB serializado por caminho em fila compartilhada no processo.
- Listas mantêm itens e histórico persistentes.
- Dossiês são consultados por CNPJ e mantêm cadastro separado da carteira comercial.
- Erros de banco, módulo e fonte pública são registrados no servidor e apresentados sem dados estáticos.
- Teste concorrente cobre dashboard e listas sobre o mesmo arquivo.

## Enriquecimento público

O enriquecimento recebe uma URL candidata explicitamente, resolve DNS e bloqueia endereços locais, privados, link-local e credenciais em URL. A consulta aceita somente HTTP/HTTPS, usa timeout de 10 segundos, até três redirecionamentos e HTML de até 1 MB.

Site oficial só é confirmado quando a página contém o CNPJ exato. Correspondência com o domínio do e-mail cadastral permanece como `site_candidate`, pois o domínio pode pertencer a contador ou prestador.

## Amostra controlada

Regra reproduzível: 20 estabelecimentos ativos, um por domínio empresarial válido e não gratuito, ordenados por CNPJ.

| Resultado | Total |
| --- | ---: |
| Empresas processadas | 20 |
| Sites oficiais confirmados por CNPJ | 2 |
| Empresas com canais comerciais em fonte confirmada | 2 |
| Empresas com conflito confirmado | 1 |
| Sem enriquecimento confirmado | 18 |
| Adicionadas à carteira de pesquisa | 20 |

Os resultados pertencem somente à amostra e não representam a cobertura de Salvador. Falhas incluíram DNS inexistente, conexão indisponível e páginas sem CNPJ suficiente para confirmar identidade.

Casos confirmados observados: Login Informática (`00066716000191`) e Bond Tintas (`00068709000129`). Na Bond Tintas, telefone e e-mail divulgados divergiram do cadastro, permanecendo registrados com fonte, URL, data e conflito.

## Carteira e persistência

O dossiê permite registrar produto ou pesquisa neutra, responsável, estágio, observações, próxima atividade e interações. O teste funcional registrou a Bond Tintas como `qualified`, responsável `Equipe Comercial`, próxima atividade em `2026-11-15 10:00`, e uma nota de acompanhamento. Os dados permaneceram após encerrar e reiniciar o servidor.

Nenhum envio de WhatsApp, e-mail, ligação ou campanha foi ativado.

## Comandos de validação

```text
packages\lead-intelligence\node_modules\.bin\tsx.CMD --test packages\lead-intelligence\test\lead-intelligence.test.ts
apps\web\node_modules\.bin\tsc.CMD --noEmit -p apps\web\tsconfig.json
apps\web\node_modules\.bin\next.CMD build apps\web
packages\lead-intelligence\node_modules\.bin\tsx.CMD packages\lead-intelligence\src\cli.ts enrich-sample --db data\lead-intelligence.duckdb --limit 20
```


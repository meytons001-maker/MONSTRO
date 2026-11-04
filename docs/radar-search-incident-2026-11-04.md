# Incidente — Radar preso em “Pesquisando…”

Data: 2026-11-04. Branch: `codex/lead-intelligence-v1`.

## Causa comprovada

O DuckDB não estava lento: a consulta Barra + XMenu + ativa + telefone + e-mail retornou 326 registros em 543 ms antes da correção. O problema observável estava entre autenticação e cliente:

1. a sessão Auth.js havia expirado;
2. o middleware respondia a chamadas `/api/*` com `307` para `/login` e HTML, embora o cliente esperasse JSON;
3. o cliente não distinguia sessão expirada de falha genérica;
4. a instância Next dev estava órfã, criada no dia anterior, sem logs acessíveis e com artefatos `.next` misturados entre build e desenvolvimento.

Também foi encontrada uma regressão independente: `EMPRESA-INEXISTENTE-2026` usava apenas os dígitos `2026` na condição de CNPJ e retornava falsos resultados.

## Correções

- APIs protegidas retornam `401 application/json` quando a sessão expira;
- cliente detecta 401/HTML inesperado, encerra loading, preserva resultados e oferece “Entrar novamente”;
- telemetria separa fila, execução DuckDB e API;
- fila registra espera superior a 2 s e expõe profundidade/atividade;
- busca alfanumérica não é convertida em fragmento de CNPJ;
- testes cobrem sessão expirada, HTML inesperado, nome com dígitos e concorrência com Radar de Inaugurações;
- processo Next antigo e cache `.next` foram substituídos por uma instância limpa.

## Medições

Antes, diretamente no banco: dashboard 558 ms, busca Barra 543 ms, total 1.101 ms, 326 registros.

Após aquecimento e instrumentação direta:

- Barra: fila 0 ms, DuckDB 409 ms, 326 registros;
- Pituba: fila 0 ms, DuckDB 199 ms, 504 registros;
- CNPJ `60498117000179`: fila 0 ms, DuckDB 56 ms, 1 registro;
- consulta inexistente alfanumérica: fila 0 ms, DuckDB 454 ms, 0 registros;
- consulta concorrente Barra + Inaugurações: 1.082 ms, sem deadlock;
- resposta sem sessão: antes `307 text/html`; depois `401 application/json`.

## Validação

- typecheck aprovado;
- 36 testes aprovados (15 Lead Intelligence, 6 Web, 10 Core, 5 Runtime);
- build Next.js aprovado;
- dados DuckDB preservados.

O login autenticado continua sendo digitado exclusivamente pelo administrador; senhas não são automatizadas nem registradas.

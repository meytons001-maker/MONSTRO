# MONSTRO Online — auditoria e implantação privada

## Situação auditada

- O DuckDB cadastral ocupa `314.847.232` bytes (~300 MiB). Ele é adequado para consultas analíticas de uma única instância, mas requer volume persistente e apenas um processo escritor.
- Antes desta entrega, todas as rotas `/api/lead-intelligence/*`, `/api/commercial-intelligence/*` e `/api/alpha/*` eram acessíveis sem autenticação.
- O fallback do banco apontava para `data/lead-intelligence.duckdb`; em produção deve ser definido `MONSTRO_LEAD_DB` dentro de um volume persistente.
- Carteira, interações, listas e enriquecimento ainda são gravados no DuckDB. A migração para PostgreSQL foi preparada, mas não executada sem banco de destino e backup aprovado.
- O enriquecimento HTTP já bloqueia redes privadas, limita redirecionamentos, resposta e tempo. Instagram não é consultado por login nem por automação que contorne controles.

## Arquitetura recomendada

1. Serviço web privado Railway, construído pelo `Dockerfile`, uma réplica e volume persistente montado em `/data`.
2. PostgreSQL gerenciado para autenticação e dados comerciais mutáveis.
3. DuckDB somente para cadastro e análise, em `/data/lead-intelligence.duckdb`.
4. HTTPS e domínio gerenciados pela plataforma; staging separado, protegido pela mesma autenticação.
5. Backup diário do PostgreSQL e cópia versionada do DuckDB antes de cada competência.

O serviço não deve escalar horizontalmente enquanto houver escrita transacional no DuckDB. A migração completa para PostgreSQL remove essa limitação.

## Segurança implementada

- Auth.js Credentials com sessão JWT assinada e cookies seguros em produção.
- bcrypt com custo 12; senha nunca é registrada.
- conta administrativa criada/rotacionada somente pelo script `bootstrap-admin`.
- limite de cinco falhas por e-mail/IP em quinze minutos, persistido no PostgreSQL.
- middleware protege páginas e APIs; somente login, Auth.js, health check e ativos PWA são públicos.
- headers contra framing, MIME sniffing e permissões desnecessárias.
- PWA não intercepta nem armazena `/api/*`; offline exibe apenas uma página informativa.

## Migração e restauração

1. Parar escritas e copiar o DuckDB para arquivo datado; validar tamanho e SHA-256.
2. Aplicar `infra/postgres/migrations/001_online_foundation.sql` em staging dentro de transação.
3. Criar a conta com `ADMIN_EMAIL`/`ADMIN_PASSWORD` temporários e `pnpm --filter @monstro/web bootstrap-admin`; remover essas variáveis após o uso.
4. Migrar carteira/listas em lotes idempotentes pelo CNPJ e produto. Conferir contagens antes de trocar os endpoints.
5. Rollback: apontar a aplicação para o DuckDB preservado e restaurar o snapshot PostgreSQL anterior. A migração nunca apaga o DuckDB.

## Recursos e custos

Fatos: são necessários um serviço Node com volume persistente, PostgreSQL, HTTPS e backups. Estimativa inicial: 1–2 vCPU, 1–2 GiB RAM e 2–5 GiB de volume para aplicação, DuckDB, temporários e crescimento. Preços variam por provedor e data; devem ser consultados no momento do provisionamento. Nenhum serviço pago foi contratado nesta entrega.

## Variáveis de produção

`AUTH_SECRET`, `AUTH_URL`, `DATABASE_URL`, `DATABASE_SSL`, `MONSTRO_LEAD_DB` e opcionalmente `PG_POOL_MAX`. Segredos nunca entram no repositório.

## Pendências antes da URL real

- provisionar staging e PostgreSQL mediante autorização;
- executar backup e migração transacional;
- validar login, restauração e performance no ambiente hospedado;
- configurar domínio apenas após aprovação;
- desenvolver o coletor sob demanda de presença digital e resumo histórico usando fontes explicitamente autorizadas.

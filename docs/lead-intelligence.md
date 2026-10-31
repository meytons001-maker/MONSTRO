# MONSTRO Lead Intelligence V1

Módulo comercial separado do motor Alpha. Ele usa DuckDB para consultar Parquet público da Receita Federal por meio do espelho CNPJ Aberto, persiste a seleção localmente e mantém dados cadastrais separados dos dados de CRM.

## Fonte e cobertura

- Fonte primária: dados abertos do CNPJ da Receita Federal.
- Espelho colunar: `cnpjaberto/cnpj-dados-receita-brasil-2026-10` no Hugging Face.
- Competência padrão: `2026-10`; atualização do espelho registrada como `2026-10-19`.
- Salvador: código RFB/TOM `3849`; código IBGE `2927408`.
- Situação ativa: código `02`.

Cada execução registra competência, URL, data, filtro, quantidade e cobertura (`sample` ou `full`). Uma execução limitada nunca é apresentada como carga completa.

## Importação

```powershell
# amostra verificável (padrão: 1.000 ativos)
pnpm --filter @monstro/lead-intelligence import:salvador -- --db C:\dados\leads.duckdb --limit 1000

# carga integral da competência (requer tempo, rede e espaço em disco)
pnpm --filter @monstro/lead-intelligence import:salvador -- --db C:\dados\leads.duckdb --limit full

# incluir situações inativas
pnpm --filter @monstro/lead-intelligence import:salvador -- --db C:\dados\leads.duckdb --limit full --all-statuses
```

O modo padrão substitui controladamente os estabelecimentos da mesma competência e município. `--no-relations` permite validar rapidamente somente estabelecimentos; sem essa opção, empresas e QSA são relacionados pela raiz de oito dígitos.

## CRM e conformidade

O esquema inclui empresas, estabelecimentos, sócios, contatos comerciais, interesses por produto, leads, oportunidades, interações, propostas, campanhas e preferências de conformidade. Contatos comerciais e dados cadastrais não compartilham a mesma tabela.

Automação comercial permanece desativada na V1. Uma evolução segura deve usar fila com limites diários, deduplicação, opt-out antes do envio, aprovação humana de mensagens/propostas, templates aprovados por canal e auditoria imutável. Nenhum e-mail, WhatsApp, ligação ou publicação é disparado por este módulo.

## Segmentação

Os conjuntos de CNAE de XMenu e Cotare ficam em `packages/lead-intelligence/src/config.ts`. São filtros de potencial, não afirmações de compatibilidade, preço, comissão ou autorização comercial.

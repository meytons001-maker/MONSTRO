import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ACTIVE_STATUS, DEFAULT_COMPETENCE, DEFAULT_DATASET, SALVADOR_RFB_CODE } from "./config.js";
import { rows, sql, withDatabase } from "./duckdb.js";
import { SCHEMA_SQL } from "./schema.js";

export interface ImportOptions {
  databasePath: string;
  competence?: string;
  dataset?: string;
  activeOnly?: boolean;
  limit?: number | null;
  mode?: "replace-competence" | "upsert";
  includeRelations?: boolean;
  sourceDirectory?: string;
}

function parquetUrls(dataset: string, table: "estabelecimentos" | "empresas" | "socios", parts = 10, sourceDirectory?: string) {
  return Array.from({ length: parts }, (_, index) =>
    sourceDirectory
      ? resolve(sourceDirectory, table, `${table}${index}.parquet`).replaceAll("\\", "/")
      : `https://huggingface.co/datasets/${dataset}/resolve/main/${table}/${table}${index}.parquet`,
  );
}

function parquetList(urls: string[]) { return `[${urls.map(sql).join(",")}]`; }

export async function initializeDatabase(databasePath: string) {
  await withDatabase(databasePath, async (connection) => { await connection.run(SCHEMA_SQL); });
}

export async function importSalvador(options: ImportOptions) {
  const competence = options.competence ?? DEFAULT_COMPETENCE;
  const dataset = options.dataset ?? DEFAULT_DATASET;
  const activeOnly = options.activeOnly ?? true;
  const mode = options.mode ?? "replace-competence";
  const limit = options.limit ?? null;
  const sourceUrl = `https://huggingface.co/datasets/${dataset}`;
  const statusFilter = activeOnly ? `AND situacao_cadastral = ${sql(ACTIVE_STATUS)}` : "";
  const limitSql = limit === null ? "" : `LIMIT ${Math.max(1, Math.trunc(limit))}`;

  return withDatabase(options.databasePath, async (connection) => {
    await connection.run(SCHEMA_SQL);
    await connection.run(`CREATE OR REPLACE TEMP TABLE salvador_stage AS
      SELECT cnpj_basico || cnpj_ordem || cnpj_dv AS cnpj, cnpj_basico, cnpj_ordem, cnpj_dv,
        identificador_matriz_filial, nome_fantasia, situacao_cadastral, data_situacao_cadastral,
        motivo_situacao_cadastral, data_inicio_atividade, cnae_fiscal_principal,
        cnae_fiscal_secundaria, tipo_logradouro, logradouro, numero, complemento, bairro, cep, uf,
        municipio, concat_ws('', ddd1, telefone1) AS phone_1,
        concat_ws('', ddd2, telefone2) AS phone_2, correio_eletronico
      FROM read_parquet(${parquetList(parquetUrls(dataset, "estabelecimentos", 10, options.sourceDirectory))}, union_by_name=true)
      WHERE municipio = ${sql(SALVADOR_RFB_CODE)} ${statusFilter} ${limitSql}`);

    await connection.run("BEGIN TRANSACTION");
    try {
      if (mode === "replace-competence") {
        await connection.run(`DELETE FROM establishments WHERE source_competence = ${sql(competence)} AND municipality_code = ${sql(SALVADOR_RFB_CODE)}`);
      }
      await connection.run(`INSERT OR REPLACE INTO establishments
        SELECT cnpj, cnpj_basico, cnpj_ordem, cnpj_dv, identificador_matriz_filial, nullif(trim(nome_fantasia), ''),
          situacao_cadastral, data_situacao_cadastral, motivo_situacao_cadastral, data_inicio_atividade,
          cnae_fiscal_principal, cnae_fiscal_secundaria, tipo_logradouro, logradouro, numero, complemento,
          bairro, cep, uf, municipio, nullif(phone_1, ''), nullif(phone_2, ''),
          nullif(trim(correio_eletronico), ''), ${sql(competence)}, ${sql(sourceUrl)}, current_timestamp
        FROM salvador_stage`);

      if (options.includeRelations !== false) {
        await connection.run(`CREATE OR REPLACE TEMP TABLE roots AS SELECT DISTINCT cnpj_basico FROM salvador_stage`);
        await connection.run(`INSERT OR REPLACE INTO companies
          SELECT e.cnpj_basico, e.razao_social, e.natureza_juridica, e.qualificacao_responsavel,
            try_cast(replace(e.capital_social, ',', '.') AS DECIMAL(18,2)), e.porte_empresa,
            e.ente_federativo, ${sql(competence)}
          FROM read_parquet(${parquetList(parquetUrls(dataset, "empresas", 10, options.sourceDirectory))}, union_by_name=true) e
          INNER JOIN roots r USING (cnpj_basico)`);
        await connection.run(`DELETE FROM partners WHERE source_competence = ${sql(competence)} AND cnpj_root IN (SELECT cnpj_basico FROM roots)`);
        await connection.run(`INSERT INTO partners
          SELECT DISTINCT md5(concat_ws('|', s.cnpj_basico, s.identificador_socio, s.nome_socio,
            s.cpf_cnpj_socio, s.qualificacao_socio, s.data_entrada_sociedade)),
            s.cnpj_basico, s.identificador_socio, s.nome_socio, s.cpf_cnpj_socio,
            s.qualificacao_socio, s.data_entrada_sociedade, s.pais, s.representante_legal,
            s.nome_representante, s.qualificacao_representante, s.faixa_etaria, ${sql(competence)}
          FROM read_parquet(${parquetList(parquetUrls(dataset, "socios", 10, options.sourceDirectory))}, union_by_name=true) s
          INNER JOIN roots r USING (cnpj_basico)
          QUALIFY row_number() OVER (PARTITION BY md5(concat_ws('|', s.cnpj_basico, s.identificador_socio,
            s.nome_socio, s.cpf_cnpj_socio, s.qualificacao_socio, s.data_entrada_sociedade))
            ORDER BY s.nome_socio, s.cpf_cnpj_socio) = 1`);
      }

      const count = Number((await rows(connection, "SELECT count(*) AS total FROM salvador_stage"))[0]?.total ?? 0);
      const runId = randomUUID();
      await connection.run(`INSERT INTO import_runs VALUES (${sql(runId)}, ${sql(competence)}, ${sql(sourceUrl)},
        DATE '2026-10-19', current_timestamp, ${sql(SALVADOR_RFB_CODE)}, ${activeOnly},
        ${sql(limit === null ? "full" : "sample")}, ${limit === null ? "NULL" : limit}, ${count})`);
      await connection.run("COMMIT");
      return { runId, competence, sourceUrl, importedRows: count, coverage: limit === null ? "full" : "sample", activeOnly };
    } catch (error) {
      await connection.run("ROLLBACK");
      throw error;
    }
  });
}

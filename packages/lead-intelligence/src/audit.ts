import { rows, withDatabase } from "./duckdb.js";

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}

export async function auditDatabase(databasePath: string) {
  return withDatabase(databasePath, async (connection) => normalize({
    summary: (await rows(connection, `SELECT count(*) total_rows, count(DISTINCT cnpj) unique_cnpjs,
      count(*) FILTER (WHERE registration_status='02') active,
      count(*) FILTER (WHERE phone_1 IS NOT NULL OR phone_2 IS NOT NULL) with_phone,
      count(*) FILTER (WHERE email IS NOT NULL) with_email,
      count(*)-count(DISTINCT cnpj) duplicates
      FROM establishments WHERE municipality_code='3849' AND source_competence='2026-10'`))[0],
    companies: (await rows(connection, "SELECT count(*) total FROM companies WHERE source_competence='2026-10'"))[0],
    partners: (await rows(connection, "SELECT count(*) total FROM partners WHERE source_competence='2026-10'"))[0],
    neighborhoods: await rows(connection, `SELECT coalesce(nullif(trim(neighborhood),''),'NÃO INFORMADO') key, count(*) total
      FROM establishments WHERE municipality_code='3849' AND source_competence='2026-10' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
    cnaes: await rows(connection, `SELECT primary_cnae key, count(*) total FROM establishments
      WHERE municipality_code='3849' AND source_competence='2026-10' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
    run: (await rows(connection, "SELECT * FROM import_runs ORDER BY imported_at DESC LIMIT 1"))[0],
  }));
}

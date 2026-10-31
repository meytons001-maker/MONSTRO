import { SEGMENTS, type ProductSegment } from "./config.js";
import { rows, sql, withDatabase, type Row } from "./duckdb.js";

function jsonValue(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonValue(nested)]));
  return value;
}

function numbers(row: Row): Row {
  return jsonValue(row) as Row;
}

function segmentPredicate(product?: ProductSegment) {
  if (!product) return "TRUE";
  return `e.primary_cnae IN (${SEGMENTS[product].map(sql).join(",")})`;
}

export interface SearchOptions { query?: string; product?: ProductSegment; active?: boolean; limit?: number; offset?: number; }

export async function dashboard(databasePath: string) {
  return withDatabase(databasePath, async (connection) => {
    const summary = numbers((await rows(connection, `SELECT count(*) total,
      count(*) FILTER (WHERE registration_status='02') active,
      count(*) FILTER (WHERE phone_1 IS NOT NULL OR phone_2 IS NOT NULL) with_phone,
      count(*) FILTER (WHERE email IS NOT NULL) with_email FROM establishments`))[0] ?? {});
    const [cnaes, neighborhoods, source, incomplete] = await Promise.all([
      rows(connection, "SELECT primary_cnae key, count(*) total FROM establishments GROUP BY 1 ORDER BY 2 DESC LIMIT 12"),
      rows(connection, "SELECT coalesce(nullif(neighborhood,''),'NÃO INFORMADO') key, count(*) total FROM establishments GROUP BY 1 ORDER BY 2 DESC LIMIT 12"),
      rows(connection, "SELECT competence, coverage, imported_rows, imported_at, source_url FROM import_runs ORDER BY imported_at DESC LIMIT 1"),
      rows(connection, "SELECT count(*) total FROM establishments WHERE trade_name IS NULL OR (phone_1 IS NULL AND phone_2 IS NULL) OR email IS NULL"),
    ]);
    return { summary, cnaes: cnaes.map(numbers), neighborhoods: neighborhoods.map(numbers), source: source[0] ? numbers(source[0]) : null, incomplete: numbers(incomplete[0] ?? {}) };
  });
}

export async function searchEstablishments(databasePath: string, options: SearchOptions = {}) {
  const term = options.query?.replace(/\D/g, "") || options.query?.trim() || "";
  const search = term ? `AND (e.cnpj ILIKE ${sql(`%${term}%`)} OR c.legal_name ILIKE ${sql(`%${options.query?.trim()}%`)} OR e.trade_name ILIKE ${sql(`%${options.query?.trim()}%`)})` : "";
  const active = options.active === undefined ? "" : `AND e.registration_status = ${sql(options.active ? "02" : "08")}`;
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  const offset = Math.max(0, options.offset ?? 0);
  return withDatabase(databasePath, async (connection) => (await rows(connection, `SELECT e.*, c.legal_name,
      CASE WHEN e.primary_cnae IN (${SEGMENTS.xmenu.map(sql).join(",")}) THEN true ELSE false END xmenu,
      CASE WHEN e.primary_cnae IN (${SEGMENTS.cotare.map(sql).join(",")}) THEN true ELSE false END cotare
    FROM establishments e LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root
    WHERE ${segmentPredicate(options.product)} ${search} ${active}
    ORDER BY coalesce(c.legal_name,e.trade_name,e.cnpj) LIMIT ${limit} OFFSET ${offset}`)).map(numbers));
}

export async function exportCsv(databasePath: string, options: SearchOptions = {}) {
  const records = await searchEstablishments(databasePath, { ...options, limit: 500 });
  if (!records.length) return "cnpj,razao_social,nome_fantasia,cnae,bairro,telefone,email\n";
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return ["cnpj,razao_social,nome_fantasia,cnae,bairro,telefone,email", ...records.map((r) => [r.cnpj, r.legal_name, r.trade_name, r.primary_cnae, r.neighborhood, r.phone_1, r.email].map(quote).join(","))].join("\n");
}

import { randomUUID } from "node:crypto";
import { SEGMENTS, type ProductSegment } from "./config.js";
import { rows, sql, withDatabase, type Row } from "./duckdb.js";
import { SCHEMA_SQL } from "./schema.js";

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

export interface SearchOptions { query?: string; product?: ProductSegment; active?: boolean; neighborhood?: string; cnaes?: string[]; hasPhone?: boolean; hasEmail?: boolean; limit?: number; offset?: number; }

function searchWhere(options: SearchOptions) {
  const digits = options.query?.replace(/\D/g, "") ?? "";
  const raw = options.query?.trim() ?? "";
  const search = raw ? digits.length === 14
    ? `AND e.cnpj = ${sql(digits)}`
    : `AND (e.cnpj ILIKE ${sql(`%${digits || raw}%`)} OR c.legal_name ILIKE ${sql(`%${raw}%`)} OR e.trade_name ILIKE ${sql(`%${raw}%`)})` : "";
  const active = options.active === undefined ? "" : `AND e.registration_status ${options.active ? "=" : "<>"} '02'`;
  const neighborhood = options.neighborhood ? `AND e.neighborhood ILIKE ${sql(`%${options.neighborhood.trim()}%`)}` : "";
  const cnaes = options.cnaes?.length ? `AND e.primary_cnae IN (${options.cnaes.map(sql).join(",")})` : "";
  const phone = options.hasPhone ? "AND (e.phone_1 IS NOT NULL OR e.phone_2 IS NOT NULL)" : "";
  const email = options.hasEmail ? "AND e.email IS NOT NULL" : "";
  return `${segmentPredicate(options.product)} ${search} ${active} ${neighborhood} ${cnaes} ${phone} ${email}`;
}

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
  const limit = Math.min(100_000, Math.max(1, options.limit ?? 100));
  const offset = Math.max(0, options.offset ?? 0);
  return withDatabase(databasePath, async (connection) => (await rows(connection, `SELECT e.*, c.legal_name,
      CASE WHEN e.primary_cnae IN (${SEGMENTS.xmenu.map(sql).join(",")}) THEN true ELSE false END xmenu,
      CASE WHEN e.primary_cnae IN (${SEGMENTS.cotare.map(sql).join(",")}) THEN true ELSE false END cotare
    FROM establishments e LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root
    WHERE ${searchWhere(options)}
    ORDER BY coalesce(c.legal_name,e.trade_name,e.cnpj) LIMIT ${limit} OFFSET ${offset}`)).map(numbers));
}

export async function searchEstablishmentsPage(databasePath: string, options: SearchOptions = {}) {
  const limit = Math.min(250, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  return withDatabase(databasePath, async (connection) => {
    const total = Number((await rows(connection, `SELECT count(*) total FROM establishments e LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root WHERE ${searchWhere(options)}`))[0]?.total ?? 0);
    const items = (await rows(connection, `SELECT e.*, c.legal_name,
      CASE WHEN e.primary_cnae IN (${SEGMENTS.xmenu.map(sql).join(",")}) THEN true ELSE false END xmenu,
      CASE WHEN e.primary_cnae IN (${SEGMENTS.cotare.map(sql).join(",")}) THEN true ELSE false END cotare
      FROM establishments e LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root WHERE ${searchWhere(options)}
      ORDER BY coalesce(c.legal_name,e.trade_name,e.cnpj) LIMIT ${limit} OFFSET ${offset}`)).map(numbers);
    return { items, total, limit, offset, page: Math.floor(offset / limit) + 1, pages: Math.max(1, Math.ceil(total / limit)) };
  });
}

export async function exportCsv(databasePath: string, options: SearchOptions = {}) {
  const records = await searchEstablishments(databasePath, { ...options, limit: Math.min(100_000, options.limit ?? 100_000), offset: 0 });
  if (!records.length) return "cnpj,razao_social,nome_fantasia,cnae,bairro,telefone,email\n";
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return ["cnpj,razao_social,nome_fantasia,cnae,bairro,telefone,email", ...records.map((r) => [r.cnpj, r.legal_name, r.trade_name, r.primary_cnae, r.neighborhood, r.phone_1, r.email].map(quote).join(","))].join("\n");
}

export async function getEstablishmentDossier(databasePath: string, cnpj: string) {
  return withDatabase(databasePath, async (connection) => {
    const establishments = await rows(connection, `SELECT e.*, c.legal_name,
      CASE WHEN e.primary_cnae IN (${SEGMENTS.xmenu.map(sql).join(",")}) THEN true ELSE false END xmenu,
      CASE WHEN e.primary_cnae IN (${SEGMENTS.cotare.map(sql).join(",")}) THEN true ELSE false END cotare
      FROM establishments e LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root WHERE e.cnpj=${sql(cnpj)} LIMIT 1`);
    if (!establishments[0]) return null;
    const partners = await rows(connection, `SELECT partner_type, partner_name, qualification, entry_date, age_range, source_competence FROM partners WHERE cnpj_root=${sql(String(establishments[0].cnpj_root))} ORDER BY partner_name`);
    return { establishment: numbers(establishments[0]), partners: partners.map(numbers) };
  });
}

export interface CreateProspectListInput { name: string; product?: ProductSegment; cnpjs: string[]; }

export async function listProspectLists(databasePath: string) {
  return withDatabase(databasePath, async (connection) => {
    await connection.run(SCHEMA_SQL);
    return (await rows(connection, `SELECT l.id,l.name,l.product,cast(l.created_at AS VARCHAR) created_at,cast(l.updated_at AS VARCHAR) updated_at,count(i.cnpj) company_count FROM prospect_lists l LEFT JOIN prospect_list_items i ON i.list_id=l.id GROUP BY l.id,l.name,l.product,l.created_at,l.updated_at ORDER BY l.updated_at DESC`)).map(numbers);
  });
}

export async function createProspectList(databasePath: string, input: CreateProspectListInput) {
  const name = input.name.trim();
  if (!name) throw new Error("O nome da lista é obrigatório.");
  const cnpjs = [...new Set(input.cnpjs.map((value) => value.replace(/\D/g, "")).filter((value) => value.length === 14))];
  if (!cnpjs.length) throw new Error("Selecione ao menos um CNPJ válido.");
  const id = randomUUID();
  return withDatabase(databasePath, async (connection) => {
    await connection.run(SCHEMA_SQL);
    const existing = await rows(connection, `SELECT cnpj FROM establishments WHERE cnpj IN (${cnpjs.map(sql).join(",")})`);
    const valid = existing.map((row) => String(row.cnpj));
    if (!valid.length) throw new Error("Nenhum CNPJ selecionado existe na base atual.");
    await connection.run("BEGIN TRANSACTION");
    try {
      await connection.run(`INSERT INTO prospect_lists (id,name,product) VALUES (${sql(id)},${sql(name)},${input.product ? sql(input.product) : "NULL"})`);
      for (const cnpj of valid) await connection.run(`INSERT INTO prospect_list_items (list_id,cnpj) VALUES (${sql(id)},${sql(cnpj)})`);
      await connection.run(`INSERT INTO prospect_list_history (id,list_id,action,details) VALUES (${sql(randomUUID())},${sql(id)},'created',${sql(JSON.stringify({ companyCount: valid.length }))})`);
      await connection.run("COMMIT");
    } catch (error) { await connection.run("ROLLBACK"); throw error; }
    return { id, name, product: input.product ?? null, companyCount: valid.length };
  });
}

export async function getProspectList(databasePath: string, id: string) {
  return withDatabase(databasePath, async (connection) => {
    await connection.run(SCHEMA_SQL);
    const list = (await rows(connection, `SELECT id,name,product,cast(created_at AS VARCHAR) created_at,cast(updated_at AS VARCHAR) updated_at FROM prospect_lists WHERE id=${sql(id)} LIMIT 1`))[0];
    if (!list) return null;
    const [items, history] = await Promise.all([
      rows(connection, `SELECT e.cnpj,e.trade_name,e.primary_cnae,e.neighborhood,e.registration_status,c.legal_name FROM prospect_list_items i JOIN establishments e ON e.cnpj=i.cnpj LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root WHERE i.list_id=${sql(id)} ORDER BY coalesce(e.trade_name,c.legal_name,e.cnpj)`),
      rows(connection, `SELECT action,details,cast(occurred_at AS VARCHAR) occurred_at FROM prospect_list_history WHERE list_id=${sql(id)} ORDER BY occurred_at DESC`),
    ]);
    return { ...numbers(list), items: items.map(numbers), history: history.map(numbers) };
  });
}


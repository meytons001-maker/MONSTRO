import { DuckDBInstance } from "@duckdb/node-api";

export type Row = Record<string, unknown>;

export async function withDatabase<T>(path: string, work: (connection: Awaited<ReturnType<DuckDBInstance["connect"]>>) => Promise<T>) {
  const instance = await DuckDBInstance.create(path);
  const connection = await instance.connect();
  try { return await work(connection); } finally { connection.closeSync(); instance.closeSync(); }
}

export async function rows(connection: Awaited<ReturnType<DuckDBInstance["connect"]>>, sql: string): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql);
  const result = reader.getRowObjects() as Row[];
  reader.closeSync();
  return result;
}

export function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

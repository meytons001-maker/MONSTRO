import "server-only";
import { Pool } from "pg";

let pool: Pool | undefined;

export function postgres() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  return pool;
}

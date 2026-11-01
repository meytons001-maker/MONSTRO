import { DuckDBInstance } from "@duckdb/node-api";

export type Row = Record<string, unknown>;

const queueKey = "__monstroDuckDbQueues" as const;
type QueueGlobal = typeof globalThis & { [queueKey]?: Map<string, Promise<void>> };

function queues() {
  const shared = globalThis as QueueGlobal;
  shared[queueKey] ??= new Map<string, Promise<void>>();
  return shared[queueKey];
}

export async function withDatabase<T>(path: string, work: (connection: Awaited<ReturnType<DuckDBInstance["connect"]>>) => Promise<T>) {
  const databaseQueues = queues();
  const previous = databaseQueues.get(path) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => gate);
  databaseQueues.set(path, tail);
  await previous.catch(() => {});
  try {
    const instance = await DuckDBInstance.create(path);
    const connection = await instance.connect();
    try { return await work(connection); } finally { connection.closeSync(); instance.closeSync(); }
  } finally {
    release();
    if (databaseQueues.get(path) === tail) databaseQueues.delete(path);
  }
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


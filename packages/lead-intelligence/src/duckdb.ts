import { DuckDBInstance } from "@duckdb/node-api";

export type Row = Record<string, unknown>;

const queueKey = "__monstroDuckDbQueueStatesV2" as const;
const timingKey = "__monstroDuckDbTimings" as const;
type QueueState = { tail: Promise<void>; waiting: number; activeSince?: number };
export type DatabaseTiming = { queueWaitMs: number; executionMs: number; updatedAt: string };
type QueueGlobal = { [queueKey]?: Map<string, QueueState>; [timingKey]?: Map<string, DatabaseTiming> };

function queues() {
  const shared = globalThis as QueueGlobal;
  const value=shared[queueKey]??new Map<string,QueueState>();shared[queueKey]=value;return value;
}

function timings() { const shared=globalThis as QueueGlobal;const value=shared[timingKey]??new Map<string,DatabaseTiming>();shared[timingKey]=value;return value; }
export function getDatabaseQueueStatus(path:string){const state=queues().get(path);const timing=timings().get(path);return{waiting:state?.waiting??0,active:Boolean(state?.activeSince),activeMs:state?.activeSince?Date.now()-state.activeSince:0,last:timing??null}}

export async function withDatabase<T>(path: string, work: (connection: Awaited<ReturnType<DuckDBInstance["connect"]>>) => Promise<T>) {
  const databaseQueues = queues();
  let state=databaseQueues.get(path);if(!state){state={tail:Promise.resolve(),waiting:0};databaseQueues.set(path,state)}
  const previous = state.tail;state.waiting+=1;const waitStarted=performance.now();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => gate);
  state.tail=tail;
  await previous.catch(() => {});
  const queueWaitMs=performance.now()-waitStarted;state.waiting-=1;state.activeSince=Date.now();const executionStarted=performance.now();
  if(queueWaitMs>2000)console.warn("[lead-intelligence:duckdb-queue]",JSON.stringify({path,queueWaitMs:Math.round(queueWaitMs),waiting:state.waiting}));
  try {
    const instance = await DuckDBInstance.create(path);
    const connection = await instance.connect();
    try { return await work(connection); } finally { connection.closeSync(); instance.closeSync(); }
  } finally {
    timings().set(path,{queueWaitMs:Math.round(queueWaitMs),executionMs:Math.round(performance.now()-executionStarted),updatedAt:new Date().toISOString()});
    state.activeSince=undefined;
    release();
    if (state.tail === tail) databaseQueues.delete(path);
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

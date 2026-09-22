import type { MonstroTask } from "@monstro/contracts";
import type { MissionEvent, MissionJournal } from "@monstro/core";

export interface MissionEventSink {
  append(event: MissionEvent): void | Promise<void>;
}

export interface MissionStreamOptions {
  task: MonstroTask;
  journal: MissionJournal;
  sink: MissionEventSink;
  execute(): Promise<unknown>;
  resumePhase?: string;
}

export function createMissionEventStream({ task, journal, sink, execute, resumePhase }: MissionStreamOptions): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const pending = new Set<Promise<void>>();
      const unsubscribePersistence = journal.subscribe((event) => {
        const write = Promise.resolve(sink.append(event)).then(() => undefined);
        pending.add(write);
        void write.finally(() => pending.delete(write));
      });
      const unsubscribeStream = journal.subscribe((event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      });

      try {
        await execute();
      } catch {
        // The orchestrator records mission.failed before rethrowing.
      } finally {
        unsubscribeStream();
        unsubscribePersistence();
        await Promise.allSettled([...pending]);
        controller.close();
      }
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Monstro-Task": task.id,
  };
  if (resumePhase) headers["X-Monstro-Resume"] = resumePhase;
  return new Response(stream, { headers });
}

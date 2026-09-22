import { mkdir, open, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MissionEvent } from "./mission.js";
import type { MissionJournalStore } from "./mission-store.js";

export interface FileMissionJournalStoreOptions {
  directory: string;
}

function cloneEvent(event: MissionEvent): MissionEvent {
  return {
    ...event,
    data: event.data ? structuredClone(event.data) : undefined,
  };
}

function safeTaskFileName(taskId: string): string {
  return `${encodeURIComponent(taskId)}.ndjson`;
}

export class FileMissionJournalStore implements MissionJournalStore {
  private readonly directory: string;
  private readonly appendQueues = new Map<string, Promise<void>>();

  constructor(options: FileMissionJournalStoreOptions) {
    this.directory = options.directory;
  }

  private pathFor(taskId: string): string {
    return join(this.directory, safeTaskFileName(taskId));
  }

  async append(event: MissionEvent): Promise<void> {
    const path = this.pathFor(event.taskId);
    const previous = this.appendQueues.get(event.taskId) ?? Promise.resolve();
    const next = previous.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const handle = await open(path, "a");
      try {
        await handle.writeFile(`${JSON.stringify(cloneEvent(event))}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    });

    this.appendQueues.set(event.taskId, next);
    try {
      await next;
    } finally {
      if (this.appendQueues.get(event.taskId) === next) this.appendQueues.delete(event.taskId);
    }
  }

  async listTaskIds(): Promise<readonly string[]> {
    let entries;
    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ndjson"))
      .flatMap((entry) => {
        try {
          return [decodeURIComponent(entry.name.slice(0, -".ndjson".length))];
        } catch {
          return [];
        }
      })
      .sort();
  }

  async load(taskId: string): Promise<readonly MissionEvent[]> {
    const pending = this.appendQueues.get(taskId);
    if (pending) await pending;

    let content: string;
    try {
      content = await readFile(this.pathFor(taskId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const events: MissionEvent[] = [];
    for (const [index, line] of content.split("\n").entries()) {
      if (!line.trim()) continue;
      let event: MissionEvent;
      try {
        event = JSON.parse(line) as MissionEvent;
      } catch (error) {
        throw new Error(`Invalid mission journal record at line ${index + 1} for ${taskId}`, { cause: error });
      }
      if (event.taskId !== taskId) {
        throw new Error(`Mission journal task mismatch at line ${index + 1}: expected ${taskId}, received ${event.taskId}`);
      }
      events.push(cloneEvent(event));
    }
    return events;
  }
}
